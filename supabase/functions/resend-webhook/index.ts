// Supabase Edge Function: resend-webhook
//
// Receives Resend's delivery/bounce/complaint webhook notifications and
// updates email_logs/email_suppressions accordingly. See
// docs/features/0020_Resend_Bounce_Delivery_Webhook_Specification_v1.md
// for the full design and reasoning.
//
// MUST be deployed with the Supabase JWT check turned off:
//   supabase functions deploy resend-webhook --no-verify-jwt
// Resend will never present a Supabase-issued token — authentication here
// is via signature verification (below), not Supabase's own gateway auth.
// This is the one function in this repo that needs that deploy flag.
//
// Only registered with Resend's dashboard for the production project —
// dev/staging get this function deployed (for CI integration tests and
// environment parity) but are deliberately never wired in as a live
// Resend destination, since all three environments currently share one
// Resend account and webhooks are account-scoped, not per-environment.
// See the spec's Functional Requirement 3.
//
// Handles exactly three event types: email.delivered, email.bounced,
// email.complained. email.bounced is Resend's permanent-failure signal —
// temporary/transient delivery problems are a separate email.delivery_delayed
// event this function doesn't subscribe to or handle. Any other event
// type is acknowledged (200) and ignored, in case the Resend dashboard
// is ever configured to send more than the three types above.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizeEmail } from '../_shared/email/utils.ts';
import { computeSignature, constantTimeEqual, webhookSecretToBytes } from '../_shared/webhookSignature.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const HANDLED_EVENT_TYPES = new Set(['email.delivered', 'email.bounced', 'email.complained']);

// How old a validly-signed request's svix-timestamp is allowed to be.
// Bounds how long a genuinely-signed-but-replayed request stays usable.
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Verifies Resend's Svix-style webhook signature. Returns true only if
// the signature is valid AND svix-timestamp is within tolerance.
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET is not configured');
    return false;
  }
  const secretBytes = webhookSecretToBytes(secret);

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSignature = await computeSignature(secretBytes, signedContent);

  // svix-signature may contain multiple space-separated "v1,<base64>"
  // entries (Resend can rotate/dual-sign) — match if any entry matches.
  const candidates = svixSignature
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [version, value] = entry.split(',');
      return { version, value };
    })
    .filter((entry) => entry.version === 'v1' && entry.value);

  return candidates.some((entry) => constantTimeEqual(entry.value, expectedSignature));
}

interface ResendWebhookPayload {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    created_at?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Raw body text is read once, before any JSON parsing — signature
  // verification is computed over the exact bytes Resend sent, not a
  // re-serialized version of the parsed object.
  const rawBody = await req.text();

  const signatureValid = await verifySignature(req, rawBody);
  if (!signatureValid) {
    return json({ error: 'Invalid or missing signature' }, 401);
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400);
  }

  const eventType = payload.type;
  if (!eventType || !HANDLED_EVENT_TYPES.has(eventType)) {
    // Either a completely unrecognized shape, or a real Resend event
    // type this function deliberately doesn't subscribe to (e.g.
    // email.sent, email.opened, email.clicked, email.delivery_delayed).
    // Acknowledge without changing anything, rather than erroring on an
    // event we simply chose not to handle.
    return json({ ok: true, ignored: true });
  }

  const providerMessageId = payload.data?.email_id;
  if (!providerMessageId) {
    return json({ error: 'Missing data.email_id' }, 400);
  }

  let email: string | null = null;
  if (eventType === 'email.bounced' || eventType === 'email.complained') {
    const to = payload.data?.to;
    if (!Array.isArray(to) || !to[0]) {
      return json({ error: 'Missing data.to for a bounced/complained event' }, 400);
    }
    email = normalizeEmail(to[0]);
  }

  const svixId = req.headers.get('svix-id')!;
  // The top-level `created_at` is the webhook envelope's own event
  // timestamp (the canonical field per Resend/Svix's payload shape) —
  // checked first, ahead of `data.created_at`, which describes the
  // underlying email object and may not reflect this specific event's
  // time at all. If neither is present, this falls back to processing
  // time and says so explicitly in the logs, rather than silently
  // recording a "now" timestamp that looks no different from a real one.
  const declaredOccurredAt = payload.created_at ?? payload.data?.created_at;
  if (!declaredOccurredAt) {
    console.error(
      `resend-webhook: payload for event ${svixId} (${eventType}) had no created_at at top level or under data — recording processing time instead of the true event time`,
    );
  }
  const occurredAt = declaredOccurredAt ?? new Date().toISOString();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.rpc('process_resend_webhook_event', {
    p_event_id: svixId,
    p_event_type: eventType,
    p_provider_message_id: providerMessageId,
    p_email: email,
    p_occurred_at: occurredAt,
  });

  if (error) {
    // A genuine database error mid-processing — do not acknowledge, so
    // Resend's real retry mechanism gets a fair chance to retry it (the
    // atomic function guarantees nothing was partially applied).
    console.error('process_resend_webhook_event failed:', error.message);
    return json({ error: 'Failed to process webhook event' }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.outcome === 'no_match') {
    console.error(`resend-webhook: no email_logs row for provider_message_id ${providerMessageId}`);
  }

  return json({ ok: true, outcome: row?.outcome ?? 'processed' });
});
