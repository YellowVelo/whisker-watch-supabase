// Integration tests for the deployed finish-account-setup Edge Function
// (spec 0086), run against wysker-watch-dev over HTTP (see
// _shared/testHelpers.ts for the required env vars).
//
// Every email-link session here comes from a REAL link: minted with the
// service role (admin.generateLink) and redeemed with verifyOtp, exactly
// as the inbox owner's click on /verify-email does. Account states are
// never faked with updateUserById (spec 0086 planning decision 7): the
// function decides "needs a password" from the session's amr claim, so
// only a real link redemption produces the state under test.
//
// Supabase Auth limits sign-ins and link redemptions per IP, so each test
// makes at most one or two accounts and sessions.
//
// The first test calls the deployed sign-up function, which sends a real
// email to a synthetic address. Like sign-up/index.test.ts it is
// local-only (planning decision 8) and skipped in CI; the test after it
// covers the same takeover in CI without sending email.
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/functions/finish-account-setup/index.test.ts

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type Session } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  adminClient,
  callFunction,
  createScratchUser,
  deleteScratchUser,
  functionsUrl,
  requireEnv,
} from '../_shared/testHelpers.ts';
import { PRIVACY_VERSION, TOS_VERSION } from '../_shared/legalVersions.ts';
import { PASSWORD_BREACHED_ERROR, PASSWORD_LENGTH_ERROR } from '../_shared/passwordPolicy.ts';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const IN_CI = Deno.env.get('CI') === 'true';

let scratchCounter = 0;
function scratchEmail(label: string): string {
  scratchCounter += 1;
  return `ci-scratch-${Date.now()}-${scratchCounter}-${label}@wyskerwatch.com`;
}

// A password that is the right length and won't be on a breach list.
function freshPassword(): string {
  return `Fin-${crypto.randomUUID()}`;
}

function anonClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Redeems a token the way /verify-email does and returns the session.
async function redeem(tokenHash: string, type: 'signup' | 'recovery'): Promise<Session> {
  const { data, error } = await anonClient().auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data?.session) {
    throw new Error(`Failed to redeem a ${type} link: ${error?.message}`);
  }
  return data.session;
}

// A fresh account made the way sign-up makes one (an invite link,
// decision 5), with its link clicked: confirmed, an email-link session,
// no consent.
async function createClickedAccount(label: string): Promise<{ userId: string; email: string; session: Session }> {
  const email = scratchEmail(label);
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'invite', email });
  if (error || !data?.user || !data.properties?.hashed_token) {
    throw new Error(`Failed to create scratch account: ${error?.message}`);
  }
  const userId = data.user.id;
  try {
    const session = await redeem(data.properties.hashed_token, 'signup');
    assertEquals(session.user.id, userId);
    return { userId, email, session };
  } catch (err) {
    await deleteScratchUser(userId);
    throw err;
  }
}

// Another real email-link session on an existing account (a recovery
// link, the kind sign-up's resend sends).
async function recoveryLinkSession(email: string): Promise<Session> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`Failed to generate recovery link: ${error?.message}`);
  }
  return await redeem(data.properties.hashed_token, 'recovery');
}

async function passwordWorks(email: string, password: string): Promise<boolean> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  return !error && !!data?.session;
}

async function consentRow(userId: string) {
  const { data, error } = await adminClient()
    .from('profiles')
    .select('terms_accepted_at, terms_version, privacy_version, marketing_opt_in')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return data as {
    terms_accepted_at: string | null;
    terms_version: string | null;
    privacy_version: string | null;
    marketing_opt_in: boolean;
  };
}

async function isConfirmed(userId: string): Promise<boolean> {
  const { data } = await adminClient().auth.admin.getUserById(userId);
  return !!data?.user?.email_confirmed_at;
}

