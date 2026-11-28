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

  await page.getByLabel('Email').fill(process.env.PLAYWRIGHT_TEST1_EMAIL);
  await page.getByLabel('Password').fill(process.env.PLAYWRIGHT_TEST1_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Lands on Home, inside the app shell — the bottom nav only renders
  // for an authenticated session (ProtectedRoute), so its presence is
  // proof of a real logged-in state, not just "the URL changed."
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pets' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Menu' })).toBeVisible();
  await expect(page).toHaveURL('/');
});

// Regression test for a punch-list item (spec 0040): App.jsx used to have
// an authError.type === 'auth_required' branch that called navigateToLogin()
// during render — a React anti-pattern that logs a console error even
// though the redirect itself still worked. That branch was dead (nothing
// ever set authError.type to 'auth_required') and has been removed; this
// confirms the still-working redirect (via ProtectedRoute's declarative
// <Navigate>) stays clean. Reuses the file-wide logged-out storageState
// set above.
test('visiting a protected URL while logged out redirects to login with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/pets');

  await expect(page).toHaveURL('/login');
  expect(errors).toEqual([]);
});

// Spec 0076 (PA-20): Google sign-in is switched off, so its button is
// hidden on both pages, and so is Login's Terms checkbox (it only ever
// unlocked the Google button). Since spec 0086 Register has no checkbox
// either, and Sign Up works with just a name and email.
test('the Google button is hidden on Login and Register', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  await page.goto('/register');
  const signUp = page.getByRole('button', { name: 'Sign Up' });
  await expect(signUp).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
  // Spec 0086: the password and the Terms checkbox moved to the page the
  // confirmation email opens, so Register has neither.
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel('First Name').fill('E2E Register Check');
  await page.getByLabel('Email').fill('e2e-register-check@example.com');
  await expect(signUp).toBeEnabled();
});
