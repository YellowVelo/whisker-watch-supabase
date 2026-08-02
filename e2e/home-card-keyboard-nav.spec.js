// Spec 0039: PetSummaryCard's outer element is no longer a real <a> (it
// contains nested real <button> chips, and a button nested inside a link
// is invalid markup) — it's a plain div with role="link" plus manual
// keyboard handling. This test exists specifically to confirm that manual
// handling actually works, since it's the one thing that regresses for
// free with a real <Link> and has to be hand-verified once it isn't.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';

test('a pet card can be reached and activated by keyboard alone', async ({ page }) => {
  await page.goto('/');
  await dismissAnyOpenSheet(page);

  const firstCard = page.getByRole('link', { name: /View profile\.$/ }).first();
  await firstCard.focus();
  await expect(firstCard).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pet\/[^/]+\/trends/);
});
