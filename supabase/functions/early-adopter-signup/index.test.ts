// Integration tests for the deployed early-adopter-signup Edge Function,
// run against wysker-watch-dev over HTTP (see _shared/testHelpers.ts for
// the required env vars).
//
// early-adopter-signup is a PUBLIC, unauthenticated endpoint — every call
// here uses an empty access token, the same way a real unauthenticated
// browser request would. Modeled directly on
// supabase/functions/beta-signup/index.test.ts.
//
// Turnstile: wysker-watch-dev's TURNSTILE_SECRET_KEY is set to
// Cloudflare's documented "always passes" testing secret
// (1x0000000000000000000000000000000AA), which returns success for any
// non-empty response token — these tests send a fixed placeholder token
// rather than driving a real browser widget. See
// docs/features/0056_Early_Adopters_Welcome_Page_Specification_v1.md.
//
// Note on real email sends: like beta-signup's tests, a successful call
// here triggers a real Resend send to a synthetic ci-scratch-*@wyskerwatch.com
// address with no real inbox — same accepted tradeoff, flagged here
// rather than silently accepted.
//
// Run: deno test --allow-net --allow-env supabase/functions/early-adopter-signup/index.test.ts

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { adminClient, callFunction } from '../_shared/testHelpers.ts';

let scratchCounter = 0;
function scratchEmail(label: string): string {
  scratchCounter += 1;
  return `ci-scratch-${Date.now()}-${scratchCounter}-${label}@wyskerwatch.com`;
}

const PASSING_TURNSTILE_TOKEN = 'ci-test-token';

function validPayload(email: string, overrides: Record<string, unknown> = {}) {
  return {
    first_name: 'Casey',
    email,
    consent: true,
    turnstile_token: PASSING_TURNSTILE_TOKEN,
    ...overrides,
  };
}

async function deleteEarlyAdopter(email: string): Promise<void> {
  const admin = adminClient();
  try {
    await admin.from('early_adopters').delete().eq('email', email);
  } catch {
    // best-effort cleanup, same posture as testHelpers.ts's deleteScratchUser
  }
}

Deno.test('early-adopter-signup: happy path stores the row and returns success', async () => {
  const email = scratchEmail('happy');
  try {
    const { status, json } = await callFunction('early-adopter-signup', '', validPayload(email));

    assertEquals(status, 200);
    assertEquals(json.success, true);

    const admin = adminClient();
    const { data: row } = await admin
      .from('early_adopters')
      .select('first_name, email, consented_at, invited_at')
      .eq('email', email)
      .maybeSingle();
    assertExists(row);
    assertEquals(row!.first_name, 'Casey');
    assertExists(row!.consented_at);
    assertEquals(row!.invited_at, null);
  } finally {
    await deleteEarlyAdopter(email);
  }
});

Deno.test('early-adopter-signup: rejects a missing first name and stores nothing', async () => {
  const email = scratchEmail('no-name');

  const { status, json } = await callFunction('early-adopter-signup', '', validPayload(email, { first_name: '' }));

  assertEquals(status, 400);
  assertExists(json.error);

  const admin = adminClient();
  const { data: row } = await admin.from('early_adopters').select('id').eq('email', email).maybeSingle();
  assertEquals(row, null);
});

Deno.test('early-adopter-signup: rejects an invalid email and stores nothing', async () => {
  const email = 'not-a-valid-email';

  const { status, json } = await callFunction('early-adopter-signup', '', validPayload(email));

  assertEquals(status, 400);
  assertExists(json.error);

  const admin = adminClient();
  const { data: row } = await admin.from('early_adopters').select('id').eq('email', email).maybeSingle();
  assertEquals(row, null);
});

Deno.test('early-adopter-signup: rejects consent !== true and stores nothing', async () => {
  const email = scratchEmail('no-consent');

  const { status, json } = await callFunction('early-adopter-signup', '', validPayload(email, { consent: false }));

  assertEquals(status, 400);
  assertExists(json.error);

  const admin = adminClient();
  const { data: row } = await admin.from('early_adopters').select('id').eq('email', email).maybeSingle();
  assertEquals(row, null);
});

Deno.test('early-adopter-signup: rejects a request with a missing turnstile_token and stores nothing', async () => {
  const email = scratchEmail('no-turnstile');
  try {
    const { status, json } = await callFunction(
      'early-adopter-signup',
      '',
      validPayload(email, { turnstile_token: '' }),
    );

    assertEquals(status, 400);
    assertExists(json.error);

    const admin = adminClient();
    const { data: row } = await admin.from('early_adopters').select('id').eq('email', email).maybeSingle();
    assertEquals(row, null);
  } finally {
    await deleteEarlyAdopter(email);
  }
});

Deno.test('early-adopter-signup: rate limit blocks repeated attempts for the same email within the window', async () => {
  // Limit is 3/hour per email (see index.ts's EMAIL_RATE_LIMIT).
  // Validation and CAPTCHA verification both happen BEFORE the rate
  // limit check (see index.ts), so an invalid payload never consumes
  // rate-limit budget — this test has to send fully valid payloads to
  // actually exercise the limit, which means the first 3 calls really do
  // insert rows that need cleaning up afterward.
  const email = scratchEmail('rate-limited');

  try {
    let lastStatus = 200;
    for (let i = 0; i < 4; i += 1) {
      const { status } = await callFunction('early-adopter-signup', '', validPayload(email));
      lastStatus = status;
    }

    assertEquals(lastStatus, 429);

    const admin = adminClient();
    const { data: rows } = await admin.from('early_adopters').select('id').eq('email', email);
    assertEquals(rows?.length, 3);
  } finally {
    await deleteEarlyAdopter(email);
  }
});
