// Supabase Edge Function: invite-co-owner
//
// Sends an invite email to a new co-owner after the pet_co_owners record
// has already been created by the client.
//
// For users who don't yet have a Whisker Watch account, this mints a
// Supabase "invite" token via admin.generateLink() (creates the auth
// user, but — unlike admin.inviteUserByEmail() — does NOT send Supabase's
// own built-in email) and delivers it ourselves through the Resend-backed
// send-email system, using the 'co-owner-invitation' template.
//
// For an email that already belongs to an auth.users row, Supabase's
// admin API returns the identical "already registered"/422 error whether
// that's a genuinely-registered account (has a password, can log in) or
// someone who was invited before and never finished accepting (the
// auth.users row exists — created by a prior generateLink call — but no
// password was ever set). Those two cases need different handling: a
// real existing user just needs the access record (already created by
// the client); a stuck pending invite needs a fresh, redeemable link
// resent. See email_has_password() (migration 0020) for how we tell
// them apart, and resendPendingInvite() below for the recovery-link path
// used to re-invite the latter.
//
// Why not just use generateLink's ready-made action_link? That link
// points at the Supabase project's own auth domain, which the email
// system's CTA allowlist (isSafeEmailUrl, see _shared/email/utils.ts)
// deliberately rejects — CTA links in our branded email must only ever
// point back at a domain we actually own. So instead we build our own
// accept_url on our own domain (routing to /accept-invite, see
// src/pages/AcceptInvite.jsx) carrying the raw token_hash — the standard
// Supabase pattern for custom-email-provider invite flows. That page
// redeems the token via verifyOtp() and has the new co-owner set a
// password before landing on the pet's profile.
//
// Request body:
//   {
//     coOwnerEmail: string,   // required — who to invite
//     petName: string,        // required — shown in the email subject/body
//     petId: string,          // required — used to build the redirect URL
//   }
//
// Response:
//   { sent: true }                        — invite (or re-invite) email sent
//   { sent: false, reason: 'exists' }     — already a registered Whisker Watch user
//   { error: string }                     — something went wrong

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendEmail } from '../_shared/email/sendEmail.ts';
import { EmailServiceError } from '../_shared/email/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isAlreadyRegisteredError(error) {
  return error?.message?.toLowerCase().includes('already registered') || error?.status === 422;
}

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

    const { coOwnerEmail, petName, petId } = await req.json();
    if (!coOwnerEmail || !petName || !petId) {
      return new Response(JSON.stringify({ error: 'coOwnerEmail, petName, and petId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the service-role client for admin operations (inviting users).
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Test/demo accounts must never send real production email. The
    // pet_co_owners record already exists by the time this function
    // runs, so the sharing flow still works end-to-end for testing —
    // we just skip the actual outbound email.
    const { data: inviterProfile } = await adminClient
      .from('profiles')
      .select('account_type, first_name')
      .eq('id', userData.user.id)
      .single();
    if (inviterProfile?.account_type === 'test' || inviterProfile?.account_type === 'demo') {
      return new Response(JSON.stringify({ sent: false, reason: 'test_or_demo_account' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the app's own (owned) domain — required by the email system's
    // CTA allowlist (isSafeEmailUrl only permits www.wyskerwatch.com and
    // localhost). This must match one of those allowed hosts or sendEmail
    // below will reject accept_url as unsafe. Trailing slash(es) are
    // stripped so `${appUrl}/accept-invite` never produces a double slash
    // that the frontend's exact-match route wouldn't resolve; a missing
    // scheme (e.g. APP_URL set to "www.wyskerwatch.com" instead of
    // "https://www.wyskerwatch.com") is caught here with a clear error
    // instead of failing later as an opaque "unsafe URL" rejection.
    const rawAppUrl = Deno.env.get('APP_URL') ?? 'https://www.wyskerwatch.com';
    const appUrl = rawAppUrl.replace(/\/+$/, '');
    try {
      new URL(appUrl);
    } catch {
      console.error('APP_URL is not a valid absolute URL:', rawAppUrl);
      return new Response(JSON.stringify({ error: 'Server misconfiguration: invalid APP_URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Lands on a dedicated accept-invite screen (redeems the token, then
    // asks the new co-owner to set a password) rather than dropping them
    // straight into the pet profile with a passwordless session — see
    // src/pages/AcceptInvite.jsx.
    const acceptPageUrl = `${appUrl}/accept-invite`;

    // Creates the auth user (if new) and mints an invite token, but —
    // unlike admin.inviteUserByEmail() — does not send any email itself.
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: coOwnerEmail,
      options: {
        redirectTo: acceptPageUrl,
        data: {
          pet_name: petName,
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

      // "Already registered" covers two different situations that
      // Supabase's admin API can't distinguish for us: a genuinely
      // registered user (has a password, access record already grants
      // them the pet) vs. someone invited before who never finished
      // accepting (auth.users row exists from a prior generateLink call,
      // but no password was ever set — they can't log in at all).
      // email_has_password() (migration 0020) is the one place that
      // actually knows which, via a SECURITY DEFINER read of
      // auth.users.encrypted_password that isn't reachable any other
      // way from here.
      const { data: hasPassword, error: hasPasswordError } = await adminClient.rpc('email_has_password', {
        p_email: coOwnerEmail,
      });

      if (hasPasswordError) {
        // Fail closed to the previous, safe behavior: if we can't tell
        // the two cases apart, don't risk re-emailing a real existing
        // user a fresh sign-in link — just report them as already
        // registered, same as before this distinction existed.
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

      // Stuck pending invite. admin.generateLink({type:'invite'}) only
      // works for emails with no auth.users row yet, so re-inviting this
      // person needs a different link type — 'recovery' works for any
      // existing user regardless of confirmation/password state and
      // mints a fresh, redeemable token_hash the same way 'invite' does.
      const { data: recoveryLinkData, error: recoveryLinkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: coOwnerEmail,
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
    // session, then routes to /pet/{petId} once a password is set — see
    // the header comment for why we can't just use generateLink's own
    // action_link here. `type` is 'invite' for a first-time invite or
    // 'recovery' when re-inviting a stuck pending co-owner (see above).
    const acceptUrl = `${acceptPageUrl}?token_hash=${encodeURIComponent(tokenHash)}&type=${tokenType}&petId=${encodeURIComponent(petId)}`;

    // The pet_co_owners row was already created by the client before this
    // function ran (see InviteCoOwnerDialog.jsx) — look up its own id so
    // email_logs.related_entity_id actually correlates to that row rather
    // than reusing petId (a different table's id) under the same
    // 'pet_co_owners' related_entity_type label.
    const { data: coOwnerRow } = await adminClient
      .from('pet_co_owners')
      .select('id')
      .eq('pet_id', petId)
      .eq('co_owner_email', coOwnerEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    try {
      const emailResult = await sendEmail({
        to: coOwnerEmail,
        template: 'co-owner-invitation',
        variables: {
          owner_name: inviterProfile?.first_name || userData.user.email,
          pet_name: petName,
          accept_url: acceptUrl,
        },
        relatedEntityType: 'pet_co_owners',
        relatedEntityId: coOwnerRow?.id ?? petId,
        // Ensures a fresh email_logs row is always claimed and finalized
        // — including for a renderTemplate validation failure before any
        // network call is made — rather than silently leaving no trace
        // when no idempotency key is provided (sendEmail.ts only logs a
        // pre-send failure via the idempotency-claim row).
        idempotencyKey: crypto.randomUUID(),
      });

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
