// Integration tests for the deployed sign-up Edge Function, run against wysker-watch-dev over HTTP (see
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
import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { adminClient, callFunction, deleteScratchUser, requireEnv } from '../_shared/testHelpers.ts';

let scratchCounter = 0;
function scratchEmail(label: string): string {
  scratchCounter += 1;
  return `ci-scratch-${Date.now()}-${scratchCounter}-${label}@wyskerwatch.com`;
}

// sendEmail() writes an email_logs row for every attempt (sent, failed or
// suppressed), so a verify-email row for the address is the observable
// that a link was (or wasn't) sent.
async function verifyEmailLogCount(email: string): Promise<number> {
  const { data, error } = await adminClient()
    .from('email_logs')
    .select('id')
    .eq('recipient_email', email)
    .eq('template_name', 'verify-email');
  if (error) throw new Error(`email_logs lookup failed: ${error.message}`);
  return data?.length ?? 0;
}

async function deleteEmailLogs(email: string): Promise<void> {
  await adminClient().from('email_logs').delete().eq('recipient_email', email);
}

function anonClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
  });
}

// Makes an account the way sign-up does (an invite link, spec 0086
// planning decision 5) and then really redeems that link with verifyOtp,
// as the inbox owner's click on /verify-email does (type=signup, the type
// the sign-up email carries). Nothing is faked with updateUserById: the
// click confirms the account and Supabase stores its own random password
// (decision 7). No consent is recorded, as if the finish page was closed.
async function createClickedSignupUser(email: string): Promise<string> {
  const admin = adminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'invite', email });
  if (linkError || !linkData?.user || !linkData.properties?.hashed_token) {
    throw new Error(`Failed to create scratch user: ${linkError?.message}`);
  }
  const userId = linkData.user.id;
  const { data: verified, error: verifyError } = await anonClient().auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'signup',
  });
  if (verifyError || verified?.session?.user?.id !== userId) {
    await deleteScratchUser(userId);
    throw new Error(`Failed to redeem the scratch user's link: ${verifyError?.message}`);
  }
  return userId;
}

