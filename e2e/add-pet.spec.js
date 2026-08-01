// This is the test most likely to catch a hang in Add Pet, because it
// checks the flow reaches a real end state (the pet visibly listed),
// not just that "Continue" was clicked. Also the test that would catch
// an RLS misconfiguration on the pets table's insert policy, which can't
// be ruled out just by reading the migration.
//
// Rewritten for spec 0029 (Onboarding Refresh): Add Pet no longer opens a
// pop-up dialog — "Add Pet" navigates to /pet/new/onboarding, and Pet
// Information is Step 1 of the full-screen onboarding wizard. "Skip for
// now" now lives in the wizard's header (available from Step 2 onward),
// not on a one-time success screen.
import { test, expect } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

// Unique per run so cleanup can find exactly the pet this test created,
// even if a previous run's cleanup somehow failed.
const PET_NAME = `E2E Test Pet ${Date.now()}`;

test.afterEach(async () => {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (signInError) return;

  const { data: pets } = await supabase.from('pets').select('id').eq('name', PET_NAME);
  for (const pet of pets ?? []) {
    // Same delete-pet Edge Function the real Delete Pet flow
    // (PetProfileContent.jsx) uses — cleanup goes through the same
    // RLS/permission path a real user would hit, not a direct DB delete.
    await supabase.functions.invoke('delete-pet', { body: { pet_id: pet.id } });
  }
});

test('a logged-in owner can add a pet, skip onboarding, and see it appear in the list', async ({ page }) => {
  await page.goto('/pets');

  await page.getByRole('button', { name: 'Add Pet' }).click();
  await expect(page).toHaveURL(/\/pet\/new\/onboarding/);

  await page.getByRole('button', { name: /Dog/ }).click();

  await page.locator('#pet-name').fill(PET_NAME);
  await page.locator('#sex-Female').click();
  await page.locator('#altered-Yes').click();
  // Birth Date's precision picker is rendered before Gotcha Day's
  // identical picker in the DOM, so .first() targets Birth Date's.
  await page.getByRole('button', { name: "I don't know" }).first().click();

  await page.getByRole('button', { name: 'Continue' }).click();

  // Landing on Step 2 (Health Conditions) confirms the pet — and its
  // pet_onboarding row — were actually created.
  await expect(page.getByText('Step 2 of 6')).toBeVisible();

  await page.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page.getByRole('heading', { name: PET_NAME })).toBeVisible();
});