Deno.test({
  name: 'finish-account-setup: sign-up with password A, the inbox owner finishes with B: only B works (AC2, AC3)',
  ignore: IN_CI,
  fn: async () => {
    const email = scratchEmail('takeover-signup');
    const passwordA = freshPassword();
    const passwordB = freshPassword();
    const admin = adminClient();
    let userId: string | null = null;
    try {
      // An old cached sign-up page, filled in by someone who doesn't own
      // the inbox, still sends a password.
      const signup = await callFunction('sign-up', '', {
        action: 'signup',
        email,
        password: passwordA,
        accepted_terms: true,
        first_name: 'Scratch',
      });
      assertEquals(signup.status, 200);
      const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
      assertExists(profile);
      userId = profile!.id as string;

      // The inbox owner redeems a real link (recovery, the kind resend
      // sends; the sign-up email's own token can't be read here).
      const session = await recoveryLinkSession(email);
      assertEquals(session.user.id, userId);

      const status = await callFunction('finish-account-setup', session.access_token, { action: 'status' });
      assertEquals(status.status, 200);
      assertEquals(status.json, { needs_password: true, needs_consent: true });

      const finish = await callFunction('finish-account-setup', session.access_token, {
        action: 'finish',
        password: passwordB,
        accepted_terms: true,
      });
      assertEquals(finish.status, 200);
      assertEquals(finish.json, { finished: true });

      assertEquals(await passwordWorks(email, passwordA), false);
      assertEquals(await passwordWorks(email, passwordB), true);
      assertEquals(await isConfirmed(userId), true);
    } finally {
      await admin.from('email_logs').delete().eq('recipient_email', email);
      if (userId) await deleteScratchUser(userId);
    }
  },
});

Deno.test('finish-account-setup: an older unconfirmed account made with password A, finished with B: only B works (AC3)', async () => {
  // Accounts made before spec 0086 were created with the sign-up form's
  // password and left unconfirmed. CI-safe version of the test above: no
  // email is sent.
  const email = scratchEmail('takeover-old-account');
  const passwordA = freshPassword();
  const passwordB = freshPassword();
  const admin = adminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: passwordA,
    email_confirm: false,
  });
  if (createError || !created?.user) throw new Error(`Failed to create scratch user: ${createError?.message}`);
  const userId = created.user.id;
  try {
    const session = await recoveryLinkSession(email);
    assertEquals(session.user.id, userId);

    const finish = await callFunction('finish-account-setup', session.access_token, {
      action: 'finish',
      password: passwordB,
      accepted_terms: true,
    });
    assertEquals(finish.status, 200);
    assertEquals(finish.json, { finished: true });

    assertEquals(await passwordWorks(email, passwordA), false);
    assertEquals(await passwordWorks(email, passwordB), true);
    assertEquals(await isConfirmed(userId), true);
  } finally {
    await deleteScratchUser(userId);
  }
});

Deno.test('finish-account-setup: finishing with a password ends every session on the account (AC6) and records marketing as sent (AC7)', async () => {
  const { userId, email, session: first } = await createClickedAccount('other-sessions');
  try {
    const second = await recoveryLinkSession(email);
    assertEquals(second.user.id, userId);
    const newPassword = freshPassword();

    const finish = await callFunction('finish-account-setup', first.access_token, {
      action: 'finish',
      password: newPassword,
      accepted_terms: true,
      marketing_opt_in: false,
    });
    assertEquals(finish.status, 200);

    const { data: secondRefresh, error: secondError } = await anonClient().auth.refreshSession({
      refresh_token: second.refresh_token,
    });
    assertExists(secondError);
    assertEquals(secondRefresh?.session ?? null, null);

    // Setting a password makes Supabase Auth end the finishing session
    // too; the person signs in again with the new password.
    const { data: firstRefresh, error: firstError } = await anonClient().auth.refreshSession({
      refresh_token: first.refresh_token,
    });
    assertExists(firstError);
    assertEquals(firstRefresh?.session ?? null, null);
    assertEquals(await passwordWorks(email, newPassword), true);

    assertEquals((await consentRow(userId)).marketing_opt_in, false);
  } finally {
    await deleteScratchUser(userId);
  }
});

