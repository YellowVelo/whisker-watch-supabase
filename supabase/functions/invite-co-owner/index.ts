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
// resent — using a 'recovery'-type generateLink() call (see below) and
// the 'co-owner-invitation-reminder' template instead, so the email
// reads as a nudge rather than a confusing duplicate first-time invite.
// See email_has_password() (migration 0020) for how the two cases are
// told apart.
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
// Spec 0077 (PA-10, PA-36) lockdown:
//   - Rate limit: 10 invite requests per person per hour, shared with
//     invite-sitter (_shared/inviteRateLimit.ts). Checked before anything
//     else, so refused requests count too.
//   - Only the pet's primary owner (pets.created_by — the only person who
//     can add co-owners since migration 0056) can send, and only for a
//     pending (not yet linked) pet_co_owners row for that address. Anything
//     else is 404 'Invite not found' and no email.
//   - The pet's name comes from the pets table; any petName in the body is
//     ignored (the browser used to choose what a branded email said).
//   - An address that already has an account gets the 'co-owner-added'
//     email and the SAME { sent: true } reply as a new address, so the
//     reply never reveals whether an account exists. Resend's messageId is
//     never returned (with it, anyone could fake a bounce — 0068 P0-4).
//
// Request body:
//   {
//     coOwnerEmail: string,   // required — who to invite
//     petId: string,          // required — the pet; also used in the accept URL
//     petName?: string,       // ignored since spec 0077 (looked up server-side)
//   }
//
// Response:
//   { sent: true }                        — invite, re-invite or "added you" email sent
//   { sent: false, reason: 'test_or_demo_account' } — inviter is test/demo, no real email sent
//   { sent: false, reason: 'recipient_suppressed' } — invitee's address previously bounced/complained, no real email sent
//   429 { error }                         — over the invite rate limit
//   404 { error: 'Invite not found' }     — not the primary owner, or no pending invite for that address
//   { error: string }                     — something went wrong

