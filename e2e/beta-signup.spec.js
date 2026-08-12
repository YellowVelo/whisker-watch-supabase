// E2E coverage for the public /beta landing page + screener and its
// admin review page (spec 0053). See
// docs/features/0053_Beta_Signup_Landing_Page_and_Screener_Specification_v1.md's
// Test Plan for how each Acceptance Criterion maps to a test below.
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

test.describe('public /beta page', () => {
  // The public page needs no session at all — test as a logged-out
  // visitor, matching how someone clicking a Reddit/BetaList link
  // actually arrives, not the suite's default logged-in test1@ session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('AC1: shows the pitch copy on mobile with no internal mechanics mentioned', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/beta');

    await expect(page.getByRole('heading', { name: /actually doing better/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The Problem' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The Solution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: "Who it's for" })).toBeVisible();

    // "Great day / Off day / Tough one" IS the approved public copy
    // (plain-English description of a daily check-in) — what must stay
    // hidden is the internal model/architecture NAMING, not that
    // descriptive language. See the spec's copy doc and CLAUDE.md's
    // note that "Vibe" and "symptom count" are the internal terms.
    const bodyText = await page.locator('body').innerText();
    for (const forbidden of ['Vibe', 'symptom count', 'daily_check_ins', 'wellness score']) {
      expect(bodyText).not.toContain(forbidden);
    }
  });

  test('AC2: submitting the email reveals the screener in place, no navigation', async ({ page }) => {
    await page.goto('/beta');

    await page.getByLabel('Email').fill(scratchEmail('step2'));
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByRole('heading', { name: 'A couple quick questions' })).toBeVisible();
    await expect(page).toHaveURL(/\/beta$/);
  });

  test('AC4: an invalid email is rejected inline and the screener never appears', async ({ page }) => {
    await page.goto('/beta');

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'A couple quick questions' })).not.toBeVisible();
  });

  test('AC9: a CAPTCHA rejection from the server shows a clear error and no success message', async ({ page }) => {
    await page.route('**/functions/v1/beta-signup', async (route) => {
      await route.fulfill({ status: 400, json: { error: 'CAPTCHA verification failed. Please try again.' } });
    });

    await page.goto('/beta');
    await page.getByLabel('Email').fill(scratchEmail('captcha-fail'));
    await page.getByRole('button', { name: 'Submit' }).click();

    await page.getByRole('button', { name: 'Yes, diagnosed condition' }).click();
    await page.getByRole('button', { name: 'Notes app / memory' }).click();
    await page.getByLabel(/most frustrating part/i).fill('Not sure if things are improving.');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();

    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('CAPTCHA verification failed. Please try again.')).toBeVisible();
    await expect(page.getByRole('heading', { name: "You're on the list" })).not.toBeVisible();
  });

  test('AC3: a full submission stores the signup and shows the thank-you message', async ({ page }) => {
    await page.goto('/beta');
    await page.getByLabel('Email').fill(scratchEmail('happy-path'));
    await page.getByRole('button', { name: 'Submit' }).click();

    await page.getByRole('button', { name: 'Yes, diagnosed condition' }).click();
    await page.getByRole('button', { name: 'Notes app / memory' }).click();
    await page.getByLabel(/most frustrating part/i).fill('Hard to tell if the new medication is actually helping.');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();

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
