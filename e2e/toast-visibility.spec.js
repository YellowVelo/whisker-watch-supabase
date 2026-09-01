// Standalone regression test for the toast-positioning bug fixed 2026-08-29
// (see CLAUDE.md's "Key architecture" note on src/components/ui/toast.jsx).
// Every toast in the app shares one Toaster/ToastViewport, so this
// deliberately does NOT live inside any one feature's spec file — it
// protects all ~6 call sites (Account, Home, Settings, VetExport,
// BloodworkSection, VaccinationSection) at once.
//
// Playwright's toBeVisible() alone does NOT catch this bug: an element
// with position:relative sitting hundreds of pixels below the fold still
// has non-zero size/opacity and passes toBeVisible(). The actual
// regression is structural — the toast never gets pinned to the viewport
// — so this test walks the DOM for a `position: fixed` ancestor instead,
// which is what genuinely broke here (see spec 0061's investigation).
import { test, expect } from './fixtures.js';

test('a toast is pinned to the viewport (position: fixed ancestor), not just present in the DOM', async ({ page }) => {
  await page.goto('/account');

  const firstNameInput = page.locator('#first-name');
  const original = await firstNameInput.inputValue();
  const testValue = `${original || 'Test'} ${Date.now()}`;

  try {
    await firstNameInput.fill(testValue);
    await page.getByRole('button', { name: 'Save' }).click();

    // .first(): the real Radix toast also emits an aria-live announcer
    // span with the same text for screen readers, alongside the visible
    // toast itself — a second, distinct DOM node with matching text.
    const toastText = page.getByText('Profile saved.').first();
    await expect(toastText).toBeVisible();

    const fixedAncestorFound = await toastText.evaluate((el) => {
      let node = el;
      while (node) {
        if (getComputedStyle(node).position === 'fixed') return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(fixedAncestorFound).toBe(true);

    // A second, direct check: the toast's own bounding box must actually
    // fall within the visible viewport, not just have a fixed ancestor.
    const box = await toastText.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(viewport.height);
  } finally {
    // Restore test1@'s real profile value — this is shared fixture data
    // other specs may read.
    await firstNameInput.fill(original);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Profile saved.').first()).toBeVisible();
  }
});
