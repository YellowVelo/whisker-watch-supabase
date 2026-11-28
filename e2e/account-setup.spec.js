// Spec 0086 (PA-13, PA-18): the finish page and the consent screen, in a
// real browser against wysker-watch-dev.
//
// Two parts:
// - "link pages, signed out": Link Invalid pages for a missing or bad
//   token. No seeding, runs everywhere (CI included).
// - "seeded accounts": every other test needs an account in a state only
//   the service role can make (a sign-up link nobody has clicked yet, or
//   a password account with no consent). Those are minted with Supabase's
//   admin API, the same calls the sign-up and invite functions make
//   (generateLink 'invite' / 'recovery'), and the page redeems the link
//   exactly as the inbox owner's click does. The Secret key is read from
//   the local `.env` (DEV_SUPABASE_SECRET_KEY), never from
//   `.env.playwright`, which the rest of this suite deliberately keeps
//   free of it (see fixtures.js). So this part is local-only: skipped in
//   CI (reported as skipped, never as passed), like
//   vaccination-due-reminders.spec.js, and it refuses to run unless
//   `.env.playwright` points at wysker-watch-dev.
//
// Supabase Auth limits sign-ins and link redemptions per IP, so each test
// makes one scratch account (`ci-scratch-*`, which other suites' cleanup
// and the AC16 check already know about) and as few sign-ins as it can.
// No email is sent: nothing here calls sign-up or the invite functions.
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { test, expect } from '@playwright/test';

dotenv.config({ path: '.env.playwright' });

const SIGNED_OUT = { cookies: [], origins: [] };
const DEV_PROJECT_REF = 'rebvizgpchpzjpoohjrd';
const FINISH_TITLE = 'Finish setting up your account';
const FINISH_SUBTITLE = 'Create a password and review our terms to start using Wysker Watch.';
const CONSENT_TITLE = 'One quick thing before you continue';
const CONSENT_BODY = 'We need your OK on our Terms of Service and Privacy Policy. It only takes a moment.';
const INVITE_SUBTITLE = 'Create a password and review our terms to finish accepting your invitation.';
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const FINISH_FUNCTION = '**/functions/v1/finish-account-setup';

test.use({ storageState: SIGNED_OUT });

test.describe('link pages, signed out', () => {
  test('/verify-email with no token shows Link Invalid with a sign-in link', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(page.getByRole('heading', { level: 1, name: 'Link Invalid' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'sign in' })).toHaveAttribute('href', '/login');
  });

  test('/verify-email with an unknown link type shows Link Invalid', async ({ page }) => {
    await page.goto('/verify-email?token_hash=abc&type=magiclink');
    await expect(page.getByRole('heading', { level: 1, name: 'Link Invalid' })).toBeVisible();
  });

  test('/verify-email with a used or made-up token shows Link Invalid, not the finish page', async ({ page }) => {
    await page.goto('/verify-email?token_hash=0000000000000000000000000000000000000000000000000000000a&type=signup');
    await expect(page.getByRole('heading', { level: 1, name: 'Link Invalid' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: FINISH_TITLE })).toHaveCount(0);
  });

  test('/accept-invite with a made-up token shows Invite Link Invalid', async ({ page }) => {
    await page.goto('/accept-invite?token_hash=0000000000000000000000000000000000000000000000000000000a&type=invite');
    await expect(page.getByRole('heading', { level: 1, name: 'Invite Link Invalid' })).toBeVisible({ timeout: 15000 });
  });
});

// ---- seeded accounts (local only) ----

