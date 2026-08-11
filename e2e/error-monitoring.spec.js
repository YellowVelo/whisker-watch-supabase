// Spec 0052 — production error/crash monitoring. Sentry is intentionally
// never configured for this suite (.env.playwright.example has no
// VITE_SENTRY_DSN entry), so this test covers the one acceptance
// criterion that's actually observable through normal app usage: with no
// DSN set, Sentry.init() is skipped entirely (src/lib/errorMonitoring.js)
// and the app must behave exactly as if monitoring didn't exist. The
// other acceptance criteria (events actually reaching Sentry, sandbox
// exclusion) require reading data back from Sentry itself — a
// third-party service this suite has no credentialed access to — and are
// verified manually instead (see the spec's Test Plan).
import { test, expect } from './fixtures.js';

test('app loads and navigates normally with no Sentry DSN configured', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();

  await page.getByRole('link', { name: 'Pets' }).click();
  await expect(page).toHaveURL('/pets');

  expect(errors).toEqual([]);
});
