// Exists specifically to answer "is Vet Report generation actually
// broken" — the code reads as fully implemented, but nobody has
// confirmed it working end-to-end recently. Fails on a stuck spinner
// or a silent failure, not just on an obviously thrown error.
import { test, expect } from './fixtures.js';

test('a logged-in owner can request a vet report and get back a real file', async ({ page }) => {
  await page.goto('/pets');

  // Expand the first pet's card to reveal its "Vet Report" row.
  await page.getByRole('button', { name: 'Show more' }).first().click();
  await page.getByRole('link', { name: /Vet Report/ }).first().click();

  await expect(page).toHaveURL(/\/pet\/.+\/export/);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    page.getByRole('button', { name: /Download Report/ }).click(),
  ]);

  expect(download.suggestedFilename()).toBeTruthy();
});
