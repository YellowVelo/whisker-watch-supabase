// Confirms IosInstallBanner.jsx's existing (unchanged) logic still works,
// since spec 0032's decision to accept the Firefox/non-Safari-iOS/desktop-
// Safari gap for launch specifically leans on "iOS Safari itself is fine"
// as part of that reasoning — this had never actually been verified by a
// test before. Runs under the 'mobile-safari' Playwright project
// (playwright.config.js), which emulates an iPhone + WebKit (the closest
// available engine to real Mobile Safari; not identical to it) so the
// banner's real UA-sniffing logic is genuinely exercised, not just typed
// out and trusted.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';
import { AUTH_FILE } from './global-setup.js';

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1';

test('iOS Safari sees the manual Add to Home Screen banner', async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_FILE, userAgent: IOS_SAFARI_UA });
  const page = await context.newPage();
  await page.goto('/');
  await dismissAnyOpenSheet(page);

  await expect(page.getByText(/Install Wysker Watch/)).toBeVisible();
  await context.close();
});

test('Chrome on iOS (not Safari) gets no install banner — accepted gap, not a bug', async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_FILE, userAgent: IOS_CHROME_UA });
  const page = await context.newPage();
  await page.goto('/');
  await dismissAnyOpenSheet(page);

  await expect(page.getByText(/Install Wysker Watch/)).not.toBeVisible();
  await context.close();
});
