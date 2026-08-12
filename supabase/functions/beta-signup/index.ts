// Supabase Edge Function: beta-signup
//
// Public, unauthenticated endpoint backing the /beta landing page and
// screener (see
// docs/features/0053_Beta_Signup_Landing_Page_and_Screener_Specification_v1.md).
// Structured like sign-up/index.ts: scoped CORS, a service-role
// adminClient, its own input validation (no logged-in caller to trust),
// and rate limiting before any real work happens.
//
// Unlike sign-up, this form is meant to be posted publicly (Reddit,
// BetaList) to people with no prior relationship to the app at all, not
// just people already using it — a wider, more anonymous bot/spam
// surface. So this function also verifies a Cloudflare Turnstile token
// server-side before anything else, checked first (before even rate
// limiting) so a failed/missing token never consumes rate-limit budget.
//
// Request body:
//   { email, condition_status, tracking_method, frustration, beta_comfort, turnstile_token }
//
// Response:
//   { success: true }
//   { error: string }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendEmail } from '../_shared/email/sendEmail.ts';
import { EmailServiceError } from '../_shared/email/types.ts';
import { isValidEmail, normalizeEmail } from '../_shared/email/utils.ts';
import { scopedCorsHeaders } from '../_shared/cors.ts';
import { reportError } from '../_shared/errorReporting.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY');
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Mirrors sign-up's convention (migration 0039's check_and_record_rate_limits)
// with the same window; this form's expected volume is far lower than
// real sign-up, so a somewhat tighter per-email limit is reasonable —
// nobody legitimately submits the screener more than a couple of times.
const EMAIL_RATE_LIMIT = 3;
const IP_RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60 * 60;

const MAX_TEXT_LENGTH = 2000; // generous ceiling for the open-text frustration answer

const CONDITION_STATUS_VALUES = ['diagnosed', 'watching_closely', 'just_curious'];
const TRACKING_METHOD_VALUES = ['none', 'notes_app', 'spreadsheet', 'another_app', 'paper_notebook'];
const BETA_COMFORT_VALUES = ['yes', 'prefer_to_wait'];

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Same IP-extraction convention as sign-up/index.ts's getRequestIp — see
// that file's comment for why the LAST x-forwarded-for entry is used.
function getRequestIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return 'unknown';
  const parts = forwardedFor.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    // Fail closed: unlike isPasswordPwned's fail-open posture for a
    // best-effort third-party check, a missing secret here means CAPTCHA
    // verification straight-up cannot happen — better to reject the
    // submission than silently accept every request unverified.
    console.error('TURNSTILE_SECRET_KEY is not configured');
    return false;
  }
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: remoteIp,
      }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.success === true;
  } catch (err) {
    console.error('Turnstile verification request failed:', (err as Error).message);
    return false;
  }
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
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
      email,
      condition_status: conditionStatus,
      tracking_method: trackingMethod,
      frustration,
      beta_comfort: betaComfort,
      turnstile_token: turnstileToken,
    } = body as Record<string, unknown>;

    if (typeof email !== 'string' || !isValidEmail(email)) {
      return jsonResponse({ error: 'A valid email address is required' }, 400, cors);
    }
    const cleanEmail = normalizeEmail(email);

    if (typeof conditionStatus !== 'string' || !CONDITION_STATUS_VALUES.includes(conditionStatus)) {
      return jsonResponse({ error: 'Invalid condition_status' }, 400, cors);
    }
    if (typeof trackingMethod !== 'string' || !TRACKING_METHOD_VALUES.includes(trackingMethod)) {
      return jsonResponse({ error: 'Invalid tracking_method' }, 400, cors);
    }
    if (!isNonEmptyString(frustration, MAX_TEXT_LENGTH)) {
      return jsonResponse({ error: 'frustration must be a non-empty string' }, 400, cors);
    }
    if (typeof betaComfort !== 'string' || !BETA_COMFORT_VALUES.includes(betaComfort)) {
      return jsonResponse({ error: 'Invalid beta_comfort' }, 400, cors);
    }
    if (typeof turnstileToken !== 'string' || turnstileToken.length === 0) {
      return jsonResponse({ error: 'CAPTCHA verification is required' }, 400, cors);
    }

    const ip = getRequestIp(req);

    // CAPTCHA is checked before rate limiting — a failed/bot token
    // should never consume rate-limit budget that a real retry might
    // need.
    const turnstileOk = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileOk) {
      return jsonResponse({ error: 'CAPTCHA verification failed. Please try again.' }, 400, cors);
    }

    const { data: rateAllowed, error: rateError } = await adminClient.rpc('check_and_record_rate_limits', {
      p_keys: [`beta-signup:email:${cleanEmail}`, `beta-signup:ip:${ip}`],
      p_limits: [EMAIL_RATE_LIMIT, IP_RATE_LIMIT],
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      console.error('rate limit check failed:', rateError.message);
      return jsonResponse({ error: 'Unable to process this request right now' }, 503, cors);
    }
    if (rateAllowed === false) {
      return jsonResponse({ error: 'Too many attempts. Please try again later.' }, 429, cors);
    }

    const { error: insertError } = await adminClient.from('beta_signups').insert({
      email: cleanEmail,
      condition_status: conditionStatus,
      tracking_method: trackingMethod,
      frustration: frustration.trim(),
      beta_comfort: betaComfort,
    });
    if (insertError) {
      console.error('beta_signups insert error:', insertError.message);
      return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
    }

    // Confirmation email is best-effort: the signup itself already
    // succeeded (the row is written) by this point, so a Resend hiccup
    // here shouldn't turn into a user-facing failure for something that
    // actually worked — same partial-failure posture sign-up/index.ts
    // documents for its own confirmation send.
    try {
      await sendEmail({
        to: cleanEmail,
        template: 'beta-signup-confirmation',
        variables: {},
        from: 'Lynn @ Wysker Watch <support@wyskerwatch.com>',
        relatedEntityType: 'beta_signups',
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (err) {
      if (err instanceof EmailServiceError) {
        console.error('sendEmail (beta-signup-confirmation) error:', err.code, err.message);
      } else {
        throw err;
      }
    }

    return jsonResponse({ success: true }, 200, cors);
  } catch (err) {
    console.error('beta-signup Edge Function error:', err);
    reportError(err, { function: 'beta-signup' });
    return jsonResponse({ error: (err as Error).message || 'Unknown error' }, 500, cors);
  }
});
