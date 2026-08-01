// Regression test for spec 0033. Toaster's ToastViewport (src/components/
// ui/toast.jsx) is a fixed, always-mounted box that pins to the bottom-right
// corner at `sm:` widths and up (>=640px) — the same corner Chromium's
// "Desktop Chrome" project (this file's project, 1280x720 by default) lays
// out the bottom tab bar's rightmost "Menu" tab. Before the fix, that box
// had no pointer-events-none, sat at z-[100] (above the tab bar's z-50), and
// its p-4 padding created a real clickable area even with zero toasts
// active — so a real, unforced mouse click on the Menu tab (center of its
// bounding box, which fell inside the overlap) was silently swallowed. See
// launch-punch-list.md and docs/features/0033_Toast_Viewport_Click_Blocking_
// Fix_Specification_v1.md for the full writeup.
//
// This deliberately uses a plain, real `.click()` — no `force: true`, no
// `.evaluate(el => el.click())` DOM-dispatch workaround (compare
// pwa-install-prompt.spec.js, which uses that workaround specifically to
// route around this bug) — because a real, physical, hit-tested click is
// exactly what the bug broke and what the fix needs to prove works.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';

test('a real mouse click on the Menu tab reaches it at desktop width, even though the empty toast viewport occupies the same corner', async ({ page }) => {
  await page.goto('/');
  await dismissAnyOpenSheet(page);

  // No toast is showing — this is the "empty viewport" case that used to
  // eat the click. ToastViewport is always in the DOM regardless (mounted
  // app-wide via <Toaster /> in App.jsx, outside the router), so no extra
  // setup is needed to have it present.
  await expect(page.locator('.md\\:max-w-\\[420px\\]')).toHaveCount(1);

  await page.getByRole('link', { name: 'Menu' }).click();

  await expect(page).toHaveURL('/settings');
});