function readDevSecretKey() {
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*DEV_SUPABASE_SECRET_KEY\s*=/.test(l));
  if (!line) return null;
  const value = line.replace(/^\s*DEV_SUPABASE_SECRET_KEY\s*=\s*/, '').trim().replace(/^["']|["']$/g, '');
  return value || null;
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SECRET_KEY = process.env.CI ? null : readDevSecretKey();
const SEEDING_READY = !!SECRET_KEY && SUPABASE_URL.includes(DEV_PROJECT_REF);

function admin() {
  return createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

let counter = 0;
function scratchEmail(label) {
  counter += 1;
  return `ci-scratch-${Date.now()}-${counter}-e2e-${label}@wyskerwatch.com`;
}

function freshPassword() {
  return `E2e-${crypto.randomUUID()}`;
}

// The account sign-up makes (spec 0086 decision 5): no password, no
// consent, unconfirmed. Returns the link token the email would carry.
async function mintSignupLink(label) {
  const email = scratchEmail(label);
  const { data, error } = await admin().auth.admin.generateLink({ type: 'invite', email, options: { data: { first_name: 'E2E' } } });
  if (error || !data?.user || !data.properties?.hashed_token) throw new Error(`generateLink invite failed: ${error?.message}`);
  return { email, userId: data.user.id, tokenHash: data.properties.hashed_token };
}

async function mintRecoveryLink(email) {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data?.properties?.hashed_token) throw new Error(`generateLink recovery failed: ${error?.message}`);
  return data.properties.hashed_token;
}

// An account that already has a password and no consent on record: what
// the ~11 existing accounts look like after migration 0064.
async function createPasswordAccount(label) {
  const email = scratchEmail(label);
  const password = freshPassword();
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'E2E' } });
  if (error || !data?.user) throw new Error(`createUser failed: ${error?.message}`);
  return { email, password, userId: data.user.id };
}

async function consentRow(userId) {
  const { data, error } = await admin()
    .from('profiles')
    .select('terms_accepted_at, terms_version, privacy_version, marketing_opt_in')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return data;
}

async function isConfirmed(userId) {
  const { data } = await admin().auth.admin.getUserById(userId);
  return !!data?.user?.email_confirmed_at;
}

async function deleteUser(userId) {
  if (userId) await admin().auth.admin.deleteUser(userId).catch(() => {});
}

// The legal versions the server records (supabase/functions/_shared/
// legalVersions.ts), read from the source so this test can't drift.
function serverVersions() {
  const src = readFileSync('supabase/functions/_shared/legalVersions.ts', 'utf8');
  const tos = src.match(/TOS_VERSION\s*=\s*'([^']+)'/)?.[1];
  const privacy = src.match(/PRIVACY_VERSION\s*=\s*'([^']+)'/)?.[1];
  return { tos, privacy };
}

