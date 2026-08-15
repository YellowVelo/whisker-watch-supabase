// Supabase Edge Function: early-adopter-signup
//
// Public, unauthenticated endpoint backing the /early-adopters landing
// page (see
// docs/features/0056_Early_Adopters_Welcome_Page_Specification_v1.md).
// Structured identically to beta-signup/index.ts: scoped CORS, a
// service-role adminClient, its own input validation (no logged-in caller
// to trust), Turnstile CAPTCHA verified before rate limiting, then rate
// limiting before any write happens.
//
// Distinct from beta-signup: this is NOT screening testers. It's a
// pre-PWA-launch "tell me when it's ready" list — first name + email +
// consent only, no screener questions, writes to early_adopters (not
// beta_signups).
//
// Request body:
//   { first_name, email, consent, turnstile_token }
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

// Same limits as beta-signup — this form's expected volume from social
// traffic is low, and nobody legitimately submits more than once or twice.
const EMAIL_RATE_LIMIT = 3;
const IP_RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60 * 60;

const MAX_NAME_LENGTH = 200;

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Same IP-extraction convention as sign-up/index.ts and beta-signup/index.ts.
function getRequestIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return 'unknown';
  const parts = forwardedFor.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    // Fail closed: a missing secret means CAPTCHA verification straight-up
    // cannot happen — better to reject the submission than silently accept
    // every request unverified.
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
      first_name: firstName,
      email,
      consent,
      turnstile_token: turnstileToken,
    } = body as Record<string, unknown>;

    if (!isNonEmptyString(firstName, MAX_NAME_LENGTH)) {
      return jsonResponse({ error: 'First name is required' }, 400, cors);
    }
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return jsonResponse({ error: 'A valid email address is required' }, 400, cors);
    }
    const cleanEmail = normalizeEmail(email);

    if (consent !== true) {
      return jsonResponse({ error: 'Consent is required to join the Early Adopters list' }, 400, cors);
    }
    if (typeof turnstileToken !== 'string' || turnstileToken.length === 0) {
      return jsonResponse({ error: 'CAPTCHA verification is required' }, 400, cors);
    }

    const ip = getRequestIp(req);

    // CAPTCHA is checked before rate limiting — a failed/bot token should
    // never consume rate-limit budget that a real retry might need.
    const turnstileOk = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileOk) {
      return jsonResponse({ error: 'CAPTCHA verification failed. Please try again.' }, 400, cors);
    }

    const { data: rateAllowed, error: rateError } = await adminClient.rpc('check_and_record_rate_limits', {
      p_keys: [`early-adopter-signup:email:${cleanEmail}`, `early-adopter-signup:ip:${ip}`],
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

    const { error: insertError } = await adminClient.from('early_adopters').insert({
      first_name: firstName.trim(),
      email: cleanEmail,
      consented_at: new Date().toISOString(),
    });
    if (insertError) {
      console.error('early_adopters insert error:', insertError.message);
      return jsonResponse({ error: 'Unable to process this request right now' }, 500, cors);
    }

    // Confirmation email is best-effort: the signup itself already
    // succeeded (the row is written) by this point, so a Resend hiccup
    // here shouldn't turn into a user-facing failure — same partial-
    // failure posture beta-signup/index.ts documents for its own send.
    try {
      await sendEmail({
        to: cleanEmail,
        template: 'early-adopter-confirmation',
        variables: {},
        from: 'Lynn @ Wysker Watch <support@wyskerwatch.com>',
        relatedEntityType: 'early_adopters',
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (err) {
      if (err instanceof EmailServiceError) {
        console.error('sendEmail (early-adopter-confirmation) error:', err.code, err.message);
      } else {
        throw err;
      }
    }

    return jsonResponse({ success: true }, 200, cors);
  } catch (err) {
    console.error('early-adopter-signup Edge Function error:', err);
    reportError(err, { function: 'early-adopter-signup' });
    return jsonResponse({ error: (err as Error).message || 'Unknown error' }, 500, cors);
  }
});
