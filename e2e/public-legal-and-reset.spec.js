// Spec 0074 (punch list PA-08, PA-09).
// - Terms and Privacy open for signed-out visitors (the signup screens ask
//   people to agree to them), and keep the app's header + bottom nav when
//   signed in.
// - Their Back button still goes somewhere when the page was opened in a
//   fresh tab (the signup links use target="_blank").
// - Forgot Password tells people when the reset email couldn't be sent,
//   instead of always saying it was. The server's reply is faked with
//   page.route(), so no real email is sent and dev's email rate limit isn't
//   used; every test sets up its own state, so order doesn't matter.
// fixtures.js supplies the saved test1@ session (signed-in tests); the
// signed-out describe blocks override it with an empty storageState.
import { test, expect } from './fixtures';

const SIGNED_OUT = { cookies: [], origins: [] };
const RECOVER_ENDPOINT = '**/auth/v1/recover**';
const RATE_LIMIT_MESSAGE = 'Too many reset requests. Please wait a few minutes, then try again.';
const GENERAL_ERROR_MESSAGE = "We couldn't send your reset email. Please try again, or email support@wyskerwatch.com if it keeps happening.";

const LEGAL_PAGES = [
  { path: '/terms', heading: 'Terms of Service' },
  { path: '/terms/about-the-service', heading: 'About the service' },
  { path: '/privacy', heading: 'Privacy Policy' },
  { path: '/privacy/information-we-collect', heading: 'Information we collect' },
];

test.describe('legal pages, signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  for (const { path, heading } of LEGAL_PAGES) {
    test(`${path} opens without signing in`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page).toHaveURL(path);
      // No app frame for a signed-out visitor.
      await expect(page.getByRole('link', { name: 'Menu' })).toHaveCount(0);
    });
  }

  test('the signup screen Terms link opens the Terms, not the login page', async ({ page, context }) => {
    await page.goto('/register');
    const [termsTab] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: 'Terms of Service' }).click(),
    ]);
    await expect(termsTab.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(termsTab).toHaveURL('/terms');
  });

  test('Back on a page opened in a fresh tab goes to login', async ({ page }) => {
    await page.goto('/terms');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL('/login');
  });

  test('Back on a section opened in a fresh tab goes to its list', async ({ page }) => {
    await page.goto('/privacy/information-we-collect');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL('/privacy');
  });

  test('Back from a section reached from the list returns to the list', async ({ page }) => {
    await page.goto('/terms');
    await page.getByRole('link', { name: /About the service/ }).click();
    await expect(page).toHaveURL('/terms/about-the-service');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL('/terms');
  });
});

test.describe('legal pages, signed in', () => {
  test('keep the app frame, with Menu', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Menu' })).toBeVisible();
  });

  test('Back on a page opened in a fresh tab goes to the Menu', async ({ page }) => {
    await page.goto('/privacy');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL('/settings');
  });
});

test.describe('forgot password', () => {
  test.use({ storageState: SIGNED_OUT });
  const email = 'nobody-real@example.com';

  async function submitReset(page, reply) {
    await page.route(RECOVER_ENDPOINT, (route) => route.fulfill(reply));
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
  }

  test('too many tries shows the rate-limit message and keeps the form', async ({ page }) => {
    await submitReset(page, {
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }),
    });
    await expect(page.getByRole('alert')).toHaveText(RATE_LIMIT_MESSAGE);
    await expect(page.getByLabel('Email')).toHaveValue(email);
  });

  test('any other failure shows the general message and keeps the form', async ({ page }) => {
    await submitReset(page, {
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 500, error_code: 'unexpected_failure', msg: 'Error sending recovery email' }),
    });
    await expect(page.getByRole('alert')).toHaveText(GENERAL_ERROR_MESSAGE);
    await expect(page.getByLabel('Email')).toHaveValue(email);
  });

  test('success shows the usual message', async ({ page }) => {
    await submitReset(page, { status: 200, contentType: 'application/json', body: '{}' });
    await expect(page.getByText(`If an account exists for ${email}, you'll receive a reset link shortly.`)).toBeVisible();
  });
});