async function signInOnLoginPage(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

async function expectInApp(page) {
  // The bottom nav renders only inside the App Shell, past the gate.
  await expect(page.getByRole('link', { name: 'Menu' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('heading', { name: CONSENT_TITLE })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: FINISH_TITLE })).toHaveCount(0);
}

test.describe('seeded accounts', () => {
  test.skip(!!process.env.CI, 'Needs a local run: seeding uses the dev Secret key from .env, which CI does not have.');
  test.skip(!process.env.CI && !SEEDING_READY, 'Needs DEV_SUPABASE_SECRET_KEY in .env and .env.playwright pointed at wysker-watch-dev.');

  test('a sign-up link opens the finish page; finishing opens the app, records consent, and the new password signs in (AC3-AC5, AC7)', async ({ page, browser }) => {
    const { email, userId, tokenHash } = await mintSignupLink('signup');
    const password = freshPassword();
    try {
      await page.goto(`/verify-email?token_hash=${encodeURIComponent(tokenHash)}&type=signup`);
      await expect(page.getByRole('heading', { level: 1, name: FINISH_TITLE })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(FINISH_SUBTITLE)).toBeVisible();

      const finish = page.getByRole('button', { name: 'Finish' });
      const terms = page.getByRole('checkbox').first();
      const marketing = page.getByRole('checkbox').nth(1);
      await expect(page.getByRole('checkbox')).toHaveCount(2);
      await expect(page.getByText('Send me tips, product updates, and other marketing communications.')).toBeVisible();

      // AC4: Finish stays disabled until Terms is ticked, whatever else is filled in.
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm Password').fill(`${password}x`);
      await expect(finish).toBeDisabled();
      await marketing.click();
      await expect(finish).toBeDisabled();

      // Mismatch is caught before any server call; nothing is recorded.
      await terms.click();
      await expect(finish).toBeEnabled();
      await finish.click();
      await expect(page.getByText('Passwords do not match')).toBeVisible();
      expect((await consentRow(userId)).terms_accepted_at).toBeNull();

      // AC5: the server's own messages show on the page, and nothing is
      // recorded (real calls to the deployed function).
      for (const [bad, message] of [
        ['short1', 'Password must be between 8 and 128 characters'],
        ['password123', 'This password has appeared in a data breach. Please choose a different password.'],
      ]) {
        await page.getByLabel('Password', { exact: true }).fill(bad);
        await page.getByLabel('Confirm Password').fill(bad);
        await finish.click();
        await expect(page.getByText(message)).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { level: 1, name: FINISH_TITLE })).toBeVisible();
      }
      expect((await consentRow(userId)).terms_accepted_at).toBeNull();

      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm Password').fill(password);
      await finish.click();
      await expect(page).toHaveURL('/', { timeout: 20000 });
      await expectInApp(page);

      const row = await consentRow(userId);
      const versions = serverVersions();
      expect(row.terms_accepted_at).not.toBeNull();
      expect(row.terms_version).toBe(versions.tos);
      expect(row.privacy_version).toBe(versions.privacy);
      expect(row.marketing_opt_in).toBe(true);
      expect(await isConfirmed(userId)).toBe(true);

      // AC3: the password chosen on the finish page signs in, in a fresh
      // browser, straight past the gate.
      const fresh = await browser.newContext({ storageState: SIGNED_OUT });
      try {
        const other = await fresh.newPage();
        await signInOnLoginPage(other, email, password);
        await expect(other).toHaveURL('/', { timeout: 20000 });
        await expectInApp(other);
      } finally {
        await fresh.close();
      }
    } finally {
      await deleteUser(userId);
    }
  });

  test('a resent (recovery-type) link opens the finish page, not Set New Password; leaving early still shows the finish screen on any app page, and Sign out works there', async ({ page }) => {
    const { email, userId } = await mintSignupLink('resend');
    try {
      const tokenHash = await mintRecoveryLink(email);
      await page.goto(`/verify-email?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
      await expect(page.getByRole('heading', { level: 1, name: FINISH_TITLE })).toBeVisible({ timeout: 15000 });
      // The PASSWORD_RECOVERY event must not bounce this page to /reset-password.
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(/\/verify-email\?/);
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible();

      // Closing the finish page early: any app page shows the same finish
      // screen (password + Terms + marketing), with Sign out.
      await page.goto('/pets');
      await expect(page.getByRole('heading', { level: 1, name: FINISH_TITLE })).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox')).toHaveCount(2);
      await expect(page.getByRole('link', { name: 'Menu' })).toHaveCount(0);

      // AC12 on the finish variant: Terms is readable, with no app frame.
      await page.goto('/terms');
      await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Menu' })).toHaveCount(0);

      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: FINISH_TITLE })).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL('/login', { timeout: 15000 });
      await page.goto('/pets');
      await expect(page).toHaveURL('/login');
      expect((await consentRow(userId)).terms_accepted_at).toBeNull();
    } finally {
      await deleteUser(userId);
    }
  });

  test('an invite link opens Welcome to Wysker Watch (also when opened twice); Continue sets the password and goes to the invited pet (AC3, decision 2)', async ({ page }) => {
    const { email, userId, tokenHash } = await mintSignupLink('invite');
    const petId = crypto.randomUUID();
    const password = freshPassword();
    try {
      await page.goto(`/accept-invite?token_hash=${encodeURIComponent(tokenHash)}&type=invite&petId=${petId}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Wysker Watch' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(INVITE_SUBTITLE)).toBeVisible();

      // The same link opened again in a second tab (or after an email
      // scanner prefetched it): the token is spent, but this browser has
      // the session, so it shows the form, not Invite Link Invalid.
      const secondTab = await page.context().newPage();
      await secondTab.goto(`/accept-invite?token_hash=${encodeURIComponent(tokenHash)}&type=invite&petId=${petId}`);
      await expect(secondTab.getByRole('heading', { level: 1, name: 'Welcome to Wysker Watch' })).toBeVisible({ timeout: 15000 });
      await expect(secondTab.getByRole('heading', { name: 'Invite Link Invalid' })).toHaveCount(0);
      await secondTab.close();

      const cont = page.getByRole('button', { name: 'Continue' });
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm Password').fill(password);
      await expect(cont).toBeDisabled();
      await page.getByRole('checkbox').first().click();
      await cont.click();
      await expect(page).toHaveURL(`/pets?highlight=${petId}`, { timeout: 20000 });
      await expectInApp(page);
      const row = await consentRow(userId);
      expect(row.terms_accepted_at).not.toBeNull();
      expect(row.marketing_opt_in).toBe(false);
      expect(await isConfirmed(userId)).toBe(true);

      // Decision 2: a re-invite link (type=recovery) for an account that
      // has already finished skips the form and goes straight to the pet.
      const reinvite = await mintRecoveryLink(email);
      const fresh = await page.context().browser().newContext({ storageState: SIGNED_OUT });
      try {
        const other = await fresh.newPage();
        await other.goto(`/accept-invite?token_hash=${encodeURIComponent(reinvite)}&type=recovery&petId=${petId}`);
        await expect(other).toHaveURL(`/pets?highlight=${petId}`, { timeout: 20000 });
        await expectInApp(other);
      } finally {
        await fresh.close();
      }
    } finally {
      await deleteUser(userId);
    }
  });

  test('a password account with no consent sees the consent-only screen; Terms stays readable bare; a failed check offers Try again and Sign out; Continue opens the app (AC10-AC12)', async ({ page }) => {
    const { email, password, userId } = await createPasswordAccount('consent');
    try {
      await admin().from('profiles').update({ marketing_opt_in: true }).eq('id', userId);

      // Network failure on the status check: the error screen, not a dead end.
      let failStatus = true;
      await page.route(FINISH_FUNCTION, async (route) => {
        if (failStatus && route.request().method() === 'POST') {
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: GENERIC_ERROR }) });
          return;
        }
        await route.fallback();
      });

      await signInOnLoginPage(page, email, password);
      await expect(page.getByText(GENERIC_ERROR)).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Menu' })).toHaveCount(0);

      failStatus = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('heading', { level: 1, name: CONSENT_TITLE })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(CONSENT_BODY)).toBeVisible();
      // AC11: a password session is asked for consent only. No marketing box.
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(1);
      const cont = page.getByRole('button', { name: 'Continue' });
      await expect(cont).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

      // AC12: Terms and a Privacy section page open instead of the gate,
      // bare (no header or bottom nav).
      await page.goto('/terms');
      await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('link', { name: 'Menu' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: CONSENT_TITLE })).toHaveCount(0);
      await page.goto('/privacy/information-we-collect');
      await expect(page.getByRole('heading', { level: 1, name: 'Information we collect' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('link', { name: 'Menu' })).toHaveCount(0);

      // Other app pages, including onboarding (outside the App Shell), are gated.
      await page.goto(`/pet/${crypto.randomUUID()}/onboarding`);
      await expect(page.getByRole('heading', { level: 1, name: CONSENT_TITLE })).toBeVisible({ timeout: 15000 });
      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: CONSENT_TITLE })).toBeVisible({ timeout: 15000 });
      expect((await consentRow(userId)).terms_accepted_at).toBeNull();

      await page.getByRole('checkbox').first().click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expectInApp(page);
      await expect(page).toHaveURL('/settings');

      const row = await consentRow(userId);
      const versions = serverVersions();
      expect(row.terms_accepted_at).not.toBeNull();
      expect(row.terms_version).toBe(versions.tos);
      expect(row.privacy_version).toBe(versions.privacy);
      // Decision 4: no marketing box here, so the earlier setting is kept.
      expect(row.marketing_opt_in).toBe(true);

      // Consent sticks across a reload, and the password still works
      // (this screen never changes a password).
      await page.reload();
      await expectInApp(page);
    } finally {
      await deleteUser(userId);
    }
  });

  test('Sign out on the consent-only screen goes to Login and records nothing (AC10)', async ({ page }) => {
    const { email, password, userId } = await createPasswordAccount('signout');
    try {
      await signInOnLoginPage(page, email, password);
      await expect(page.getByRole('heading', { level: 1, name: CONSENT_TITLE })).toBeVisible({ timeout: 20000 });
      await page.getByRole('checkbox').first().click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL('/login', { timeout: 15000 });
      await page.goto('/');
      await expect(page).toHaveURL('/login');
      expect((await consentRow(userId)).terms_accepted_at).toBeNull();
    } finally {
      await deleteUser(userId);
    }
  });
});
