// Spec 0078: when an Edge Function call fails, the screen shows the
// server's own reason (or the screen's plain fallback), never supabase-js's
// "Edge Function returned a non-2xx status code".
//
// Runs as test1@ (the suite's shared session, CI-safe). The real functions
// are never called: page.route() answers delete-pet and delete-account in
// the browser, before the request leaves it, so nothing is deleted. (The
// real delete-account also refuses test accounts, a second safety net.)
// The Delete Pet test makes and removes its own pet.

import { test, expect } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const LIBRARY_WORDING = /non-2xx/i;

async function signedInClient(email, password) {
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return { client, userId: data.user.id };
}

// Answers the named Edge Function with a fixed error and counts the calls.
async function failFunction(page, name, status, body) {
  const calls = { count: 0 };
  await page.route(`**/functions/v1/${name}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, body: 'ok' });
    calls.count += 1;
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

// The pet's expandable card on /pets (same locator as
// pet-edit-conditions.spec.js); its action pills appear after "Show more".
async function openPetCard(page, name) {
  await page.goto('/pets');
  const card = page.getByRole('heading', { name }).locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
  await card.getByRole('button', { name: 'Show more' }).click();
  return card;
}

async function typeToConfirm(page, text, button) {
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByPlaceholder(text).fill(text);
  await confirm.getByRole('button', { name: button }).click();
  return confirm;
}

test.describe('Friendly errors from Edge Function failures', () => {
  test.describe('Delete Pet', () => {
    let owner;
    let petId;
    const petName = `E2E Friendly Error Pet ${Date.now()}`;

    test.beforeEach(async () => {
      owner = await signedInClient(process.env.PLAYWRIGHT_TEST1_EMAIL, process.env.PLAYWRIGHT_TEST1_PASSWORD);
      const { data: pet, error } = await owner.client
        .from('pets')
        .insert({ name: petName, species: 'Cat', created_by: owner.userId })
        .select('id')
        .single();
      if (error) throw new Error(`could not create test pet: ${error.message}`);
      petId = pet.id;
    });

    test.afterEach(async () => {
      if (petId) await owner.client.from('pets').delete().eq('id', petId);
    });

    test("shows the server's reason, not the library's wording (AC8)", async ({ page }) => {
      const calls = await failFunction(page, 'delete-pet', 404, { error: 'Pet not found' });
      const card = await openPetCard(page, petName);
      await card.getByRole('button', { name: 'Delete Pet' }).click();
      const confirm = await typeToConfirm(page, petName, 'Delete Pet');

      await expect(confirm.getByText('Pet not found')).toBeVisible();
      await expect(page.getByText(LIBRARY_WORDING)).toHaveCount(0);
      expect(calls.count).toBe(1);
      // The pet really is still there: nothing reached the server.
      const { data } = await owner.client.from('pets').select('id').eq('id', petId);
      expect(data).toHaveLength(1);
    });

    test('shows the plain fallback when the server gives no reason (AC8)', async ({ page }) => {
      await page.route('**/functions/v1/delete-pet', (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ status: 200, body: 'ok' })
          : route.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad gateway' }),
      );
      const card = await openPetCard(page, petName);
      await card.getByRole('button', { name: 'Delete Pet' }).click();
      const confirm = await typeToConfirm(page, petName, 'Delete Pet');

      await expect(confirm.getByText("We couldn't delete this pet. Please try again.")).toBeVisible();
      await expect(page.getByText(LIBRARY_WORDING)).toHaveCount(0);
    });
  });

  test('Delete Account shows the plain message, not the library wording (AC8)', async ({ page }) => {
    const calls = await failFunction(page, 'delete-account', 500, { error: 'Something went wrong. Please try again.' });
    await page.goto('/settings');
    await page.getByRole('button', { name: /Delete Account/ }).click();
    const confirm = await typeToConfirm(page, 'DELETE', 'Delete My Account');

    await expect(confirm.getByText('Something went wrong. Please try again.')).toBeVisible();
    await expect(page.getByText(LIBRARY_WORDING)).toHaveCount(0);
    expect(calls.count).toBe(1);
    // Still signed in, still on Settings.
    await expect(page).toHaveURL(/\/settings/);
  });
});