import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { sendEmail } from '../_shared/email/sendEmail.ts';
import { EmailServiceError } from '../_shared/email/types.ts';
import { getValidatedAppUrl } from '../_shared/appUrl.ts';
import { isAlreadyRegisteredError } from '../_shared/authErrors.ts';
import { GENERIC_ERROR, reportError, serverError } from '../_shared/errorReporting.ts';
import { checkInviteRateLimit } from '../_shared/inviteRateLimit.ts';
import { escapeLike } from '../_shared/escapeLike.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sends one email and turns the result into this function's reply. Never
// returns Resend's messageId (spec 0077).
async function sendAndRespond(opts: {
  to: string;
  template: string;
  variables: Record<string, string>;
  relatedEntityId: string;
  sentByUserId: string;
}): Promise<Response> {
  try {
    const emailResult = await sendEmail({
      to: opts.to,
      template: opts.template,
      variables: opts.variables,
      // email_logs correlates to the pet_co_owners row itself.
      relatedEntityType: 'pet_co_owners',
      relatedEntityId: opts.relatedEntityId,
      // Ensures a fresh email_logs row is always claimed and finalized,
      // including for a renderTemplate validation failure before any
      // network call (sendEmail.ts only logs a pre-send failure via the
      // idempotency-claim row).
      idempotencyKey: crypto.randomUUID(),
      // sendEmail() itself decides whether the sender is a test/demo
      // account and suppresses the real send — see
      // requirements-centralized-email-suppression.md.
      sentByUserId: opts.sentByUserId,
    });

    if (emailResult.suppressed) {
      // suppressionReason distinguishes "sending account is test/demo"
      // from "this recipient address previously bounced/complained"
      // (types.ts); InviteCoOwnerDialog.jsx branches on it.
      return new Response(JSON.stringify({ sent: false, reason: emailResult.suppressionReason }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof EmailServiceError) {
      // Spec 0078 (PA-35): the email provider's own message stays in the
      // log and Sentry, not the reply.
      console.error('sendEmail error:', err.code, err.message);
      reportError(err, { function: 'invite-co-owner', step: 'send_email', code: String(err.code) });
      return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
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

    // Use the service-role client for admin operations (inviting users).
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Spec 0077: rate limit first, so every request past the login check
    // counts — including ones refused below.
    const rate = await checkInviteRateLimit(adminClient, userData.user.id);
    if (rate === 'unavailable') {
      return new Response(JSON.stringify({ error: 'Unable to process this request right now' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rate === 'limited') {
      return new Response(JSON.stringify({ error: "You've sent a lot of invites in the last hour. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { coOwnerEmail, petId } = await req.json();
    if (!coOwnerEmail || !petId) {
      return new Response(JSON.stringify({ error: 'coOwnerEmail and petId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Spec 0077: only the primary owner, and only for a real pending
    // invite. Same 404 for every failure so the reply reveals nothing.
    const notFound = () =>
      new Response(JSON.stringify({ error: 'Invite not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    const { data: pet } = await adminClient
      .from('pets')
      .select('id, name, created_by')
      .eq('id', petId)
      .maybeSingle();
    if (!pet || pet.created_by !== userData.user.id) {
      return notFound();
    }
    const { data: coOwnerRow } = await adminClient
      .from('pet_co_owners')
      .select('id')
      .eq('pet_id', petId)
      .ilike('co_owner_email', escapeLike(coOwnerEmail))
      .is('co_owner_user_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!coOwnerRow) {
      return notFound();
    }
    const petName = pet.name;

    // Only needed here for the email body's owner_name — the
    // test/demo suppression check itself now lives in sendEmail()
    // (passed sentByUserId below), not here.
    const { data: inviterProfile } = await adminClient
      .from('profiles')
      .select('first_name')
      .eq('id', userData.user.id)
      .single();

    // Use the app's own (owned) domain — required by the email system's
    // CTA allowlist (isSafeEmailUrl only permits www.wyskerwatch.com and
    // localhost). This must match one of those allowed hosts or sendEmail
    // below will reject accept_url as unsafe. See _shared/appUrl.ts for
    // the trailing-slash/scheme validation this shares with invite-sitter
    // and sign-up.
    const appUrl = getValidatedAppUrl();
    if (!appUrl) {
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
        return serverError(linkError, { function: 'invite-co-owner', step: 'generate_link' }, corsHeaders);
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

      // Fail closed if we can't tell the two cases apart: treat it as a
      // registered account and send the "added you" email (no sign-in
      // link), rather than risk emailing a real user a fresh login link.
      if (hasPasswordError) {
        console.error('email_has_password error:', hasPasswordError);
      }
      if (hasPasswordError || hasPassword) {
        // Spec 0077 (PA-36): existing accounts get told, and the reply
        // is the same { sent: true } a new address gets.
        return await sendAndRespond({
          to: coOwnerEmail,
          template: 'co-owner-added',
          variables: {
            owner_name: inviterProfile?.first_name || userData.user.email,
            pet_name: petName,
            signin_url: `${appUrl}/login`,
          },
          relatedEntityId: coOwnerRow.id,
          sentByUserId: userData.user.id,
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
        return serverError(recoveryLinkError, { function: 'invite-co-owner', step: 'generate_recovery_link' }, corsHeaders);
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

    // A re-invite (tokenType === 'recovery') reads as a reminder rather
    // than a first-time ask — see co-owner-invitation-reminder.ts.
    const emailTemplate = tokenType === 'recovery' ? 'co-owner-invitation-reminder' : 'co-owner-invitation';

    return await sendAndRespond({
      to: coOwnerEmail,
      template: emailTemplate,
      variables: {
        owner_name: inviterProfile?.first_name || userData.user.email,
        pet_name: petName,
        accept_url: acceptUrl,
      },
      relatedEntityId: coOwnerRow.id,
      sentByUserId: userData.user.id,
    });
  } catch (err) {
    return serverError(err, { function: 'invite-co-owner' }, corsHeaders);
  }
});
