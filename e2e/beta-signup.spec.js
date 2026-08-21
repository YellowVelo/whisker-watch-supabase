// E2E coverage for the public /beta landing page + screener and its
// admin review page (spec 0053 v2). See
// docs/features/0053_Beta_Signup_Landing_Page_and_Screener_Specification_v2.md's
// Test Plan for how each Acceptance Criterion maps to a test below.
//
// v2 flow: /beta shows only the pitch + a single "Get Early Access"
// button. Clicking it reveals, in place (same URL, no navigation), one
// form with the email field and all 4 screener questions together — no
// separate email-only step like v1 had.
//
// Real-submission tests (AC3, AC6) create real rows in wysker-watch-dev's
// beta_signups table via the public Edge Function — there is no
// privileged/service-role access available to this Playwright suite (see
// e2e/fixtures.js and the repo's e2e testing constraints), so unlike the
// Deno integration tests in supabase/functions/beta-signup/index.test.ts,
// these rows can't be cleaned up from within the test itself. Emails are
// tagged `e2e-scratch-` so they're identifiable for occasional manual
// cleanup — same accepted, flagged tradeoff sign-up's own tests document
// for real Resend sends, not silently accepted.
// Imports the shared default-logged-in-as-test1@ fixture (see
// e2e/fixtures.js) so AC7 below can exercise the real "logged in, but
// not admin" path — the public-page tests and the explicit-login admin
// tests override storageState back off where they need a different
// starting session.
import { test, expect } from './fixtures.js';

function scratchEmail(label) {
  return `e2e-scratch-${Date.now()}-${label}@wyskerwatch.com`;
}

async function fillForm(page, { email, conditionStatus = 'Yes, diagnosed condition', trackingMethod = 'Notes app / memory', frustration = 'Hard to tell if the new medication is actually helping.', betaComfort = 'Yes' }) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: conditionStatus }).click();
  await page.getByRole('button', { name: trackingMethod }).click();
  await page.getByLabel(/most frustrating part/i).fill(frustration);
  await page.getByRole('button', { name: betaComfort, exact: true }).click();
}

test.describe('public /beta page', () => {
  // The public page needs no session at all — test as a logged-out
  // visitor, matching how someone clicking a Reddit/BetaList link
  // actually arrives, not the suite's default logged-in test1@ session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('AC1: shows the new hero copy on mobile, no retired sections, no internal mechanics', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/beta');

    await expect(page.getByRole('heading', { name: /another pet health tracker/i })).toBeVisible();
    await expect(page.getByText('So we built Wysker Watch.')).toBeVisible();

    // Retired v1 sections must actually be gone, not just unmentioned.
    await expect(page.getByRole('heading', { name: 'The Problem' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'The Solution' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: "Who it's for" })).not.toBeVisible();

    // No email field or questions visible before the button is clicked.
    await expect(page.getByLabel('Email')).not.toBeVisible();

    const bodyText = await page.locator('body').innerText();
    for (const forbidden of ['Vibe', 'symptom count', 'daily_check_ins', 'wellness score', 'Great day', 'Off day', 'Tough']) {
      expect(bodyText).not.toContain(forbidden);
    }
  });

  test('AC2: clicking Get Early Access reveals the combined form in place, no navigation', async ({ page }) => {
    await page.goto('/beta');

    await page.getByRole('button', { name: 'Get Early Access' }).click();

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByText(/ongoing health condition/i)).toBeVisible();
    await expect(page.getByText(/track your pet's health day to day/i)).toBeVisible();
    await expect(page.getByLabel(/most frustrating part/i)).toBeVisible();
    await expect(page.getByText(/comfortable using a very early/i)).toBeVisible();
    await expect(page).toHaveURL(/\/beta$/);
  });

  test('AC4: an invalid email is rejected inline and nothing is stored', async ({ page }) => {
    await page.goto('/beta');
    await page.getByRole('button', { name: 'Get Early Access' }).click();

    await fillForm(page, { email: 'not-an-email' });
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
    await expect(page.getByRole('heading', { name: "You're on the list" })).not.toBeVisible();
  });

  test('AC9: a CAPTCHA rejection from the server shows a clear error and no success message', async ({ page }) => {
    await page.route('**/functions/v1/beta-signup', async (route) => {
      await route.fulfill({ status: 400, json: { error: 'CAPTCHA verification failed. Please try again.' } });
    });

    await page.goto('/beta');
    await page.getByRole('button', { name: 'Get Early Access' }).click();
    await fillForm(page, { email: scratchEmail('captcha-fail') });

    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('CAPTCHA verification failed. Please try again.')).toBeVisible();
    await expect(page.getByRole('heading', { name: "You're on the list" })).not.toBeVisible();
  });

  test('AC3: a full submission stores the signup and shows the thank-you message', async ({ page }) => {
    await page.goto('/beta');
    await page.getByRole('button', { name: 'Get Early Access' }).click();
    await fillForm(page, { email: scratchEmail('happy-path') });

    // Turnstile's "always passes" TEST site key (see VITE_TURNSTILE_SITE_KEY
    // in .env / .env.example) auto-completes with no visible challenge, so
    // no extra step is needed here to satisfy it before submitting.
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByRole('heading', { name: "You're on the list" })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('admin /admin/beta-signups', () => {
  test('AC7: a logged-in non-admin is redirected away with no signup data shown', async ({ page }) => {
    // Reuses the suite's default test1@ session (e2e/fixtures.js) —
    // test1@ is deliberately NOT the admin fixture (see migration
    // 0049_test3_admin_fixture_account.sql) so this exercises the real
    // "logged in, but not admin" path.
    await page.goto('/admin/beta-signups');
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Beta Signups')).not.toBeVisible();
  });

  test.describe('starting logged out', () => {
    // Both tests below need to start with NO session, unlike this file's
    // other tests which reuse the default test1@ fixture — overriding
    // storageState here, same pattern the public /beta describe block
    // above and e2e/login.spec.js already use.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('AC8: a logged-out visitor is redirected to login', async ({ page }) => {
      await page.goto('/admin/beta-signups');
      await expect(page).toHaveURL('/login');
    });

    test('AC6: an admin sees signups and can mark one reviewed, and it persists on reload', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(process.env.PLAYWRIGHT_TEST3_ADMIN_EMAIL);
      await page.getByLabel('Password').fill(process.env.PLAYWRIGHT_TEST3_ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();

      await page.goto('/admin/beta-signups');
      await expect(page.getByRole('heading', { name: 'Beta Signups' })).toBeVisible();

      // The AC3 test above (same file, same worker, runs first — see
      // playwright.config.js's workers: 1 / fullyParallel: false) already
      // created at least one e2e-scratch-* row, so the list is never empty
      // here in a normal full-suite run.
      const firstRow = page.locator('text=e2e-scratch-').first();
      await expect(firstRow).toBeVisible({ timeout: 15000 });

      const reviewButton = page.getByRole('button', { name: 'Mark reviewed' }).first();
      await reviewButton.click();
      await expect(page.getByRole('button', { name: 'Reviewed' }).first()).toBeVisible();

      await page.reload();
      await expect(page.getByRole('button', { name: 'Reviewed' }).first()).toBeVisible();
    });
  });
});