Deno.test('finish-account-setup: refuses without the Terms tick, and refuses breached and out-of-range passwords, changing nothing (AC4, AC5)', async () => {
  const { userId, email, session } = await createClickedAccount('refusals');
  try {
    const goodPassword = freshPassword();
    const call = (body: Record<string, unknown>) => callFunction('finish-account-setup', session.access_token, body);

    for (const acceptedTerms of [undefined, false, 'true', 1]) {
      const body: Record<string, unknown> = { action: 'finish', password: goodPassword };
      if (acceptedTerms !== undefined) body.accepted_terms = acceptedTerms;
      const res = await call(body);
      assertEquals(res.status, 400, `accepted_terms=${String(acceptedTerms)}`);
      assertEquals(res.json, { error: GENERIC_ERROR });
    }

    const breached = await call({ action: 'finish', password: 'password123', accepted_terms: true });
    assertEquals(breached.status, 400);
    assertEquals(breached.json, { error: PASSWORD_BREACHED_ERROR });

    for (const badPassword of [undefined, 'short', 'x'.repeat(129), 12345678]) {
      const body: Record<string, unknown> = { action: 'finish', accepted_terms: true };
      if (badPassword !== undefined) body.password = badPassword;
      const res = await call(body);
      assertEquals(res.status, 400, `password=${String(badPassword).slice(0, 20)}`);
      assertEquals(res.json, { error: PASSWORD_LENGTH_ERROR });
    }

    // Nothing was recorded and no refused password was saved.
    const row = await consentRow(userId);
    assertEquals(row.terms_accepted_at, null);
    assertEquals(row.terms_version, null);
    assertEquals(row.privacy_version, null);
    assertEquals(await passwordWorks(email, goodPassword), false);
    assertEquals(await passwordWorks(email, 'password123'), false);

    // The email-link sign-in method survives a refresh, so the refreshed
    // session still needs a password (decision 7).
    const { data: refreshed, error: refreshError } = await anonClient().auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    assertEquals(refreshError, null);
    const status = await callFunction('finish-account-setup', refreshed!.session!.access_token, { action: 'status' });
    assertEquals(status.json, { needs_password: true, needs_consent: true });
  } finally {
    await deleteScratchUser(userId);
  }
});

Deno.test('finish-account-setup: records consent with the server versions; a second finish keeps the original (AC7, AC8)', async () => {
  const { userId, email, session } = await createClickedAccount('consent-recorded');
  try {
    const before = Date.now();
    const newPassword = freshPassword();
    const finish = await callFunction('finish-account-setup', session.access_token, {
      action: 'finish',
      password: newPassword,
      accepted_terms: true,
      marketing_opt_in: true,
    });
    assertEquals(finish.status, 200);

    const first = await consentRow(userId);
    assertExists(first.terms_accepted_at);
    assert(new Date(first.terms_accepted_at!).getTime() >= before - 60_000);
    assertEquals(first.terms_version, TOS_VERSION);
    assertEquals(first.privacy_version, PRIVACY_VERSION);
    assertEquals(first.marketing_opt_in, true);

    // The finishing session ended with the password change; sign in with
    // the new password, as the page does.
    const { data: signedIn, error: signInError } = await anonClient().auth.signInWithPassword({
      email,
      password: newPassword,
    });
    assertEquals(signInError, null);
    const token = signedIn!.session!.access_token;

    const status = await callFunction('finish-account-setup', token, { action: 'status' });
    assertEquals(status.json, { needs_password: false, needs_consent: false });

    // A second finish (no password: none is needed now) changes nothing,
    // even with a different marketing answer.
    const again = await callFunction('finish-account-setup', token, {
      action: 'finish',
      accepted_terms: true,
      marketing_opt_in: false,
    });
    assertEquals(again.status, 200);
    assertEquals(await consentRow(userId), first);
  } finally {
    await deleteScratchUser(userId);
  }
});

Deno.test('finish-account-setup: an email-link session on an account with consent recorded cannot set a password (AC13)', async () => {
  const { userId, email, session } = await createClickedAccount('consent-then-link');
  try {
    const finish = await callFunction('finish-account-setup', session.access_token, {
      action: 'finish',
      password: freshPassword(),
      accepted_terms: true,
    });
    assertEquals(finish.status, 200);

    // A later email link (e.g. a password-reset link) is also an 'otp'
    // session, but consent is on record, so no password is accepted here.
    const later = await recoveryLinkSession(email);
    const status = await callFunction('finish-account-setup', later.access_token, { action: 'status' });
    assertEquals(status.json, { needs_password: false, needs_consent: false });

    const attempted = freshPassword();
    const refused = await callFunction('finish-account-setup', later.access_token, {
      action: 'finish',
      password: attempted,
      accepted_terms: true,
    });
    assertEquals(refused.status, 400);
    assertEquals(refused.json, { error: GENERIC_ERROR });
    assertEquals(await passwordWorks(email, attempted), false);
  } finally {
    await deleteScratchUser(userId);
  }
});

