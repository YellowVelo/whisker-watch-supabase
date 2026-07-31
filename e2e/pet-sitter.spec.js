// Confirmed a working, wired-up feature (App.jsx route, Home.jsx link,
// BottomTabBar active-tab logic) — this is normal coverage, not a
// regression hunt for a suspected-missing feature.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';

test('a logged-in owner can reach the Pet Sitter page from Home', async ({ page }) => {
  await page.goto('/');
  await dismissAnyOpenSheet(page);
  await page.getByRole('link', { name: /Pet Sitt/ }).first().click();

  await expect(page).toHaveURL('/pet-sitter');
  await expect(page.getByRole('heading', { name: 'Pet Sitter' })).toBeVisible();
});
