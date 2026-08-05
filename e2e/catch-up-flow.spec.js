// Spec 0045: the multi-day Catch-Up overlay now carries role="dialog" +
// aria-modal="true" and a keyboard focus trap (matching BottomSheet.jsx via
// the shared useFocusTrap hook). This spec exists specifically to exercise
// that shell behavior, which none of the other specs do deliberately — they
// only ever call dismissAnyOpenSheet() to get Catch-Up out of the way.
//
// Triggering the real auto-launch (Home.jsx: 2+ missed days) without
// touching any of test1@'s real historical check-in data means creating a
// throwaway pet directly via Supabase with a backdated `created_at` — a
// brand-new pet with today's created_at has zero elapsed days and can't
// have a gap yet, but the `pets` table's `pets_insert_own` RLS policy only
// checks `created_by = auth.uid()`, not `created_at`, so a client insert
// can set it explicitly. No check-ins are ever created for this pet, so
// every day since its backdated created_at counts as missed (see
// getMissedDaysForPet in src/lib/checkin/checkinClient.js).
//
// Home always auto-launches CatchUpFlow scoped to a single pet
// (`pets={[catchUpPet]}`, Home.jsx ~line 469) whenever ANY pet has a 2+ day
// gap, regardless of which pet Home happens to pick first among several
// qualifying pets — so this test doesn't need to assert *which* pet's
// overlay opened, only that Catch-Up's shell (not the plain daily
// check-in sheet) is what auto-launched, identified by its static
// aria-label.
import { test, expect } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const PET_NAME = `E2E CatchUp Pet ${Date.now()}`;
let catchUpPetId;

async function signInSupabase() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as ${process.env.PLAYWRIGHT_TEST1_EMAIL}: ${error.message}`);
  return { supabase, userId: data.user.id };
}

test.afterEach(async () => {
  if (!catchUpPetId) return;
  const { supabase } = await signInSupabase();
  await supabase.functions.invoke('delete-pet', { body: { pet_id: catchUpPetId } });
  catchUpPetId = undefined;
});

test('the auto-launched Catch-Up overlay is a focus-trapped modal dialog', async ({ page }) => {
  const { supabase, userId } = await signInSupabase();

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pet, error } = await supabase
    .from('pets')
    .insert({ created_by: userId, name: PET_NAME, created_at: threeDaysAgo })
    .select('id')
    .single();
  if (error) throw error;
  catchUpPetId = pet.id;

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  const dialog = page.getByRole('dialog', { name: 'Catch Up Check-In' });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Focus lands on the dialog's own first focusable element (Close) on
  // open, not left on the page body or wherever it happened to be before.
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();

  // Tab from the last focusable element ("Maybe later") wraps back to the
  // first ("Close") instead of leaving the dialog into Home's content.
  await page.getByRole('button', { name: 'Maybe later' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();

  // Escape closes it, same as clicking Close.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
