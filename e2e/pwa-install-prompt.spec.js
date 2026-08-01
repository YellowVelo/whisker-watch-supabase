// Regression test for spec 0032. Before the fix, useInstallPrompt() was
// only invoked from Settings.jsx, which sits inside App.jsx's <Routes
// key={location.pathname}> — a tree that fully unmounts/remounts on every
// client-side navigation. Since the browser's real beforeinstallprompt
// event fires once, asynchronously, whenever it happens to meet
// installability criteria, a listener scoped to Settings could easily not
// be mounted yet when it fired — silently losing the offer for the whole
// session. This test simulates that exact timing (the event arriving
// while on Home, not Settings) and confirms the offer survives a
// client-side navigation to Settings, proving the fix (moving the
// listener into InstallPromptContext's InstallPromptProvider, mounted in
// App.jsx outside the route tree) actually works.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';

test('a Chrome install offer received on Home still shows the Install App row after navigating to Settings', async ({ page }) => {
  await page.goto('/');
  await dismissAnyOpenSheet(page);

  // Simulate the real browser firing beforeinstallprompt while the user is
  // on Home — a real event (so e.preventDefault() works) with the two
  // extra properties the app's code actually reads off it.
  await page.evaluate(() => {
    const evt = new Event('beforeinstallprompt', { cancelable: true });
    evt.prompt = () => {};
    evt.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(evt);
  });

  // Client-side navigation via the bottom tab bar's "Menu" link, not
  // page.goto() — a full page load would reset all in-memory app state
  // regardless of this fix, so it wouldn't actually exercise the bug.
  await page.getByRole('link', { name: 'Menu' }).click();
  await expect(page).toHaveURL('/settings');

  await expect(page.getByRole('button', { name: /Install App/ })).toBeVisible();
});
