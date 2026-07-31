// Integration tests for the deployed resend-webhook Edge Function, run
// against wysker-watch-dev over HTTP (see _shared/testHelpers.ts for the
// required env vars and why this calls the deployed function instead of
// importing the handler in-process).
//
// This function is deployed with --no-verify-jwt (Resend never presents a
// Supabase JWT), so these tests call it directly with fetch and hand-craft
// the svix-* signature headers themselves — there's no Supabase session
// involved, unlike delete-pet/delete-account's tests.
//
// Requires one additional env var beyond testHelpers.ts's usual set:
//   RESEND_WEBHOOK_SECRET - must match the same value configured as this
//                           function's secret on wysker-watch-dev (a test
//                           value is fine; Resend itself is never involved
//                           in these tests).
//
// A caveat on the last test ('a suppressed recipient stays suppressed
// until cleared'): it calls send-email and clear-email-suppression over
// HTTP with a service_role bearer token, the same way send-email's own
// design has always required (see its header comment on getJwtRole).
// That auth check specifically expects a decodable JWT `role` claim, not
// the newer opaque sb_secret_... key format used elsewhere in CI — so
// ci.yml wires this one test's SUPABASE_SERVICE_ROLE_KEY to
// `secrets.DEV_LEGACY_JWT_SECRET`, a legacy-JWT-format service-role
// credential for wysker-watch-dev, instead of `secrets.sb_secret`.
//
// Run: deno test --allow-net --allow-env supabase/functions/resend-webhook/index.test.ts

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { adminClient, functionsUrl, requireEnv } from '../_shared/testHelpers.ts';
import { computeSignature, webhookSecretToBytes } from '../_shared/webhookSignature.ts';

// Imports the exact same signing implementation resend-webhook/index.ts
// verifies against, rather than a second hand-rolled copy — see
// _shared/webhookSignature.ts's header comment for why.
function secretBytes(): Uint8Array {
  return webhookSecretToBytes(requireEnv('RESEND_WEBHOOK_SECRET'));
}

async function signedHeaders(
  rawBody: string,
  overrides?: { svixId?: string; timestampSeconds?: number },
): Promise<Record<string, string>> {
  const svixId = overrides?.svixId ?? crypto.randomUUID();
  const svixTimestamp = String(overrides?.timestampSeconds ?? Math.floor(Date.now() / 1000));
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const signature = await computeSignature(secretBytes(), signedContent);
  return {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': `v1,${signature}`,
    'Content-Type': 'application/json',
  };
}

