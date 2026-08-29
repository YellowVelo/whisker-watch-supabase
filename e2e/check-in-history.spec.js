// Spec 0060 (Check-In History Calendar). Unlike Catch-Up's calendar
// (catch-up-flow.spec.js), History doesn't depend on a real "missed day"
// gap — it shows the full 180-day window for any pet regardless of when
// it was created — so these tests seed daily_check_ins rows directly on a
// throwaway pet rather than backdating the pet itself.
//
// Card scoping: ExpandablePetProfileCard's outer wrapper is the only real
// <div> on the Pets tab carrying exactly rounded-2xl/px-4/py-4 without
// bg-card (WellbeingChipGrid's inner wrapper shares the first three
// classes but adds bg-card/border-border) — filtering that selector down
// to the one containing this test's uniquely-named pet's heading isolates
// this test's own card from every other pet already on test1@'s account.
import { test, expect } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const PET_NAME = `E2E History Pet ${Date.now()}`;
let historyPetId;

async function signInSupabase() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as ${process.env.PLAYWRIGHT_TEST1_EMAIL}: ${error.message}`);
  return { supabase, userId: data.user.id };
}

function isoDateDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.afterEach(async () => {
  if (!historyPetId) return;
  const { supabase } = await signInSupabase();
  await supabase.functions.invoke('delete-pet', { body: { pet_id: historyPetId } });
  historyPetId = undefined;
});

// Creates a throwaway pet (optionally pre-seeded with one saved day),
// opens its Pets-tab card, and opens Check-In History — returning the
// calendar dialog locator every test drives from there.
async function openHistoryCalendar(page, { seedDate, seedStatus } = {}) {
  const { supabase, userId } = await signInSupabase();
  const { data: pet, error } = await supabase
    .from('pets')
    .insert({ created_by: userId, name: PET_NAME })
    .select('id')
    .single();
  if (error) throw error;
  historyPetId = pet.id;

  if (seedDate) {
    const { error: checkInError } = await supabase.from('daily_check_ins').insert({
      pet_id: pet.id,
      created_by: userId,
      check_in_date: seedDate,
      status: seedStatus,
      symptom_count: 0,
      completed_at: new Date().toISOString(),
      source: 'app',
    });
    if (checkInError) throw checkInError;
  }

  await page.goto('/pets');
  await page.waitForLoadState('networkidle').catch(() => {});

  const card = page.locator('div.rounded-2xl.px-4.py-4:not(.bg-card)')
    .filter({ has: page.getByRole('heading', { name: PET_NAME, exact: true }) });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.getByRole('button', { name: 'Show more' }).click();
  await card.getByRole('button', { name: 'Check-In History' }).click();

  const calendar = page.getByRole('dialog', { name: 'Check-In History' });
  await expect(calendar).toBeVisible({ timeout: 10000 });
  return calendar;
}

test('tapping a day with an existing check-in opens it pre-filled', async ({ page }) => {
  const seedDate = isoDateDaysAgo(10);
  const calendar = await openHistoryCalendar(page, { seedDate, seedStatus: 'great' });

  const dayButton = calendar.locator(`button[aria-label$=", great"]`).first();
  await expect(dayButton).toBeVisible({ timeout: 10000 });
  await dayButton.click();

  const detailSheet = page.getByRole('dialog', { name: /How was .+ day/ });
  await expect(detailSheet).toBeVisible({ timeout: 5000 });
  await expect(detailSheet.getByText('Already logged as Great Day', { exact: false })).toBeVisible();
});

test('tapping a blank day opens it empty and a new entry can be saved', async ({ page }) => {
  const calendar = await openHistoryCalendar(page);

  const blankDay = calendar.locator('button[aria-label$=", no check-in yet"]').first();
  await expect(blankDay).toBeVisible({ timeout: 10000 });
  const dayLabel = await blankDay.getAttribute('aria-label');
  await blankDay.click();

  const detailSheet = page.getByRole('dialog', { name: /How was .+ day/ });
  await expect(detailSheet).toBeVisible({ timeout: 5000 });
  // Blank day — no "already logged" copy at all.
  await expect(detailSheet.getByText('Already logged as', { exact: false })).toHaveCount(0);

  await detailSheet.getByRole('button', { name: 'Great Day' }).click();
  await page.getByRole('dialog', { name: /Save changes to/ }).getByRole('button', { name: 'Save' }).click();

  // Sheet and confirmation both close, back on the calendar, and the
  // day's icon now reflects the saved status.
  await expect(page.getByRole('dialog', { name: /Save changes to/ })).toBeHidden();
  await expect(page.getByRole('dialog', { name: /How was .+ day/ })).toBeHidden();
  await expect(calendar.locator(`button[aria-label="${dayLabel.replace(', no check-in yet', ', great')}"]`)).toBeVisible({ timeout: 10000 });
});

test('saving a past day pauses on a confirmation and does not write until confirmed', async ({ page }) => {
  const calendar = await openHistoryCalendar(page);
  const blankDay = calendar.locator('button[aria-label$=", no check-in yet"]').first();
  await blankDay.click();

  const saveRequests = [];
  page.on('request', (req) => { if (req.url().includes('/rpc/save_daily_check_ins')) saveRequests.push(req); });

  const detailSheet = page.getByRole('dialog', { name: /How was .+ day/ });
  await detailSheet.getByRole('button', { name: 'Great Day' }).click();

  const confirmSheet = page.getByRole('dialog', { name: /Save changes to/ });
  await expect(confirmSheet).toBeVisible({ timeout: 5000 });
  await expect(confirmSheet.getByText('Great Day', { exact: false })).toBeVisible();

  // The write must not have happened yet — only the confirmation opened.
  expect(saveRequests.length).toBe(0);

  await confirmSheet.getByRole('button', { name: 'Save' }).click();
  await expect(confirmSheet).toBeHidden();
  await expect.poll(() => saveRequests.length, { timeout: 5000 }).toBe(1);
});

test('backing out of the confirmation leaves the day unchanged', async ({ page }) => {
  const seedDate = isoDateDaysAgo(15);
  const calendar = await openHistoryCalendar(page, { seedDate, seedStatus: 'great' });

  const dayButton = calendar.locator('button[aria-label$=", great"]').first();
  const dayLabel = await dayButton.getAttribute('aria-label');
  await dayButton.click();

  const detailSheet = page.getByRole('dialog', { name: /How was .+ day/ });
  await expect(detailSheet).toBeVisible({ timeout: 5000 });
  await detailSheet.getByRole('button', { name: 'Off Day' }).click();
  await page.getByRole('dialog', { name: 'What happened?' }).getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('dialog', { name: 'A few details' }).getByRole('button', { name: 'Save check-in' }).click();

  const confirmSheet = page.getByRole('dialog', { name: /Save changes to/ });
  await expect(confirmSheet).toBeVisible({ timeout: 5000 });
  await confirmSheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmSheet).toBeHidden();

  // Cancel returns to the in-progress sheet (nothing was saved) rather
  // than closing everything outright — close it explicitly to get back
  // to the calendar and confirm the day's saved status is untouched.
  await expect(page.getByRole('dialog', { name: 'A few details' })).toBeVisible();
  await page.getByRole('dialog', { name: 'A few details' }).getByRole('button', { name: 'Close' }).click();

  await expect(calendar.locator(`button[aria-label="${dayLabel}"]`)).toBeVisible({ timeout: 10000 });
});

test('the calendar cannot navigate earlier than the 180-day floor', async ({ page }) => {
  const calendar = await openHistoryCalendar(page);
  const prevButton = calendar.getByRole('button', { name: 'Previous month' });

  let guard = 0;
  while (await prevButton.isEnabled() && guard < 12) {
    await prevButton.click();
    guard += 1;
  }

  await expect(prevButton).toBeDisabled();
});
