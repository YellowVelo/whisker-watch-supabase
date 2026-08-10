// Spec 0051 — Support page FAQ + contact email. Navigates straight to
// /support rather than via the Menu tab: bottom-nav-menu-tab.spec.js
// already covers reaching Support through real navigation, so this file
// stays focused on the page's own content instead of re-testing routing.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';

test('FAQ questions expand and collapse independently', async ({ page }) => {
  await page.goto('/support');
  await dismissAnyOpenSheet(page);

  await expect(page.getByText('coming soon')).toHaveCount(0);

  const q1 = page.getByRole('button', { name: 'What is Wysker Watch?' });
  const q2 = page.getByRole('button', { name: /Can I share a pet's profile/ });
  const a1 = page.getByText(/Wysker Watch helps you keep track/);
  const a2 = page.getByText(/you can invite a co-owner by email/);

  await expect(a1).toBeHidden();
  await expect(a2).toBeHidden();

  await q1.click();
  await expect(a1).toBeVisible();

  // Both stay open at once — this accordion allows multiple expanded
  // items (type="multiple" in Support.jsx), not single-open.
  await q2.click();
  await expect(a1).toBeVisible();
  await expect(a2).toBeVisible();

  await q1.click();
  await expect(a1).toBeHidden();
  await expect(a2).toBeVisible();
});

test('support email is a mailto link to the correct address', async ({ page }) => {
  await page.goto('/support');
  await dismissAnyOpenSheet(page);

  const emailLink = page.getByRole('link', { name: 'support@wyskerwatch.com' });
  await expect(emailLink).toBeVisible();
  await expect(emailLink).toHaveAttribute('href', 'mailto:support@wyskerwatch.com');
});
