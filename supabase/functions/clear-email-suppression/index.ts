// Supabase Edge Function: clear-email-suppression
//
// Ops-only endpoint to un-block an address previously suppressed by a
// hard bounce or spam complaint (see migration 0038, resend-webhook,
// and docs/features/0020_Resend_Bounce_Delivery_Webhook_Specification_v1.md).
// No UI calls this — it's invoked manually (e.g. via curl with a
// service-role token), the same way send-email/index.ts already is for
// ops use.
//
// Auth: requires a Supabase service_role JWT specifically, checked by
// decoding the (already gateway-verified) JWT's role claim — same
// pattern and same rationale as send-email/index.ts's getJwtRole. This
// function bypasses RLS via the service-role client either way; the
// auth check exists to keep this an ops-only action, not something a
// regular logged-in user's session could ever call.
//
// This does not delete the email_suppressions row — it sets cleared_at/
// cleared_by/cleared_note so there's still a record the address was once
// suppressed, even after being cleared (see the spec's Revision Notes,
// item 6, for why deleting was rejected).
//
// Request body:
//   {
//     email: string,        // required — address to clear
//     clearedBy: string,    // required — who's doing this, for the audit trail
//     note?: string,        // optional — why
//   }
//
// Response:
//   200 { success: true }
//   404 { error: 'No active suppression found for this address' }
//   4xx/5xx { error: string }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizeEmail } from '../_shared/email/utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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

// Decodes (without re-verifying — Supabase's gateway already did that
// before this handler ran) the `role` claim out of a Supabase-issued
// JWT. See send-email/index.ts's getJwtRole for the full rationale.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401);
  }
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (getJwtRole(bearerToken) !== 'service_role') {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400);
  }

  const { email, clearedBy, note } = body as { email?: string; clearedBy?: string; note?: string };
  if (!email || typeof email !== 'string') {
    return json({ error: '"email" is required' }, 400);
  }
  if (!clearedBy || typeof clearedBy !== 'string') {
    return json({ error: '"clearedBy" is required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await admin
    .from('email_suppressions')
    .update({
      cleared_at: new Date().toISOString(),
      cleared_by: clearedBy,
      cleared_note: note ?? null,
    })
    .eq('email', normalizeEmail(email))
    .is('cleared_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('clear-email-suppression update failed:', error.message);
    return json({ error: 'Failed to clear suppression' }, 500);
  }

  if (!data) {
    return json({ error: 'No active suppression found for this address' }, 404);
  }

  return json({ success: true });
});
