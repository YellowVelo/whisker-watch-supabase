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

// Spec 0059: CatchUpFlow (Z.overlay) previously rendered above BottomSheet-
// based popups (Z.popup) because the two competed on unrelated hardcoded
// z-index numbers — Exceptions' "Apply to N days" bulk-apply sheet and the
// per-day arrow's detail sheet both opened but were invisible/unclickable,
// painted behind CatchUpFlow's own opaque panel. These two tests are the
// direct regression coverage: popups opened from inside Catch Up must be
// visible and usable, not just present in the DOM.
async function openCatchUpToExceptions(page, { missedDayCount = 5 } = {}) {
  const { supabase, userId } = await signInSupabase();
  const daysAgo = new Date(Date.now() - missedDayCount * 24 * 60 * 60 * 1000).toISOString();
  const { data: pet, error } = await supabase
    .from('pets')
    .insert({ created_by: userId, name: PET_NAME, created_at: daysAgo })
    .select('id')
    .single();
  if (error) throw error;
  catchUpPetId = pet.id;

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  await expect(page.getByRole('dialog', { name: 'Catch Up Check-In' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Get Started' }).click();

  // CalendarStep: flag the missed days as exceptions by tapping each one.
  // Each missed day's button is aria-labeled by its day (e.g. "Aug 24" —
  // spec 0059 added this label specifically so this suite could target
  // individual days) and nothing else on this screen matches that
  // "Mon D"/"Month D" shape, so reading the labels back from the rendered
  // page (rather than computing dates client-side) sidesteps any timezone
  // mismatch between this test and the server's own "yesterday" — the app
  // decides what's missed, not this test.
  await expect(page.getByText('missed', { exact: false })).toBeVisible();
  const dayButtons = page.getByRole('button', { name: /^[A-Za-z]{3} \d{1,2}$/ });
  await expect(dayButtons).toHaveCount(missedDayCount);
  const dayLabels = await dayButtons.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  for (const label of dayLabels) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }

  await page.getByRole('button', { name: /need details/ }).click();
  await expect(page.getByRole('heading', { name: /Exceptions/ })).toBeVisible();

  return dayLabels;
}

test('bulk-apply sheet opens visible and usable from Exceptions ("Apply to N days")', async ({ page }) => {
  const dayLabels = await openCatchUpToExceptions(page, { missedDayCount: 3 });

  await page.getByRole('button', { name: `Select ${dayLabels[0]}` }).click();
  await page.getByRole('button', { name: `Select ${dayLabels[1]}` }).click();

  const applyButton = page.getByRole('button', { name: 'Apply to 2 days' });
  await expect(applyButton).toBeVisible();
  await applyButton.click();

  const bulkSheet = page.getByRole('dialog', { name: 'Apply to 2 days' });
  await expect(bulkSheet).toBeVisible({ timeout: 5000 });
  await expect(bulkSheet.getByRole('button', { name: 'Off Day' })).toBeVisible();

  // Prove it's actually clickable, not just present behind an opaque
  // parent — this is exactly what silently failed before spec 0059.
  await bulkSheet.getByRole('button', { name: 'Off Day' }).click();
  await expect(page.getByRole('dialog', { name: 'What changed?' })).toBeVisible();

  // Scoped to the sheet itself — CatchUpFlow's own header also has a
  // "Close" button underneath, ambiguous if not scoped.
  await page.getByRole('dialog', { name: 'What changed?' }).getByRole('button', { name: 'Close' }).click();
});

test('per-day detail sheet opens visible and usable from Exceptions\' arrow button', async ({ page }) => {
  const dayLabels = await openCatchUpToExceptions(page, { missedDayCount: 2 });

  await page.getByRole('button', { name: `Open details for ${dayLabels[0]}` }).click();

  const detailSheet = page.getByRole('dialog', { name: /How was .+ day/ });
  await expect(detailSheet).toBeVisible({ timeout: 5000 });
  await expect(detailSheet.getByRole('button', { name: 'Great Day' })).toBeVisible();

  // Scoped to the sheet itself — CatchUpFlow's own header also has a
  // "Close" button underneath, ambiguous if not scoped.
  await detailSheet.getByRole('button', { name: 'Close' }).click();
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
