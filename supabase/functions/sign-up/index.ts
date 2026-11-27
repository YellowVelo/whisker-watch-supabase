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
// password and no consent. Whoever controls the inbox clicks the emailed
// link, lands on the finish page (/verify-email), and only then sets the
// password and agrees to the Terms (finish-account-setup). Before 0086,
// anyone could sign up with someone else's address and a password of
// their choosing, and that password still worked after the real owner
// confirmed. Any `password`, `accepted_terms` or `marketing_opt_in` an
// old cached sign-up page still sends is ignored without an error, and
// is never checked, because nothing from it is stored.
//
// Also worth knowing: account creation here goes through
// adminClient.auth.admin.generateLink({type:'signup', ...}), a
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
// password yet (spec 0086 planning decision 1: someone whose link click
// confirmed them but who closed the finish page early can still get back
// in). A confirmed account that already has a password gets nothing.
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
import { serverError } from '../_shared/errorReporting.ts';

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

// Shared by both the 'resend' action and the 'signup' action's
// already-registered fallback — previously duplicated near-verbatim in
// both branches. Sends when the account is unconfirmed or has no
// password yet (spec 0086 planning decision 1). Returns null when
// there's genuinely nothing to send (no such account, confirmed with a
// password, a lookup failed, or the recovery link itself couldn't be
// generated) — callers treat null as "respond with the generic success
// shape", never as an error, to preserve enumeration safety.
async function resolveConfirmationResend(
  adminClient: SupabaseClient,
  cleanEmail: string,
  verifyPageUrl: string,
): Promise<ResendResult | null> {
  const { data: stateRows, error: stateError } = await adminClient.rpc('get_auth_user_confirmation_state', {
    p_email: cleanEmail,
  });
  if (stateError) {
    console.error('get_auth_user_confirmation_state error:', stateError);
    return null;
  }
  const state = (Array.isArray(stateRows) ? stateRows[0] : stateRows) as ConfirmationStateRow | null | undefined;
  if (!state) {
    return null;
  }
  if (state.email_confirmed) {
    // Confirmed, but the finish page may never have been completed —
    // email_has_password() (migration 0020) is the same check the invite
    // functions use. Fails closed: on a lookup error, send nothing.
    const { data: hasPassword, error: hasPasswordError } = await adminClient.rpc('email_has_password', {
      p_email: cleanEmail,
    });
    if (hasPasswordError) {
      console.error('email_has_password error:', hasPasswordError);
      return null;
    }
    if (hasPassword !== false) {
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
      // Deliberately NOT generateLink({type:'signup'}) — despite mirroring
      // invite-co-owner's admin-API pattern, that call turned out (verified
      // in production 2026-07-26, not just documented behavior) to still
      // trigger Supabase's own built-in confirmation email, unlike
      // 'invite'/'recovery' types. That defeated the entire point of this
      // spec: the user got BOTH Supabase's generic default email AND our
      // branded one for the same signup. createUser() is a pure admin
      // operation with no email side effect, and the 'recovery'-type
      // generateLink call below is the same mechanism the 'resend' path
      // already uses safely — see resolveConfirmationResend().
      //
      // No password and no consent (spec 0086): both are set later by the
      // inbox owner on the finish page.
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        email_confirm: false,
        user_metadata: firstName ? { first_name: firstName } : {},
      });

      if (createError) {
        if (!isAlreadyRegisteredError(createError)) {
          console.error('createUser (signup) error:', createError);
          return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
        }

        // Already has an auth.users row — same "finished vs still needs
        // a link" question the 'resend' action answers below.
        const resend = await resolveConfirmationResend(adminClient, cleanEmail, verifyPageUrl);
        if (!resend) {
          return genericSent(cors);
        }
        ({ tokenHash, tokenType, sentByUserId } = resend);
      } else {
        sentByUserId = createData?.user?.id;
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: cleanEmail,
          options: { redirectTo: verifyPageUrl },
        });
        if (linkError || !linkData?.properties?.hashed_token) {
          console.error('generateLink (recovery, post-createUser) error:', linkError);
          return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
        }
        tokenHash = linkData.properties.hashed_token;
        tokenType = 'recovery';
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
