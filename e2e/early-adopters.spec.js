// E2E coverage for the public /early-adopters welcome page (spec 0056).
// See docs/features/0056_Early_Adopters_Welcome_Page_Specification_v1.md's
// Test Plan for how each Acceptance Criterion maps to a test below.
// Modeled directly on e2e/beta-signup.spec.js.
//
// AC3's real-submission test creates a real row in wysker-watch-dev's
// early_adopters table via the public Edge Function — there is no
// privileged/service-role access available to this Playwright suite (see
// e2e/fixtures.js and the repo's e2e testing constraints), so unlike the
// Deno integration tests in
// supabase/functions/early-adopter-signup/index.test.ts, this row can't
// be cleaned up from within the test itself. Emails are tagged
// `e2e-scratch-` so they're identifiable for occasional manual cleanup,
// same accepted, flagged tradeoff beta-signup.spec.js documents for its
// own real submissions.
import { test, expect } from './fixtures.js';

function scratchEmail(label) {
  return `e2e-scratch-${Date.now()}-${label}@wyskerwatch.com`;
}

// The public page needs no session at all — test as a logged-out
// visitor, matching how someone clicking a social-post link actually
// arrives, not the suite's default logged-in test1@ session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('public /early-adopters page', () => {
  test('AC1: shows problem/solution copy on mobile with no internal mechanics or beta/testing framing mentioned', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/early-adopters');

    await expect(page.getByRole('heading', { name: 'Sound familiar?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: "What we're building" })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: "Want to know the moment it's ready?" }),
    ).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    for (const forbidden of ['Vibe', 'symptom count', 'daily_check_ins', 'beta', 'testing']) {
      expect(bodyText.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  test('AC2: leaving the consent checkbox unchecked keeps submit disabled and fires no network call', async ({
    page,
  }) => {
    let signupCalled = false;
    await page.route('**/functions/v1/early-adopter-signup', async (route) => {
      signupCalled = true;
      await route.continue();
    });

    await page.goto('/early-adopters');

    await page.getByLabel('First Name', { exact: true }).fill('Casey');
    await page.getByLabel('Email', { exact: true }).fill(scratchEmail('no-consent'));

    const submitButton = page.getByRole('button', { name: 'Join the Early Adopters List' });
    await expect(submitButton).toBeDisabled();
    await submitButton.click({ force: true });

    expect(signupCalled).toBe(false);
  });

  test('AC4: an invalid email is rejected inline and nothing is submitted', async ({ page }) => {
    await page.goto('/early-adopters');

    await page.getByLabel('First Name', { exact: true }).fill('Casey');
    await page.getByLabel('Email', { exact: true }).fill('not-an-email');
    await page.getByLabel(/Yes! I'm Adopting Early/).check();

    // The native `type="email"` input blocks the browser's own submit
    // path before our onSubmit handler ever runs, same as the app's
    // other email inputs — so this checks the field lands in a
    // browser-flagged invalid state rather than the inline copy path
    // (which only fires past that point, e.g. from a stricter regex
    // beta-signup's inline message covers).
    const emailInput = page.getByLabel('Email', { exact: true });
    const isInvalid = await emailInput.evaluate((el) => !el.checkValidity());
    expect(isInvalid).toBe(true);
    await expect(page.getByRole('heading', { name: "You're on the list" })).not.toBeVisible();
  });

  test('AC6: a CAPTCHA rejection from the server shows a clear error and no thank-you', async ({ page }) => {
    await page.route('**/functions/v1/early-adopter-signup', async (route) => {
      await route.fulfill({ status: 400, json: { error: 'CAPTCHA verification failed. Please try again.' } });
    });

    await page.goto('/early-adopters');
    await page.getByLabel('First Name', { exact: true }).fill('Casey');
    await page.getByLabel('Email', { exact: true }).fill(scratchEmail('captcha-fail'));
    await page.getByLabel(/Yes! I'm Adopting Early/).check();

    // Turnstile's "always passes" TEST site key (see VITE_TURNSTILE_SITE_KEY
    // in .env / .env.example) auto-completes with no visible challenge, so
    // no extra step is needed here before the button becomes enabled.
    await page.getByRole('button', { name: 'Join the Early Adopters List' }).click();

    await expect(page.getByText('CAPTCHA verification failed. Please try again.')).toBeVisible();
    await expect(page.getByRole('heading', { name: "You're on the list" })).not.toBeVisible();
  });

  test('AC5: a rate-limit rejection from the server shows a clear error and no thank-you', async ({ page }) => {
    await page.route('**/functions/v1/early-adopter-signup', async (route) => {
      await route.fulfill({ status: 429, json: { error: 'Too many attempts. Please try again later.' } });
    });

    await page.goto('/early-adopters');
    await page.getByLabel('First Name', { exact: true }).fill('Casey');
    await page.getByLabel('Email', { exact: true }).fill(scratchEmail('rate-limited'));
    await page.getByLabel(/Yes! I'm Adopting Early/).check();

    await page.getByRole('button', { name: 'Join the Early Adopters List' }).click();

    await expect(page.getByText('Too many attempts. Please try again later.')).toBeVisible();
    await expect(page.getByRole('heading', { name: "You're on the list" })).not.toBeVisible();
  });

  test('AC3: a full submission stores the signup and shows the thank-you message', async ({ page }) => {
    await page.goto('/early-adopters');

    await page.getByLabel('First Name', { exact: true }).fill('Casey');
    await page.getByLabel('Email', { exact: true }).fill(scratchEmail('happy-path'));
    await page.getByLabel(/Yes! I'm Adopting Early/).check();

    await page.getByRole('button', { name: 'Join the Early Adopters List' }).click();

    await expect(page.getByRole('heading', { name: "You're on the list" })).toBeVisible({ timeout: 15000 });
  });
});
