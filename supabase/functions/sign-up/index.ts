// Supabase Edge Function: sign-up
//
// Public, unauthenticated endpoint that creates a new Wysker Watch
// account (or resends a stuck confirmation) and sends our own branded
// email instead of Supabase's built-in default confirmation email — see
// docs/features/0021_Branded_Signup_Confirmation_Email_Specification_v1.md
// for the full design and the reasoning behind every decision below.
//
// Unlike invite-co-owner/invite-sitter, there is no logged-in caller —
// that's the whole point of signup — so this function carries its own
// input validation and rate limiting rather than inheriting an
// authenticated caller's implicit trust.
//
// Spec 0086 (account takeover, PA-13): the account is created with NO
// password and no consent. When the emailed link is clicked, Supabase
// itself gives the account a random password nobody knows (planning
// decision 7). Whoever controls the inbox lands on the finish page
// (/verify-email) and sets the real password and agrees to the Terms
// there (finish-account-setup); that step asks for a password because the
// session signed in from an email link, not because of what's stored.
// Before 0086,
// anyone could sign up with someone else's address and a password of
// their choosing, and that password still worked after the real owner
// confirmed. Any `password`, `accepted_terms` or `marketing_opt_in` an
// old cached sign-up page still sends is ignored without an error, and
// is never checked, because nothing from it is stored.
//
// Also worth knowing: account creation here goes through
// adminClient.auth.admin.generateLink({type:'invite', ...}), a
// privileged service-role call, rather than the public
// supabase.auth.signUp() API the old Register.jsx used directly. That
// call is documented to bypass whatever CAPTCHA/rate-limiting Supabase's
// own Auth dashboard may have configured for the public signup surface
// — this function's own rate limiting (below) is meant as a substitute
// for that, not an identical replacement. CAPTCHA specifically is not
// replicated here — see the spec's "no CAPTCHA at launch" decision. The
// leaked-password check now runs where the password is actually set
// (finish-account-setup, via _shared/passwordPolicy.ts).
//
// Request body:
//   { action: 'signup', email, first_name? }
//   { action: 'resend', email }
// (extra fields such as password/accepted_terms are ignored, see above)
//
// Both 'resend' and a 'signup' for an address that already has an
// account send a fresh link when that account is unconfirmed OR has no
// consent recorded (profiles.terms_accepted_at is null) — spec 0086
// planning decisions 1 and 7: someone whose link click confirmed them but
// who closed the finish page early can still get back in. "Has a
// password" can't be used: every clicked link leaves a random one. A
// confirmed account with consent recorded gets nothing.
//
// Response is deliberately the SAME generic shape regardless of whether
// the account is brand new, already confirmed, already has a stuck
// unconfirmed row, or the recipient is suppressed — never enough for a
// caller to tell those cases apart (account-existence enumeration):
//   { sent: true }
//   { error: string }   — only for genuine request/server problems
//                          (bad input, rate-limited, provider failure),
//                          never conditioned on whether the email exists.

import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { sendEmail } from '../_shared/email/sendEmail.ts';
import { EmailServiceError } from '../_shared/email/types.ts';
import { isValidEmail, normalizeEmail } from '../_shared/email/utils.ts';
import { scopedCorsHeaders } from '../_shared/cors.ts';
import { getValidatedAppUrl } from '../_shared/appUrl.ts';
import { isAlreadyRegisteredError } from '../_shared/authErrors.ts';
import { reportError, serverError } from '../_shared/errorReporting.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_FIRST_NAME_LENGTH = 100; // mirrors Register.jsx's existing maxLength

// Rate limits (see check_and_record_rate_limits, migration 0039). Shared
// across both 'signup' and 'resend' actions for the same key — a
// "resend" button is otherwise a second, easier-to-hit path to the same
// spam/cost risk as signup itself. Deliberately strict to start
// (adjustable post-launch without a design change).
const EMAIL_RATE_LIMIT = 5;
const IP_RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60 * 60;

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Same shape returned for every "nothing more to do here" case — see the
// header comment's enumeration-safety note. Never varies by why.
function genericSent(cors: Record<string, string>): Response {
  return jsonResponse({ sent: true }, 200, cors);
}