Deno.test('sign-up: signup creates an unconfirmed account with no password and returns the generic success shape', async () => {
  // The current sign-up page's request: first name and email only, no
  // password field (spec 0086).
  const email = scratchEmail('signup-happy');
  let userId: string | null = null;
  try {
    const { status, json } = await callFunction('sign-up', '', {
      action: 'signup',
      email,
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

    const { data: hasPassword, error: hasPasswordError } = await admin.rpc('email_has_password', { p_email: email });
    assertEquals(hasPasswordError, null);
    assertEquals(hasPassword, false);

    // A link was sent (sendEmail logs every attempt).
    assertEquals(await verifyEmailLogCount(email), 1);
  } finally {
    await deleteEmailLogs(email);
    if (userId) await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: signing up twice for the same (still-unconfirmed) email does not create a duplicate account', async () => {
  const email = scratchEmail('signup-dupe');
  let userId: string | null = null;
  try {
    const first = await callFunction('sign-up', '', { action: 'signup', email });
    assertEquals(first.status, 200);

    const admin = adminClient();
    const { data: firstProfile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    assertExists(firstProfile);
    userId = firstProfile!.id as string;

    const second = await callFunction('sign-up', '', { action: 'signup', email });

    // Same generic shape as the first call — a caller can't tell "brand
    // new" from "already has an unconfirmed row" apart.
    assertEquals(second.status, 200);
    assertEquals(second.json.sent, true);

    const { data: allProfiles } = await admin.from('profiles').select('id').eq('email', email);
    assertEquals(allProfiles?.length, 1);

    // Still unconfirmed, so the second call resends.
    assertEquals(await verifyEmailLogCount(email), 2);
  } finally {
    await deleteEmailLogs(email);
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

Deno.test('sign-up: sending a password still leaves the account with no password (spec 0086)', async () => {
  // An old cached sign-up page still sends password + accepted_terms. The
  // request must still work, and the account must not get that password:
  // only the inbox owner sets one, on the finish page.
  const email = scratchEmail('signup-ignores-password');
  let userId: string | null = null;
  try {
    const { status, json } = await callFunction('sign-up', '', {
      action: 'signup',
      email,
      password: 'a-scratch-password-123',
      accepted_terms: true,
      marketing_opt_in: true,
      first_name: 'Scratch',
    });
    assertEquals(status, 200);
    assertEquals(json.sent, true);
    assertEquals(Object.keys(json).length, 1);

    const admin = adminClient();
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    assertExists(profile);
    userId = profile!.id as string;

    // Before any link is clicked, nothing is stored as a password.
    const { data: hasPassword, error: hasPasswordError } = await admin.rpc('email_has_password', { p_email: email });
    assertEquals(hasPasswordError, null);
    assertEquals(hasPassword, false);

    // Redeem a real link for the account (a recovery link, the kind the
    // resend path sends; the sign-up email's own token can't be read
    // here). Once confirmed, the password the old page sent still fails.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'recovery', email });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(`Failed to generate recovery link: ${linkError?.message}`);
    }
    const { data: verified, error: verifyError } = await anonClient().auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'recovery',
    });
    assertEquals(verifyError, null);
    assertEquals(verified?.session?.user?.id, userId);
    const { data: confirmedUser } = await admin.auth.admin.getUserById(userId);
    assertExists(confirmedUser?.user?.email_confirmed_at);

    const { data: signInData, error: signInError } = await anonClient().auth.signInWithPassword({
      email,
      password: 'a-scratch-password-123',
    });
    assertExists(signInError);
    assertEquals(signInData?.session ?? null, null);

    // Metadata keeps only first_name; no consent or marketing fields.
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    assertEquals(authUser?.user?.user_metadata?.first_name, 'Scratch');
    assertEquals(authUser?.user?.user_metadata?.terms_accepted_at, undefined);
    assertEquals(authUser?.user?.user_metadata?.terms_version, undefined);
    assertEquals(authUser?.user?.user_metadata?.privacy_version, undefined);
    assertEquals(authUser?.user?.user_metadata?.marketing_opt_in, undefined);
  } finally {
    await deleteEmailLogs(email);
    if (userId) await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: resend sends a fresh link after a real link click when no consent is recorded (spec 0086 decisions 1, 7)', async () => {
  const email = scratchEmail('resend-clicked-no-consent');
  const admin = adminClient();
  const userId = await createClickedSignupUser(email);
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    assertExists(authUser?.user?.email_confirmed_at);
    const { data: profile } = await admin.from('profiles').select('terms_accepted_at').eq('id', userId).single();
    assertEquals(profile?.terms_accepted_at ?? null, null);

    const { status, json } = await callFunction('sign-up', '', { action: 'resend', email });
    assertEquals(status, 200);
    assertEquals(json.sent, true);
    assertEquals(Object.keys(json).length, 1);

    assertEquals(await verifyEmailLogCount(email), 1);
  } finally {
    await deleteEmailLogs(email);
    await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: signup sends a fresh link after a real link click when no consent is recorded (spec 0086 decisions 1, 7)', async () => {
  const email = scratchEmail('signup-clicked-no-consent');
  const admin = adminClient();
  const userId = await createClickedSignupUser(email);
  try {
    const { status, json } = await callFunction('sign-up', '', { action: 'signup', email, first_name: 'Scratch' });
    assertEquals(status, 200);
    assertEquals(json.sent, true);
    assertEquals(Object.keys(json).length, 1);

    assertEquals(await verifyEmailLogCount(email), 1);

    // No second account.
    const { data: allProfiles } = await admin.from('profiles').select('id').eq('email', email);
    assertEquals(allProfiles?.length, 1);
  } finally {
    await deleteEmailLogs(email);
    await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: signup and resend send nothing to a confirmed account with consent recorded (same generic response)', async () => {
  const email = scratchEmail('confirmed-with-consent');
  const admin = adminClient();
  const userId = await createClickedSignupUser(email);
  try {
    // Fixture: the finish page's consent write, done with the service role.
    const { error: consentError } = await admin
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString(), terms_version: 'test', privacy_version: 'test' })
      .eq('id', userId);
    assertEquals(consentError, null);

    const resend = await callFunction('sign-up', '', { action: 'resend', email });
    assertEquals(resend.status, 200);
    assertEquals(resend.json.sent, true);
    assertEquals(Object.keys(resend.json).length, 1);

    const signup = await callFunction('sign-up', '', { action: 'signup', email, first_name: 'Scratch' });
    assertEquals(signup.status, 200);
    assertEquals(signup.json.sent, true);
    assertEquals(Object.keys(signup.json).length, 1);

    assertEquals(await verifyEmailLogCount(email), 0);
  } finally {
    await deleteEmailLogs(email);
    await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: signup and resend send a link to an older unconfirmed account that has a password (same generic response)', async () => {
  // Accounts made before spec 0086 were created with a password and left
  // unconfirmed until the link was clicked.
  const email = scratchEmail('unconfirmed-with-password');
  const admin = adminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: 'a-scratch-password-123',
    email_confirm: false,
  });
  if (createError || !created?.user) throw new Error(`Failed to create scratch user: ${createError?.message}`);
  const userId = created.user.id;
  try {
    assertEquals(created.user.email_confirmed_at ?? null, null);

    const signup = await callFunction('sign-up', '', { action: 'signup', email, first_name: 'Scratch' });
    assertEquals(signup.status, 200);
    assertEquals(signup.json.sent, true);
    assertEquals(Object.keys(signup.json).length, 1);
    assertEquals(await verifyEmailLogCount(email), 1);

    const resend = await callFunction('sign-up', '', { action: 'resend', email });
    assertEquals(resend.status, 200);
    assertEquals(resend.json.sent, true);
    assertEquals(Object.keys(resend.json).length, 1);
    assertEquals(await verifyEmailLogCount(email), 2);

    // Still one account.
    const { data: allProfiles } = await admin.from('profiles').select('id').eq('email', email);
    assertEquals(allProfiles?.length, 1);
  } finally {
    await deleteEmailLogs(email);
    await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: signup for a pending invitee does not replace their invite link', async () => {
  // invite-co-owner/invite-sitter create the invitee's account with an
  // invite link. A sign-up for that address must go to the resend path
  // (a recovery link) without minting a new invite token, so the link in
  // the invite email still works.
  const email = scratchEmail('signup-pending-invitee');
  const admin = adminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'invite', email });
  if (linkError || !linkData?.user || !linkData.properties?.hashed_token) {
    throw new Error(`Failed to create scratch invitee: ${linkError?.message}`);
  }
  const userId = linkData.user.id;
  const inviteHash = linkData.properties.hashed_token;
  try {
    const { status, json } = await callFunction('sign-up', '', { action: 'signup', email, first_name: 'Scratch' });
    assertEquals(status, 200);
    assertEquals(json.sent, true);
    assertEquals(Object.keys(json).length, 1);
    assertEquals(await verifyEmailLogCount(email), 1);

    // A re-minted invite token would have replaced this one.
    const anon = anonClient();
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: inviteHash, type: 'invite' });
    assertEquals(verifyError, null);
    assertEquals(verified?.session?.user?.id, userId);
  } finally {
    await deleteEmailLogs(email);
    await deleteScratchUser(userId);
  }
});

Deno.test('sign-up: an invite-minted token redeems as type signup (the link type new sign-ups are sent)', async () => {
  // New sign-ups are created with generateLink({type:'invite'}) but the
  // emailed link says type=signup, because the frontend live before spec
  // 0086's is promoted accepts only signup/recovery. GoTrue stores both as
  // a confirmation token, so verifyOtp must accept it as 'signup'.
  const email = scratchEmail('invite-redeems-as-signup');
  const admin = adminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'invite', email });
  if (linkError || !linkData?.user || !linkData.properties?.hashed_token) {
    throw new Error(`Failed to create scratch user: ${linkError?.message}`);
  }
  const userId = linkData.user.id;
  try {
    const anon = anonClient();
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'signup',
    });
    assertEquals(verifyError, null);
    assertExists(verified?.session);
    assertEquals(verified!.session!.user.id, userId);

    const { data: afterUser } = await admin.auth.admin.getUserById(userId);
    assertExists(afterUser?.user?.email_confirmed_at);
  } finally {
    await deleteScratchUser(userId);
  }
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
