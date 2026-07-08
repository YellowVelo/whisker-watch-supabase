// Supabase Edge Function: send-email
//
// Thin HTTP entry point over the shared sendEmail service
// (../_shared/email/sendEmail.ts). Callers must present a Supabase
// **service_role** JWT as the bearer token — this endpoint is
// server-to-server/ops-only, not something a logged-in user's own
// session token can call.
//
// This is deliberately more restrictive than "any authenticated user":
// templates like password-reset and verify-email accept an arbitrary
// `to` and an arbitrary CTA URL, so allowing a regular user session to
// invoke this would let any account send Wysker-Watch-branded email
// (with an attacker-controlled link) to any third-party address — a
// phishing primitive. Only trusted backend code holds a service_role
// credential, so gating on it closes that off entirely.
//
// Auth check works by trusting Supabase's own gateway rather than
// comparing against a locally-stored copy of the key: every deployed
// Edge Function sits behind Supabase's JWT verification by default
// (a request with a malformed/invalid/unsigned JWT never reaches this
// code at all — Supabase's gateway rejects it first). So by the time
// Deno.serve's handler runs, the Authorization header is already a
// signature-verified Supabase JWT; this code only needs to read its
// `role` claim and require `service_role`. This avoids the brittleness
// of string-comparing against SUPABASE_SERVICE_ROLE_KEY, whose exact
// value/format can differ from what a given project's dashboard hands
// you (legacy JWT-format keys vs. the newer opaque sb_secret_/
// sb_publishable_ key format) — see getJwtRole below.
//
// Other Edge Functions that need to send email should generally prefer
// importing `sendEmail` from ../_shared/email/sendEmail.ts directly
// (no network hop). Use this HTTP endpoint when the caller isn't
// itself an Edge Function with module access — e.g. a scheduled job,
// an external worker, or manual QA via curl.
//
// This function does not itself implement any product workflow (no
// invitation creation, no token generation) — callers pass fully-formed
// variables (accept_url, reset_url, etc.) and this just renders +
// sends. See the Email feature spec: "Do not implement the full
// co-owner invitation flow in this feature."
//
// Request body:
//   {
//     to: string,
//     template: string,
//     variables: Record<string, string>,
//     replyTo?: string,
//     relatedEntityType?: string,
//     relatedEntityId?: string,
//     idempotencyKey?: string,   // pass the same key on retry to avoid a duplicate send
//   }
//
// Response:
//   200 { success: true, messageId: string | null }
//   4xx/5xx { error: { code: EmailErrorCode, message: string } }

import { sendEmail } from '../_shared/email/sendEmail.ts';
import { EmailServiceError } from '../_shared/email/types.ts';

// Decodes (without re-verifying — see header comment) the `role` claim
// out of a Supabase-issued JWT. Returns null for anything that isn't a
// well-formed JWT (e.g. one of the newer opaque sb_secret_/
// sb_publishable_ keys), which safely falls through to "unauthorized"
// below rather than throwing.
function getJwtRole(token: string): string | null {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ERROR_STATUS: Record<string, number> = {
  missing_template: 400,
  missing_variable: 400,
  invalid_recipient: 400,
  unauthorized: 401,
  provider_error: 502,
  unknown_error: 500,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth check ──────────────────────────────────────────────────────
    // service_role JWTs only — see header comment for why a regular
    // user session is not accepted here, and why this reads the JWT's
    // role claim rather than string-comparing against a stored key.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: { code: 'unauthorized', message: 'Missing Authorization header' } }, 401);
    }

    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (getJwtRole(bearerToken) !== 'service_role') {
      return json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, 401);
    }

    // ── Parse & validate request body ──────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: { code: 'unknown_error', message: 'Request body must be valid JSON' } }, 400);
    }

    const { to, template, variables, replyTo, relatedEntityType, relatedEntityId, idempotencyKey } = body as {
      to?: string;
      template?: string;
      variables?: Record<string, string>;
      replyTo?: string;
      relatedEntityType?: string;
      relatedEntityId?: string;
      idempotencyKey?: string;
    };

    if (!to || typeof to !== 'string') {
      return json({ error: { code: 'invalid_recipient', message: '"to" is required' } }, 400);
    }
    if (!template || typeof template !== 'string') {
      return json({ error: { code: 'missing_template', message: '"template" is required' } }, 400);
    }

    const result = await sendEmail({
      to,
      template,
      variables: variables ?? {},
      replyTo,
      relatedEntityType,
      relatedEntityId,
      idempotencyKey,
    });

    return json(result);
  } catch (err) {
    if (err instanceof EmailServiceError) {
      return json({ error: { code: err.code, message: err.message } }, ERROR_STATUS[err.code] ?? 500);
    }
    console.error('send-email unexpected error:', err);
    return json({ error: { code: 'unknown_error', message: 'Something went wrong sending this email' } }, 500);
  }
});