// Extracts the request's client IP for rate-limiting purposes. Reads the
// LAST entry of x-forwarded-for, not the first: by convention each
// intermediary proxy APPENDS the address it saw the request come from,
// so the right-most entry is the one closest to the actual connecting
// peer as seen by the nearest trusted hop, while the left-most entry is
// whatever the original client itself claimed (and can freely fake) —
// taking the first value would let any caller pick a fresh, fake bucket
// on every request simply by sending its own X-Forwarded-For header,
// defeating the per-IP limit entirely. This still assumes the platform's
// own edge network appends correctly and doesn't pass through an
// attacker-supplied header unchanged; it is not a substitute for a
// platform-verified client-IP header if one becomes available.
function getRequestIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return 'unknown';
  const parts = forwardedFor.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

// Row shape returned by the get_auth_user_confirmation_state() RPC.
interface ConfirmationStateRow {
  user_id: string;
  email_confirmed: boolean;
}

interface ResendResult {
  tokenHash: string;
  tokenType: 'recovery';
  sentByUserId: string;
}

// Looks up whether an auth.users row exists for the email (and whether
// it's confirmed). `failed` is true only when the lookup itself errored;
// `state` is null when there's simply no account.
async function lookupConfirmationState(
  adminClient: SupabaseClient,
  cleanEmail: string,
): Promise<{ failed: boolean; state: ConfirmationStateRow | null }> {
  const { data: stateRows, error: stateError } = await adminClient.rpc('get_auth_user_confirmation_state', {
    p_email: cleanEmail,
  });
  if (stateError) {
    console.error('get_auth_user_confirmation_state error:', stateError);
    return { failed: true, state: null };
  }
  const state = (Array.isArray(stateRows) ? stateRows[0] : stateRows) as ConfirmationStateRow | null | undefined;
  return { failed: false, state: state ?? null };
}

// Shared by the 'resend' action and the 'signup' action whenever the
// email already has an account. Sends when the account is unconfirmed
// or has no consent recorded (spec 0086 planning decisions 1 and 7).
// Returns null when there's genuinely nothing to send (no such account,
// confirmed with consent recorded, a lookup failed, or the recovery link
// itself couldn't
// be generated) — callers treat null as "respond with the generic
// success shape", never as an error, to preserve enumeration safety.
// `knownState` skips the lookup when the caller has already done it.
async function resolveConfirmationResend(
  adminClient: SupabaseClient,
  cleanEmail: string,
  verifyPageUrl: string,
  knownState?: ConfirmationStateRow,
): Promise<ResendResult | null> {
  let state = knownState ?? null;
  if (!state) {
    const lookup = await lookupConfirmationState(adminClient, cleanEmail);
    if (lookup.failed || !lookup.state) {
      return null;
    }
    state = lookup.state;
  }
  if (state.email_confirmed) {
    // Confirmed, but the finish page may never have been completed. Its
    // consent write is the one reliable sign it was: email_has_password()
    // is true for every account once its link is clicked (Supabase stores
    // a random password then; spec 0086 planning decision 7). Read with
    // the service role, by the id the lookup above returned. Fails
    // closed: on a lookup error, send nothing. A missing profile row has
    // no consent recorded, so it gets a link (it goes only to the inbox).
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('terms_accepted_at')
      .eq('id', state.user_id)
      .maybeSingle();
    if (profileError) {
      console.error('profiles consent lookup error:', profileError);
      return null;
    }
    if (profile?.terms_accepted_at) {
      return null;
    }
  }

  const { data: recoveryData, error: recoveryError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: cleanEmail,
    options: { redirectTo: verifyPageUrl },
  });
  if (recoveryError || !recoveryData?.properties?.hashed_token) {
    console.error('generateLink (recovery) error:', recoveryError);
    return null;
  }

  return {
    tokenHash: recoveryData.properties.hashed_token,
    tokenType: 'recovery',
    sentByUserId: state.user_id,
  };
}