async function postWebhook(
  rawBody: string,
  headers: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(functionsUrl('resend-webhook'), { method: 'POST', headers, body: rawBody });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function createTestLogRow(recipientEmail: string): Promise<{ id: string; providerMessageId: string }> {
  const admin = adminClient();
  const providerMessageId = `test-msg-${crypto.randomUUID()}`;
  const { data, error } = await admin
    .from('email_logs')
    .insert({
      recipient_email: recipientEmail,
      template_name: 'resend-webhook-test',
      status: 'sent',
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to create test email_logs row: ${error?.message}`);
  return { id: data.id as string, providerMessageId };
}

async function cleanupLogRow(id: string): Promise<void> {
  await adminClient().from('email_logs').delete().eq('id', id);
}

async function cleanupSuppression(email: string): Promise<void> {
  await adminClient().from('email_suppressions').delete().eq('email', email);
}

Deno.test('resend-webhook: valid email.delivered sets delivered_at', async () => {
  const recipient = `ci-scratch-${Date.now()}-delivered@wyskerwatch.com`;
  const { id, providerMessageId } = await createTestLogRow(recipient);
  try {
    const body = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: { email_id: providerMessageId, to: [recipient], created_at: new Date().toISOString() },
    });
    const { status, json } = await postWebhook(body, await signedHeaders(body));

    assertEquals(status, 200);
    assertEquals(json.outcome, 'processed');

    const { data: row } = await adminClient().from('email_logs').select('delivered_at').eq('id', id).single();
    assertExists(row?.delivered_at);
  } finally {
    await cleanupLogRow(id);
  }
});

Deno.test('resend-webhook: valid email.bounced sets bounced_at and creates an active suppression', async () => {
  const recipient = `ci-scratch-${Date.now()}-bounced@wyskerwatch.com`;
  const { id, providerMessageId } = await createTestLogRow(recipient);
  try {
    const body = JSON.stringify({
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: { email_id: providerMessageId, to: [recipient], created_at: new Date().toISOString() },
    });
    const { status, json } = await postWebhook(body, await signedHeaders(body));

    assertEquals(status, 200);
    assertEquals(json.outcome, 'processed');

    const { data: row } = await adminClient().from('email_logs').select('bounced_at').eq('id', id).single();
    assertExists(row?.bounced_at);

    const { data: suppression } = await adminClient()
      .from('email_suppressions')
      .select('reason, cleared_at')
      .eq('email', recipient)
      .single();
    assertEquals(suppression?.reason, 'bounced');
    assertEquals(suppression?.cleared_at, null);
  } finally {
    await cleanupLogRow(id);
    await cleanupSuppression(recipient);
  }
});

Deno.test('resend-webhook: email.complained sets complained_at even when delivered_at is already set, and suppresses', async () => {
  const recipient = `ci-scratch-${Date.now()}-complained@wyskerwatch.com`;
  const { id, providerMessageId } = await createTestLogRow(recipient);
  try {
    await adminClient().from('email_logs').update({ delivered_at: new Date().toISOString() }).eq('id', id);

    const body = JSON.stringify({
      type: 'email.complained',
      created_at: new Date().toISOString(),
      data: { email_id: providerMessageId, to: [recipient], created_at: new Date().toISOString() },
    });
    const { status, json } = await postWebhook(body, await signedHeaders(body));

    assertEquals(status, 200);
    assertEquals(json.outcome, 'processed');

    const { data: row } = await adminClient()
      .from('email_logs')
      .select('delivered_at, complained_at')
      .eq('id', id)
      .single();
    assertExists(row?.delivered_at);
    assertExists(row?.complained_at);

    const { data: suppression } = await adminClient()
      .from('email_suppressions')
      .select('reason')
      .eq('email', recipient)
      .single();
    assertEquals(suppression?.reason, 'complained');
  } finally {
    await cleanupLogRow(id);
    await cleanupSuppression(recipient);
  }
});

Deno.test('resend-webhook: invalid signature is rejected with no database change', async () => {
  const recipient = `ci-scratch-${Date.now()}-badsig@wyskerwatch.com`;
  const { id, providerMessageId } = await createTestLogRow(recipient);
  try {
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: providerMessageId, to: [recipient] },
    });
    const headers = await signedHeaders(body);
    headers['svix-signature'] = 'v1,not-a-real-signature==';

    const { status } = await postWebhook(body, headers);
    assertEquals(status, 401);

    const { data: row } = await adminClient().from('email_logs').select('delivered_at').eq('id', id).single();
    assertEquals(row?.delivered_at, null);
  } finally {
    await cleanupLogRow(id);
  }
});

Deno.test('resend-webhook: missing signature headers are rejected', async () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'irrelevant' } });
  const { status } = await postWebhook(body, { 'Content-Type': 'application/json' });
  assertEquals(status, 401);
});

Deno.test('resend-webhook: a timestamp outside tolerance is rejected even with an otherwise-valid signature', async () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'irrelevant' } });
  const tenMinutesAgo = Math.floor(Date.now() / 1000) - 10 * 60;
  const headers = await signedHeaders(body, { timestampSeconds: tenMinutesAgo });

  const { status } = await postWebhook(body, headers);
  assertEquals(status, 401);
});

Deno.test('resend-webhook: the same event id delivered twice only applies its effect once', async () => {
  const recipient = `ci-scratch-${Date.now()}-dedup@wyskerwatch.com`;
  const { id, providerMessageId } = await createTestLogRow(recipient);
  try {
    const svixId = crypto.randomUUID();
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: providerMessageId, created_at: '2026-01-01T00:00:00.000Z' },
    });

    const first = await postWebhook(body, await signedHeaders(body, { svixId }));
    assertEquals(first.status, 200);
    assertEquals(first.json.outcome, 'processed');

    const { data: afterFirst } = await adminClient().from('email_logs').select('delivered_at').eq('id', id).single();
    const firstDeliveredAt = afterFirst?.delivered_at;
    assertExists(firstDeliveredAt);

    // Same svix-id, different payload timestamp — a real duplicate
    // delivery should be a no-op, not apply the new timestamp.
    const body2 = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: providerMessageId, created_at: '2027-01-01T00:00:00.000Z' },
    });
    const second = await postWebhook(body2, await signedHeaders(body2, { svixId }));
    assertEquals(second.status, 200);
    assertEquals(second.json.outcome, 'duplicate');

    const { data: afterSecond } = await adminClient().from('email_logs').select('delivered_at').eq('id', id).single();
    assertEquals(afterSecond?.delivered_at, firstDeliveredAt);
  } finally {
    await cleanupLogRow(id);
  }
});

Deno.test('resend-webhook: unknown provider_message_id is acknowledged with no email_logs change', async () => {
  const body = JSON.stringify({
    type: 'email.delivered',
    data: { email_id: `no-such-message-${crypto.randomUUID()}` },
  });
  const { status, json } = await postWebhook(body, await signedHeaders(body));
  assertEquals(status, 200);
  assertEquals(json.outcome, 'no_match');
});

Deno.test('resend-webhook: an unrecognized event type is acknowledged and ignored', async () => {
  const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'irrelevant' } });
  const { status, json } = await postWebhook(body, await signedHeaders(body));
  assertEquals(status, 200);
  assertEquals(json.ignored, true);
});

Deno.test('resend-webhook: malformed JSON is rejected with 400 once signature passes', async () => {
  const rawBody = '{not valid json';
  const { status } = await postWebhook(rawBody, await signedHeaders(rawBody));
  assertEquals(status, 400);
});

Deno.test('resend-webhook: a suppressed recipient stays suppressed until cleared', async () => {
  const recipient = `ci-scratch-${Date.now()}-roundtrip@wyskerwatch.com`;
  const admin = adminClient();
  await admin.from('email_suppressions').insert({ email: recipient, reason: 'bounced' });
  try {
    const sendResp = await fetch(functionsUrl('send-email'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipient,
        template: 'welcome',
        variables: { first_name: 'Test', app_url: 'https://www.wyskerwatch.com' },
      }),
    });
    const sendJson = await sendResp.json();
    assertEquals(sendJson.suppressed, true);
    assertEquals(sendJson.messageId, null);

    const clearResp = await fetch(functionsUrl('clear-email-suppression'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: recipient, clearedBy: 'resend-webhook integration test' }),
    });
    assertEquals(clearResp.status, 200);

    const { data: cleared } = await admin
      .from('email_suppressions')
      .select('cleared_at, cleared_by')
      .eq('email', recipient)
      .single();
    assertExists(cleared?.cleared_at);
    assertEquals(cleared?.cleared_by, 'resend-webhook integration test');
  } finally {
    await cleanupSuppression(recipient);
  }
});