Deno.test('finish-account-setup: a password-login session with no consent sees consent only, cannot set a password, and finishing ends only the other sessions (AC6, AC11, AC13)', async () => {
  // An existing confirmed account with a password and no consent, signed
  // in twice with that password (amr 'password').
  const email = scratchEmail('password-session');
  const existingPassword = freshPassword();
  const { data: created, error: createError } = await adminClient().auth.admin.createUser({
    email,
    password: existingPassword,
    email_confirm: true,
  });
  if (createError || !created?.user) throw new Error(`Failed to create scratch user: ${createError?.message}`);
  const signInSession = async (): Promise<Session> => {
    const { data, error } = await anonClient().auth.signInWithPassword({ email, password: existingPassword });
    if (error || !data?.session) throw new Error(`Failed to sign in scratch user: ${error?.message}`);
    return data.session;
  };
  const user = { userId: created.user.id, email };
  try {
    const caller = await signInSession();
    const other = await signInSession();
    const accessToken = caller.access_token;
    assertEquals((await consentRow(user.userId)).terms_accepted_at, null);

    const status = await callFunction('finish-account-setup', accessToken, { action: 'status' });
    assertEquals(status.status, 200);
    assertEquals(status.json, { needs_password: false, needs_consent: true });

    const attempted = freshPassword();
    const refused = await callFunction('finish-account-setup', accessToken, {
      action: 'finish',
      password: attempted,
      accepted_terms: true,
    });
    assertEquals(refused.status, 400);
    assertEquals(refused.json, { error: GENERIC_ERROR });
    assertEquals((await consentRow(user.userId)).terms_accepted_at, null);

    const finish = await callFunction('finish-account-setup', accessToken, {
      action: 'finish',
      accepted_terms: true,
    });
    assertEquals(finish.status, 200);
    assertEquals(finish.json, { finished: true });
    const row = await consentRow(user.userId);
    assertExists(row.terms_accepted_at);
    assertEquals(row.terms_version, TOS_VERSION);
    assertEquals(row.privacy_version, PRIVACY_VERSION);
    assertEquals(await passwordWorks(user.email, attempted), false);

    // No password was set, so the caller's session stays; the other one
    // ends (AC6).
    const { error: callerRefreshError } = await anonClient().auth.refreshSession({
      refresh_token: caller.refresh_token,
    });
    assertEquals(callerRefreshError, null);
    const { error: otherRefreshError } = await anonClient().auth.refreshSession({
      refresh_token: other.refresh_token,
    });
    assertExists(otherRefreshError);
  } finally {
    await deleteScratchUser(user.userId);
  }
});

Deno.test('finish-account-setup: leaving out marketing_opt_in keeps the current setting (decision 4)', async () => {
  const { userId, session } = await createClickedAccount('marketing-omitted');
  try {
    // Fixture: the person opted in earlier (a column they may change
    // themselves); set with the service role.
    const { error: fixtureError } = await adminClient()
      .from('profiles')
      .update({ marketing_opt_in: true })
      .eq('id', userId);
    assertEquals(fixtureError, null);

    const finish = await callFunction('finish-account-setup', session.access_token, {
      action: 'finish',
      password: freshPassword(),
      accepted_terms: true,
    });
    assertEquals(finish.status, 200);

    const row = await consentRow(userId);
    assertExists(row.terms_accepted_at);
    assertEquals(row.marketing_opt_in, true);
  } finally {
    await deleteScratchUser(userId);
  }
});

Deno.test('finish-account-setup: refuses no login (401), a garbage token (401) and a wrong action (400)', async () => {
  const user = await createScratchUser('bad-requests');
  try {
    const noAuth = await fetch(functionsUrl('finish-account-setup'), {
      method: 'POST',
      headers: { apikey: requireEnv('SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    await noAuth.body?.cancel();
    assertEquals(noAuth.status, 401);

    const garbage = await callFunction('finish-account-setup', 'not-a-real-token', { action: 'status' });
    assertEquals(garbage.status, 401);

    for (const action of [undefined, 'confirm', 'STATUS']) {
      const body: Record<string, unknown> = action === undefined ? {} : { action };
      const res = await callFunction('finish-account-setup', user.accessToken, body);
      assertEquals(res.status, 400, `action=${String(action)}`);
      assertEquals(res.json, { error: GENERIC_ERROR });
    }

    // None of those recorded anything.
    assertEquals((await consentRow(user.userId)).terms_accepted_at, null);
  } finally {
    await deleteScratchUser(user.userId);
  }
});