Deno.serve(async (req) => {
  const cors = scopedCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Invalid request body' }, 400, cors);
    }

    // password / accepted_terms / marketing_opt_in are deliberately not
    // read (spec 0086) — see the header comment.
    const { action, email, first_name: firstNameRaw } = body as Record<string, unknown>;

    if (action !== 'signup' && action !== 'resend') {
      return jsonResponse({ error: "action must be 'signup' or 'resend'" }, 400, cors);
    }
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return jsonResponse({ error: 'A valid email address is required' }, 400, cors);
    }
    const cleanEmail = normalizeEmail(email);

    const firstName =
      typeof firstNameRaw === 'string' && firstNameRaw.trim().length > 0
        ? firstNameRaw.trim().slice(0, MAX_FIRST_NAME_LENGTH)
        : undefined;

    // Rate limiting — checked before any real work (existence lookups,
    // account creation, or a send), so a rejected attempt never leaks
    // anything about the email's state and never costs a Resend send.
    // Both keys are checked and recorded in a single atomic RPC call
    // (see migration 0039's check_and_record_rate_limits) rather than two
    // separate round trips, so a request is never partially charged
    // against one key's quota when it's ultimately rejected by the other.
    const ip = getRequestIp(req);
    const { data: rateAllowed, error: rateError } = await adminClient.rpc('check_and_record_rate_limits', {
      p_keys: [`signup:email:${cleanEmail}`, `signup:ip:${ip}`],
      p_limits: [EMAIL_RATE_LIMIT, IP_RATE_LIMIT],
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      // Fail closed, same posture as sendEmail.ts's suppression-lookup
      // failure — don't proceed with account creation/email if the rate
      // limiter itself is unavailable.
      console.error('rate limit check failed:', rateError.message);
      return jsonResponse({ error: 'Unable to process this request right now' }, 503, cors);
    }
    if (rateAllowed === false) {
      return jsonResponse({ error: 'Too many attempts. Please try again later.' }, 429, cors);
    }

    const appUrl = getValidatedAppUrl();
    if (!appUrl) {
      return jsonResponse({ error: 'Server misconfiguration: invalid APP_URL' }, 500, cors);
    }
    // Must also be registered in each Supabase project's Auth -> Redirect
    // URL allowlist (dashboard config, not tracked in this repo) before
    // generateLink() calls referencing it will succeed — see the spec's
    // Constraints section.
    const verifyPageUrl = `${appUrl}/verify-email`;

    let tokenHash: string | undefined;
    let tokenType: 'signup' | 'recovery' | undefined;
    let sentByUserId: string | undefined;

    if (action === 'signup') {
      // An address that already has an account (including a pending
      // co-owner/sitter invitee, whose account invite-co-owner/
      // invite-sitter created) never gets a fresh invite token minted
      // here: it goes straight to the same resend decision as 'resend'.
      // The response is identical either way (enumeration safety). The
      // "already registered" fallback below stays as a backstop for a
      // race where the account appears between this lookup and
      // generateLink.
      const existing = await lookupConfirmationState(adminClient, cleanEmail);
      if (existing.failed) {
        // The detail is already in the function log; Sentry gets a
        // report too. The reply text is unchanged.
        reportError(new Error('sign-up: get_auth_user_confirmation_state lookup failed'), {
          function: 'sign-up',
          step: 'lookup_confirmation_state',
        });
        return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
      }
      if (existing.state) {
        const resend = await resolveConfirmationResend(adminClient, cleanEmail, verifyPageUrl, existing.state);
        if (!resend) {
          return genericSent(cors);
        }
        ({ tokenHash, tokenType, sentByUserId } = resend);
      } else {
        // Deliberately NOT generateLink({type:'signup'}) — that call turned
        // out (verified in production 2026-07-26, not just documented
        // behavior) to still trigger Supabase's own built-in confirmation
        // email, so the user got BOTH Supabase's default email AND our
        // branded one. The 'invite' type is the same call invite-co-owner
        // already uses: it creates the auth user and mints a token but,
        // unlike admin.inviteUserByEmail(), sends no email itself.
        //
        // Also deliberately NOT admin.createUser() (spec 0086 planning
        // decision 5): with no password it still stores a random password
        // hash, so email_has_password() would say a never-clicked account
        // already has one. An invite-created
        // account starts with no password and no consent. Clicking the
        // link gives it a random password nobody knows (Supabase does
        // this for invited users, decision 7); the inbox owner then sets
        // the real one on the finish page, which asks for it because the
        // session came from an email link (JWT amr 'otp').
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'invite',
          email: cleanEmail,
          options: {
            data: firstName ? { first_name: firstName } : {},
            redirectTo: verifyPageUrl,
          },
        });

        if (linkError) {
          if (!isAlreadyRegisteredError(linkError)) {
            console.error('generateLink (invite, signup) error:', linkError);
            // Sentry gets a report too, like the lookup failure above.
            // The reply text is unchanged.
            reportError(new Error('sign-up: generateLink (invite) failed'), {
              function: 'sign-up',
              step: 'generate_invite_link',
            });
            return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
          }

          // Race backstop: the account appeared after the lookup above.
          // Same "finished vs still needs a link" question the 'resend'
          // action answers below.
          const resend = await resolveConfirmationResend(adminClient, cleanEmail, verifyPageUrl);
          if (!resend) {
            return genericSent(cors);
          }
          ({ tokenHash, tokenType, sentByUserId } = resend);
        } else {
          if (!linkData?.properties?.hashed_token) {
            console.error('generateLink (invite, signup) returned no token');
            return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
          }
          sentByUserId = linkData.user?.id;
          tokenHash = linkData.properties.hashed_token;
          // The email link says type=signup, not invite: GoTrue stores an
          // invite token as a confirmation token, so verifyOtp redeems it
          // as 'signup' too (checked on dev, see index.test.ts). The
          // frontend that's live before spec 0086's is promoted only
          // accepts signup/recovery, and functions deploy first.
          tokenType = 'signup';
        }
      }
    } else {
      // action === 'resend'
      const resend = await resolveConfirmationResend(adminClient, cleanEmail, verifyPageUrl);
      if (!resend) {
        return genericSent(cors);
      }
      ({ tokenHash, tokenType, sentByUserId } = resend);
    }

    if (!tokenHash || !tokenType) {
      // Nothing left to send (e.g. the confirmed/no-account short
      // circuits above already returned) — treated as success.
      return genericSent(cors);
    }

    const verifyUrl = `${verifyPageUrl}?token_hash=${encodeURIComponent(tokenHash)}&type=${tokenType}`;

    try {
      // Partial failure by design: if this throws, the auth user (if just
      // created) is intentionally NOT rolled back — it's harmless while
      // unconfirmed, and the resend path above gives a real way to
      // recover once the underlying email problem clears. See the spec's
      // Technical Spec "Partial failure" note.
      await sendEmail({
        to: cleanEmail,
        template: 'verify-email',
        variables: { verify_url: verifyUrl },
        relatedEntityType: 'profiles',
        relatedEntityId: sentByUserId,
        idempotencyKey: crypto.randomUUID(),
        sentByUserId,
      });
    } catch (err) {
      if (err instanceof EmailServiceError) {
        console.error('sendEmail error:', err.code, err.message);
        return jsonResponse({ error: 'Unable to send confirmation email right now' }, 502, cors);
      }
      throw err;
    }

    return genericSent(cors);
  } catch (err) {
    return serverError(err, { function: 'sign-up' }, cors);
  }
});
