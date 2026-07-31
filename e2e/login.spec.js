// The one test that does NOT reuse the saved test1@ session (see
// e2e/global-setup.js) — it drives the real Login.jsx form with real
// keystrokes, so the actual sign-in UI is exercised by at least one
// test. Everything else depends on login working, so if
// signInWithPassword or the form itself breaks, this is the test
// designed to catch it.
import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('a real account can sign in with email and password and land on a logged-in page', async ({ page }) => {
  await page.goto('/login');

  // Login.jsx's <Label> isn't htmlFor/id-linked to its <Input> (a
  // pre-existing a11y gap, not something this suite should paper over
  // by adding an association just to make a selector work) — select by
  // input type instead.
  await page.locator('input[type="email"]').fill(process.env.PLAYWRIGHT_TEST1_EMAIL);
  await page.locator('input[type="password"]').fill(process.env.PLAYWRIGHT_TEST1_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Lands on Home, inside the app shell — the bottom nav only renders
  // for an authenticated session (ProtectedRoute), so its presence is
  // proof of a real logged-in state, not just "the URL changed."
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pets' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Menu' })).toBeVisible();
  await expect(page).toHaveURL('/');
});
