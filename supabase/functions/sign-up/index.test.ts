// Integration tests for the deployed sign-up and confirm-email Edge
// Functions, run against wysker-watch-dev over HTTP (see
// _shared/testHelpers.ts for the required env vars).
//
// sign-up is a PUBLIC, unauthenticated endpoint — every call here uses an
// empty access token (callFunction('', ...)), the same way a real
// unauthenticated browser request would.
//
// Note on real email sends: unlike delete-pet/delete-account (which never
// trigger sendEmail()), a successful 'signup' call here does attempt a
// real Resend send to a synthetic ci-scratch-*@wyskerwatch.com address
// that has no real inbox. That's a deliberate, accepted tradeoff (same
// domain convention createScratchUser already uses elsewhere), but it
// does mean these tests generate real bounces against wyskerwatch.com's
// Resend account unless/until a Resend sandbox/test-mode key is set up
// for CI — flagged here rather than silently accepted.
//
// Run: deno test --allow-net --allow-env supabase/functions/sign-up/index.test.ts

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { adminClient, callFunction, deleteScratchUser, functionsUrl, requireEnv } from '../_shared/testHelpers.ts';

let scratchCounter = 0;
function scratchEmail(label: string): string {
  scratchCounter += 1;
  return `ci-scratch-${Date.now()}-${scratchCounter}-${label}@wyskerwatch.com`;
}

Deno.test('sign-up: signup creates an unconfirmed account and returns the generic success shape', async () => {
  const email = scratchEmail('signup-happy');
  let userId: string | null = null;
  try {
    const { status, json } = await callFunction('sign-up', '', {
      action: 'signup',
      email,
      password: 'a-scratch-password-123',
      first_name: 'Scratch',
    });

    assertEquals(status, 200);
    assertEquals(json.sent, true);
    // No extra fields that would let a caller distinguish this from any
    // other outcome (already-registered, suppressed, etc.) — see the
    // function's header comment on enumeration safety.
    assertEquals(Object.keys(json).length, 1);

    const admin = adminClient();
    const { data: userRow } = await admin
      .from('profiles')
      .select('id, first_name, account_type')
      .eq('email', email)
      .maybeSingle();
    assertExists(userRow);
    userId = userRow!.id as string;
    assertEquals(userRow!.first_name, 'Scratch');
    assertEquals(userRow!.account_type, 'production');

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    assertEquals(authUser?.user?.email_confirmed_at ?? null, null);
  } finally {
    if (userId) await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: signing up twice for the same (still-unconfirmed) email does not create a duplicate account', async () => {
  const email = scratchEmail('signup-dupe');
  let userId: string | null = null;
  try {
    const first = await callFunction('sign-up', '', {
      action: 'signup',
      email,
      password: 'a-scratch-password-123',
    });
    assertEquals(first.status, 200);

    const admin = adminClient();
    const { data: firstProfile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    assertExists(firstProfile);
    userId = firstProfile!.id as string;

    const second = await callFunction('sign-up', '', {
      action: 'signup',
      email,
      password: 'a-different-scratch-pw-456',
    });

    // Same generic shape as the first call — a caller can't tell "brand
    // new" from "already has an unconfirmed row" apart.
    assertEquals(second.status, 200);
    assertEquals(second.json.sent, true);

    const { data: allProfiles } = await admin.from('profiles').select('id').eq('email', email);
    assertEquals(allProfiles?.length, 1);
  } finally {
    if (userId) await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: resend for an email with no account is enumeration-safe (same generic response, no account created)', async () => {
  const email = scratchEmail('resend-nonexistent');

  const { status, json } = await callFunction('sign-up', '', { action: 'resend', email });

  assertEquals(status, 200);
  assertEquals(json.sent, true);

  const admin = adminClient();
  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  assertEquals(profile, null);
});

Deno.test('sign-up: rejects a request with no password on signup', async () => {
  const email = scratchEmail('signup-no-password');

  const { status, json } = await callFunction('sign-up', '', { action: 'signup', email });

  assertEquals(status, 400);
  assertExists(json.error);

  const admin = adminClient();
  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  assertEquals(profile, null);
});

Deno.test('sign-up: rate limit blocks repeated attempts for the same email within the window', async () => {
  const email = scratchEmail('rate-limited');
  const createdUserIds: string[] = [];
  try {
    // The rate limit (5/hour, see migration 0039) is keyed by email
    // regardless of action, so repeated 'resend' calls for a
    // non-existent address exercise it without creating 5 real accounts.
    let lastStatus = 200;
    for (let i = 0; i < 6; i += 1) {
      const { status } = await callFunction('sign-up', '', { action: 'resend', email });
      lastStatus = status;
    }

    assertEquals(lastStatus, 429);
  } finally {
    for (const id of createdUserIds) await deleteScratchUser(id);
  }
});

Deno.test('confirm-email: marks the caller\'s own account confirmed, independent of token type', async () => {
  const email = scratchEmail('confirm-email');
  const admin = adminClient();

  // Create the account the same way sign-up's own 'signup' action does,
  // but mint our own recovery-type token directly via the admin API so
  // this test doesn't depend on reading the real confirmation email
  // sign-up would have sent.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: 'a-scratch-password-123',
    email_confirm: false,
  });
  if (createError || !created?.user) throw new Error(`Failed to create scratch user: ${createError?.message}`);
  const userId = created.user.id;

  try {
    assertEquals(created.user.email_confirmed_at ?? null, null);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(`Failed to generate recovery link: ${linkError?.message}`);
    }

    const anonUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const { createClient } = await import('jsr:@supabase/supabase-js@2');
    const anon = createClient(anonUrl, anonKey);
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'recovery',
    });
    if (verifyError || !verified?.session) {
      throw new Error(`Failed to verify recovery token: ${verifyError?.message}`);
    }

    const res = await fetch(functionsUrl('confirm-email'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${verified.session.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const json = await res.json();

    assertEquals(res.status, 200);
    assertEquals(json.confirmed, true);

    const { data: afterUser } = await admin.auth.admin.getUserById(userId);
    assertExists(afterUser?.user?.email_confirmed_at);
  } finally {
    await deleteScratchUser(userId);
  }
});
