// Supabase Edge Function: send-email
//
// Thin HTTP entry point over the shared sendEmail service
// (../_shared/email/sendEmail.ts). Callers must present the Supabase
// **service role key** as the bearer token — this endpoint is
// server-to-server/ops-only, not something a logged-in user's own
// session token can call.
//
// This is deliberately more restrictive than "any authenticated user":
// templates like password-reset and verify-email accept an arbitrary
// `to` and an arbitrary CTA URL, so allowing a regular user session to
// invoke this would let any account send Wysker-Watch-branded email
// (with an attacker-controlled link) to any third-party address — a
// phishing primitive. Only trusted backend code holds the service role
// key, so gating on it closes that off entirely.
//
// Other Edge Functions that need to send email should generally prefer
// importing `sendEmail` from ../_shared/email/sendEmail.ts directly
// (no network hop, no need to pass the service role key over HTTP).
// Use this HTTP endpoint instead when the caller isn't itself an Edge
// Function with module access — e.g. a scheduled job, an external
// worker, or manual QA via curl.
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

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    // Service role key only — see header comment for why a regular user
    // session is not accepted here.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: { code: 'unauthorized', message: 'Missing Authorization header' } }, 401);
    }

    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (bearerToken !== SUPABASE_SERVICE_ROLE_KEY) {
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
