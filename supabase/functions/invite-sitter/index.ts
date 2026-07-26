// Supabase Edge Function: invite-sitter
//
// Sends an invite email to a new sitter after the pet_sitter_access record
// has already been created by the client. Mirrors invite-co-owner/index.ts
// — see that function's header comment for the full rationale behind the
// generateLink/verifyOtp/accept-page approach; this function only differs
// where the sitter model itself differs from co-owners:
//
//   - No petName/petId is passed by the client (InviteSitterDialog.jsx only
//     has petSitId). This function looks up the pet_sits row itself and
//     joins pets to build the email's pet_names/start_date/end_date.
//   - The accept link carries petSitId (not petId) and a role=sitter marker
//     so AcceptInvite.jsx redirects to the Pets screen afterward, since a
//     pet-sit can cover multiple pets with no single profile to land on.
//   - email_logs correlates to the pet_sitter_access row's own id, not
//     petSitId — same reasoning as invite-co-owner's coOwnerRow lookup.
//
// Request body:
//   {
//     sitterEmail: string,   // required — who to invite
//     petSitId: string,      // required — used to look up pets/dates and build the redirect URL
//   }
//
// Response:
//   { sent: true }                        — invite (or re-invite) email sent
//   { sent: false, reason: 'exists' }     — already a registered Whisker Watch user
//   { sent: false, reason: 'test_or_demo_account' } — inviter is test/demo, no real email sent
//   { sent: false, reason: 'recipient_suppressed' } — invitee's address previously bounced/complained, no real email sent
//   { error: string }                     — something went wrong

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendEmail } from '../_shared/email/sendEmail.ts';
import { EmailServiceError } from '../_shared/email/types.ts';
import { getValidatedAppUrl } from '../_shared/appUrl.ts';
import { isAlreadyRegisteredError } from '../_shared/authErrors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller is an authenticated Supabase user.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { sitterEmail, petSitId } = await req.json();
    if (!sitterEmail || !petSitId) {
      return new Response(JSON.stringify({ error: 'sitterEmail and petSitId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the service-role client for admin operations (inviting users) and
    // for looking up pet_sits/pets, which the owner (not necessarily the
    // sitter) owns.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Only needed here for the email body's owner_name — the
    // test/demo suppression check itself now lives in sendEmail()
    // (passed sentByUserId below), not here.
    const { data: inviterProfile } = await adminClient
      .from('profiles')
      .select('first_name')
      .eq('id', userData.user.id)
      .single();

    // Look up the pet-sit and its pets ourselves — the client only has
    // petSitId, not pet names or dates, and fetching here avoids plumbing
    // extra props through PetSittingSection.jsx just to pass data this
    // function can look up directly.
    const { data: petSit, error: petSitError } = await adminClient
      .from('pet_sits')
      .select('pet_ids, start_date, end_date')
      .eq('id', petSitId)
      .eq('created_by', userData.user.id)
      .single();
    if (petSitError || !petSit) {
      console.error('pet_sits lookup error:', petSitError);
      return new Response(JSON.stringify({ error: 'Pet sitting period not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const petIds = petSit.pet_ids || [];
    let petNames = 'your pet(s)';
    if (petIds.length > 0) {
      const { data: pets } = await adminClient.from('pets').select('name').in('id', petIds);
      if (pets && pets.length > 0) {
        petNames = pets.map((p) => p.name).join(', ');
      }
    }

    // Use the app's own (owned) domain — required by the email system's
    // CTA allowlist (isSafeEmailUrl only permits www.wyskerwatch.com and
    // localhost). See _shared/appUrl.ts for the trailing-slash/scheme
    // validation this shares with invite-co-owner and sign-up.
    const appUrl = getValidatedAppUrl();
    if (!appUrl) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: invalid APP_URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Lands on the shared accept-invite screen (redeems the token, then
    // asks the new sitter to set a password), same as co-owner invites —
    // see src/pages/AcceptInvite.jsx. `role=sitter` tells that page to
    // redirect to the Pets screen afterward instead of a single pet's
    // profile, since a pet-sit can cover multiple pets.
    const acceptPageUrl = `${appUrl}/accept-invite`;

    // Creates the auth user (if new) and mints an invite token, but —
    // unlike admin.inviteUserByEmail() — does not send any email itself.
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: sitterEmail,
      options: {
        redirectTo: acceptPageUrl,
        data: {
          pet_names: petNames,
          invited_by: inviterProfile?.first_name || userData.user.email,
        },
      },
    });

    let tokenHash;
    let tokenType;

    if (linkError) {
      if (!isAlreadyRegisteredError(linkError)) {
        console.error('generateLink error:', linkError);
        return new Response(JSON.stringify({ error: linkError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // "Already registered" covers two different situations Supabase's
      // admin API can't distinguish for us — see invite-co-owner/index.ts's
      // header comment for the full explanation. email_has_password()
      // (migration 0020) is the one place that actually knows which.
      const { data: hasPassword, error: hasPasswordError } = await adminClient.rpc('email_has_password', {
        p_email: sitterEmail,
      });

      if (hasPasswordError) {
        // Fail closed: if we can't tell the two cases apart, don't risk
        // re-emailing a real existing user a fresh sign-in link.
        console.error('email_has_password error:', hasPasswordError);
        return new Response(JSON.stringify({ sent: false, reason: 'exists' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (hasPassword) {
        return new Response(JSON.stringify({ sent: false, reason: 'exists' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Stuck pending invite — mint a fresh, redeemable token via a
      // 'recovery' link, same as invite-co-owner.
      const { data: recoveryLinkData, error: recoveryLinkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: sitterEmail,
        options: { redirectTo: acceptPageUrl },
      });

      if (recoveryLinkError) {
        console.error('generateLink (recovery) error:', recoveryLinkError);
        return new Response(JSON.stringify({ error: recoveryLinkError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      tokenHash = recoveryLinkData?.properties?.hashed_token;
      tokenType = 'recovery';
    } else {
      tokenHash = linkData?.properties?.hashed_token;
      tokenType = 'invite';
    }

    if (!tokenHash) {
      console.error('generateLink returned no hashed_token');
      return new Response(JSON.stringify({ error: 'Failed to generate invite link' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // AcceptInvite.jsx reads these params, calls
    // supabase.auth.verifyOtp({ token_hash, type }) to establish the
    // session, then — because role=sitter — routes to /pets instead of
    // /pet/{petId} once a password is set.
    const acceptUrl = `${acceptPageUrl}?token_hash=${encodeURIComponent(tokenHash)}&type=${tokenType}&role=sitter&petSitId=${encodeURIComponent(petSitId)}`;

    // A re-invite (tokenType === 'recovery') reads as a reminder rather
    // than a first-time ask.
    const emailTemplate = tokenType === 'recovery' ? 'sitter-invitation-reminder' : 'sitter-invitation';

    // The pet_sitter_access row was already created by the client before
    // this function ran (see InviteSitterDialog.jsx) — look up its own id
    // so email_logs.related_entity_id correlates to that row rather than
    // reusing petSitId (a different table's id) under the same
    // 'pet_sitter_access' related_entity_type label.
    const { data: sitterAccessRow } = await adminClient
      .from('pet_sitter_access')
      .select('id')
      .eq('pet_sit_id', petSitId)
      .eq('sitter_email', sitterEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    try {
      const emailResult = await sendEmail({
        to: sitterEmail,
        template: emailTemplate,
        variables: {
          owner_name: inviterProfile?.first_name || userData.user.email,
          pet_names: petNames,
          start_date: petSit.start_date,
          end_date: petSit.end_date,
          accept_url: acceptUrl,
        },
        relatedEntityType: 'pet_sitter_access',
        relatedEntityId: sitterAccessRow?.id ?? petSitId,
        idempotencyKey: crypto.randomUUID(),
        // Lets sendEmail() itself decide whether this is a test/demo
        // account and suppress the real send — see
        // requirements-centralized-email-suppression.md.
        sentByUserId: userData.user.id,
      });

      if (emailResult.suppressed) {
        // suppressionReason distinguishes "sending account is test/demo"
        // from "this recipient address previously bounced/complained" —
        // see types.ts. The two mean different things to the frontend
        // (InviteSitterDialog.jsx branches on this reason string).
        return new Response(JSON.stringify({ sent: false, reason: emailResult.suppressionReason }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ sent: true, messageId: emailResult.messageId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      if (err instanceof EmailServiceError) {
        console.error('sendEmail error:', err.code, err.message);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }
  } catch (err) {
    console.error('Edge Function error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
