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
// input validation, password policy, and rate limiting rather than
// inheriting an authenticated caller's implicit trust.
//
// Also worth knowing: account creation here goes through
// adminClient.auth.admin.generateLink({type:'signup', ...}), a
// privileged service-role call, rather than the public
// supabase.auth.signUp() API the old Register.jsx used directly. That
// call is documented to bypass whatever CAPTCHA/rate-limiting Supabase's
// own Auth dashboard may have configured for the public signup surface
// — this function's own rate limiting (below) and the leaked-password
// check (isPasswordPwned) are meant as substitutes for that, not
// identical replacements. CAPTCHA specifically is not replicated here —
// see the spec's "no CAPTCHA at launch" decision.
//
// Request body:
//   { action: 'signup', email, password, first_name?, accepted_terms, marketing_opt_in? }
//   { action: 'resend', email }
//
// accepted_terms must be exactly `true` for a 'signup' request — this is
// the server-side half of the signup consent gate (spec 0047); the client
// disables its own submit button on this, but this function enforces it
// independently so a direct API call can't skip it.
//
// Response is deliberately the SAME generic shape regardless of whether
// the account is brand new, already confirmed, already has a stuck
// unconfirmed row, or the recipient is suppressed — never enough for a
// caller to tell those cases apart (account-existence enumeration):
//   { sent: true }
//   { error: string }   — only for genuine request/server problems
//                          (bad input, rate-limited, provider failure),
//                          never conditioned on whether the email exists.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendEmail } from '../_shared/email/sendEmail.ts';
import { EmailServiceError } from '../_shared/email/types.ts';
import { isValidEmail, normalizeEmail } from '../_shared/email/utils.ts';
import { scopedCorsHeaders } from '../_shared/cors.ts';
import { getValidatedAppUrl } from '../_shared/appUrl.ts';
import { isAlreadyRegisteredError } from '../_shared/authErrors.ts';
import { reportError } from '../_shared/errorReporting.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_FIRST_NAME_LENGTH = 100; // mirrors Register.jsx's existing maxLength
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// The "Last updated" strings a signup is recorded as having agreed to
// (spec 0047). Deliberately this function's own copy, not something the
// client sends — a modified client shouldn't be able to claim it agreed
// to a different version than what's actually live. Must be kept in sync
// by hand with TOS_LAST_UPDATED (src/lib/termsOfServiceContent.js) and
// PRIVACY_POLICY_LAST_UPDATED (src/lib/privacyPolicyContent.js) — this
// Edge Function runs on Deno and can't share an import with the Vite
// frontend bundle.
const TOS_VERSION = 'July 10, 2026';
const PRIVACY_VERSION = 'June 30, 2026';

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

// Best-effort check against the Have I Been Pwned "Pwned Passwords"
// range API (k-anonymity: only a 5-character SHA-1 prefix is sent, never
// the password or its full hash) — a partial substitute for the
// leaked-password protection Supabase's own dashboard may otherwise
// enforce on the public signup surface, which admin.generateLink()
// bypasses (see this file's header comment). Fails OPEN (treats a
// network/API error as "not known to be pwned") rather than blocking
// signup entirely if a third-party service hiccups — a leaked-password
// check that occasionally misses is a much smaller risk than signup
// going down whenever HIBP is slow or unreachable.
async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    const hashHex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((line) => line.split(':')[0]?.trim() === suffix);
  } catch (err) {
    console.error('isPasswordPwned check failed (failing open):', (err as Error).message);
    return false;
  }
}

interface ResendResult {
  tokenHash: string;
  tokenType: 'recovery';
  sentByUserId: string;
}

// Shared by both the 'resend' action and the 'signup' action's
// already-registered-but-unconfirmed fallback — previously duplicated
// near-verbatim in both branches. Returns null when there's genuinely
// nothing to send (no such account, already confirmed, or the recovery
// link itself couldn't be generated) — callers treat null as "respond
// with the generic success shape", never as an error, to preserve
// enumeration safety.
async function resolveConfirmationResend(
  adminClient: ReturnType<typeof createClient>,
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
  const state = Array.isArray(stateRows) ? stateRows[0] : stateRows;
  if (!state || state.email_confirmed) {
    return null;
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

    const {
      action,
      email,
      password,
      first_name: firstNameRaw,
      accepted_terms: acceptedTerms,
      marketing_opt_in: marketingOptInRaw,
    } = body as Record<string, unknown>;

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

    if (action === 'signup') {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        // Not an enumeration concern — this is rejecting the request's
        // own shape, not conditioned on whether the email exists.
        return jsonResponse(
          { error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters` },
          400,
          cors,
        );
      }
      if (await isPasswordPwned(password)) {
        return jsonResponse(
          { error: 'This password has appeared in a data breach. Please choose a different password.' },
          400,
          cors,
        );
      }
      // Server-side enforcement of the signup consent gate (spec 0047) —
      // the Register.jsx checkbox/disabled-button is the normal path, but
      // a direct API call must not be able to skip it.
      if (acceptedTerms !== true) {
        return jsonResponse(
          { error: 'You must agree to the Terms of Service and Privacy Policy to create an account' },
          400,
          cors,
        );
      }
    }
    const marketingOptIn = marketingOptInRaw === true;

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
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: password as string,
        email_confirm: false,
        user_metadata: {
          ...(firstName ? { first_name: firstName } : {}),
          terms_accepted_at: new Date().toISOString(),
          terms_version: TOS_VERSION,
          privacy_version: PRIVACY_VERSION,
          marketing_opt_in: marketingOptIn,
        },
      });

      if (createError) {
        if (!isAlreadyRegisteredError(createError)) {
          console.error('createUser (signup) error:', createError);
          return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
        }

        // Already has an auth.users row — same "confirmed vs stuck
        // unconfirmed" question the 'resend' action answers below.
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
    console.error('sign-up Edge Function error:', err);
    reportError(err, { function: 'sign-up' });
    return jsonResponse({ error: (err as Error).message || 'Unknown error' }, 500, cors);
  }
});
