// Spec 0081 (PA-71): the Log weight sheet, opened from the Pet Profile
// Weight card (Pets tab) and the Trends Weight card. AC1 (log), AC3 (edit
// and delete) and AC4 (refused input).
//
// Each test makes its own throwaway pet on test1@ and deletes it after
// (delete-pet cascades to its observations and check-ins), so nothing
// this file writes can build up on the shared account, and test order
// doesn't matter.
//
// Card scoping: same selector as check-in-history.spec.js. The Pets-tab
// card's outer wrapper is the only rounded-2xl/px-4/py-4 div without
// bg-card, filtered down to the one holding this test's pet's heading.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

let weightPetIds = [];

// Signed in once per file and reused (Supabase Auth limits sign-ins per
// IP; CLAUDE.md's sign-in-once-per-file rule). QA 2026-11-26: this used to
// sign in again for every pet and every cleanup.
let signedIn = null;
async function signInSupabase() {
  if (signedIn) return signedIn;
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as ${process.env.PLAYWRIGHT_TEST1_EMAIL}: ${error.message}`);
  signedIn = { supabase, userId: data.user.id };
  return signedIn;
}

function isoDateDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.afterEach(async () => {
  const ids = weightPetIds;
  weightPetIds = [];
  if (ids.length === 0) return;
  const { supabase } = await signInSupabase();
  for (const id of ids) await supabase.functions.invoke('delete-pet', { body: { pet_id: id } });
});

let petCounter = 0;
async function createPet() {
  const { supabase, userId } = await signInSupabase();
  petCounter += 1;
  const name = `E2E Weight Pet ${Date.now()}-${petCounter}`;
  const { data: pet, error } = await supabase
    .from('pets')
    .insert({ created_by: userId, name, species: 'Cat' })
    .select('id')
    .single();
  if (error) throw error;
  weightPetIds.push(pet.id);
  return { supabase, userId, petId: pet.id, name };
}

async function savedWeights(supabase, petId) {
  const { data, error } = await supabase
    .from('observations')
    .select('id, numeric_value, daily_check_in_id, observation_types!inner(code)')
    .eq('pet_id', petId)
    .eq('observation_types.code', 'weight');
  if (error) throw error;
  return data;
}

async function openPetCard(page, name) {
  await page.goto('/pets');
  await page.waitForLoadState('networkidle').catch(() => {});
  const card = page.locator('div.rounded-2xl.px-4.py-4:not(.bg-card)')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.getByRole('button', { name: 'Show more' }).click();
  return card;
}

// The Weight card is a ListRow button whose name starts with its title.
const weightRow = (card) => card.getByRole('button', { name: /^Weight/ });

async function openSheetFromCard(page, card) {
  await expect(weightRow(card)).toBeVisible({ timeout: 10000 });
  await weightRow(card).click();
  const sheet = page.getByRole('dialog', { name: 'Log weight' });
  await expect(sheet).toBeVisible({ timeout: 5000 });
  return sheet;
}

async function logWeight(sheet, lbs) {
  await sheet.getByLabel('Weight', { exact: true }).fill(String(lbs));
  await sheet.getByRole('button', { name: 'Save' }).click();
}

const entries = (sheet) => sheet.getByTestId('weight-log-entry');

test('AC1: logging 11.2 lbs for today shows on Pet Profile and Trends without a reload', async ({ page }) => {
  const { supabase, petId, name } = await createPet();
  const card = await openPetCard(page, name);
  await expect(weightRow(card)).toContainText('No weight history.');

  const sheet = await openSheetFromCard(page, card);
  await expect(sheet.getByText('No weights logged yet.')).toBeVisible({ timeout: 10000 });
  // Date defaults to today and can't be set past it.
  const dateInput = sheet.getByLabel('Date', { exact: true });
  const today = await dateInput.inputValue();
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(dateInput).toHaveAttribute('max', today);

  await logWeight(sheet, 11.2);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('11.2 lbs');
  await expect(entries(sheet).first()).not.toContainText('From daily check-in');

  // Pet Profile's Weight card refreshed in place, sheet still open.
  await expect(weightRow(card)).toContainText('11.2 lbs', { timeout: 10000 });
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  const rows = await savedWeights(supabase, petId);
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].numeric_value)).toBe(11.2);
  expect(rows[0].daily_check_in_id).toBeNull();

  // Trends shows it too, and its own Log weight button opens the same list.
  await page.goto(`/pet/${petId}/trends`);
  const trendsWeight = page.locator('div.rounded-2xl').filter({ has: page.getByText('Weight', { exact: true }) }).last();
  await expect(trendsWeight).toContainText('11.2', { timeout: 10000 });
  await trendsWeight.getByRole('button', { name: 'Log weight' }).click();
  const trendsSheet = page.getByRole('dialog', { name: 'Log weight' });
  await expect(trendsSheet).toBeVisible();
  await expect(entries(trendsSheet).first()).toContainText('11.2 lbs', { timeout: 10000 });
});

test('AC3: editing a weight to 11.0 and deleting it updates every screen', async ({ page }) => {
  const { supabase, petId, name } = await createPet();
  const card = await openPetCard(page, name);
  const sheet = await openSheetFromCard(page, card);
  await logWeight(sheet, 11.2);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });

  // Edit
  await entries(sheet).first().getByRole('button', { name: 'Edit' }).click();
  await expect(sheet.getByLabel('Weight', { exact: true })).toHaveValue('11.2');
  await expect(sheet.getByLabel('Date', { exact: true })).toBeEnabled();
  await logWeight(sheet, 11.0);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('11.0 lbs', { timeout: 10000 });
  await expect(weightRow(card)).toContainText('11.0 lbs', { timeout: 10000 });
  let rows = await savedWeights(supabase, petId);
  expect(rows.map((r) => Number(r.numeric_value))).toEqual([11]);

  // Trends shows the edited value.
  await sheet.getByRole('button', { name: 'Close' }).click();
  await page.goto(`/pet/${petId}/trends`);
  const trendsWeight = page.locator('div.rounded-2xl').filter({ has: page.getByText('Weight', { exact: true }) }).last();
  await expect(trendsWeight).toContainText('11', { timeout: 10000 });
  await expect(trendsWeight).not.toContainText('11.2');

  // Delete from the Trends sheet, with confirmation (wording C).
  await trendsWeight.getByRole('button', { name: 'Log weight' }).click();
  const trendsSheet = page.getByRole('dialog', { name: 'Log weight' });
  await expect(entries(trendsSheet)).toHaveCount(1, { timeout: 10000 });
  await entries(trendsSheet).first().getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this weight?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("This can't be undone.");
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm).toBeHidden({ timeout: 10000 });
  await expect(trendsSheet.getByText('No weights logged yet.')).toBeVisible({ timeout: 10000 });
  // The Trends card behind the sheet refreshed to empty.
  await expect(trendsWeight).toContainText('No weight history available.', { timeout: 10000 });

  rows = await savedWeights(supabase, petId);
  expect(rows).toHaveLength(0);

  // And Pet Profile shows no weight.
  const card2 = await openPetCard(page, name);
  await expect(weightRow(card2)).toContainText('No weight history.', { timeout: 10000 });
});

test('AC3/FR3: a check-in weight is labeled and keeps its date; only its value can change', async ({ page }) => {
  const { supabase, userId, petId, name } = await createPet();
  const checkInDate = isoDateDaysFromNow(-5);
  const { data: checkIn, error: ciError } = await supabase.from('daily_check_ins').insert({
    pet_id: petId, created_by: userId, check_in_date: checkInDate, status: 'great',
    symptom_count: 0, completed_at: new Date().toISOString(), source: 'app',
  }).select('id, updated_at').single();
  if (ciError) throw ciError;
  const { data: type, error: typeError } = await supabase.from('observation_types').select('id').eq('code', 'weight').single();
  if (typeError) throw typeError;
  const { error: obsError } = await supabase.from('observations').insert({
    pet_id: petId, created_by: userId, daily_check_in_id: checkIn.id, observation_type_id: type.id, numeric_value: 9.4,
  });
  if (obsError) throw obsError;

  const card = await openPetCard(page, name);
  const sheet = await openSheetFromCard(page, card);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('9.4 lbs');
  await expect(entries(sheet).first()).toContainText('From daily check-in');

  await entries(sheet).first().getByRole('button', { name: 'Edit' }).click();
  await expect(sheet.getByLabel('Date', { exact: true })).toBeDisabled();
  await expect(sheet.getByLabel('Date', { exact: true })).toHaveValue(checkInDate);
  await logWeight(sheet, 9.8);
  await expect(entries(sheet).first()).toContainText('9.8 lbs', { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('From daily check-in');

  // The check-in's updated_at moved, so spec 0043's conflict check sees it.
  const { data: after } = await supabase.from('daily_check_ins').select('updated_at').eq('id', checkIn.id).single();
  expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(checkIn.updated_at).getTime());
});

test('AC4: 0, 301 and a future date are refused and nothing saves', async ({ page }) => {
  const { supabase, petId, name } = await createPet();
  const card = await openPetCard(page, name);
  const sheet = await openSheetFromCard(page, card);
  await expect(sheet.getByText('No weights logged yet.')).toBeVisible({ timeout: 10000 });

  await logWeight(sheet, 0);
  await expect(sheet.getByRole('alert')).toHaveText('Enter a weight between 0.1 and 300 lbs.');

  await logWeight(sheet, 301);
  await expect(sheet.getByRole('alert')).toHaveText('Enter a weight between 0.1 and 300 lbs.');

  // Two days ahead in UTC is tomorrow or later in every time zone.
  await sheet.getByLabel('Date', { exact: true }).fill(isoDateDaysFromNow(2));
  await logWeight(sheet, 10);
  await expect(sheet.getByRole('alert')).toHaveText('Choose today or an earlier date.');

  await expect(sheet.getByText('No weights logged yet.')).toBeVisible();
  expect(await savedWeights(supabase, petId)).toHaveLength(0);
});

// --- Daily check-in weight (AC2, and spec 0081's "Check-in edit safety") ---
// Driven through Check-In History (spec 0060), which reopens any day in
// the last 180 days on a pet made today, the same path
// check-in-history.spec.js uses.

function isoDateDaysAgo(days) {
  return isoDateDaysFromNow(-days);
}

async function openHistory(page, card) {
  await card.getByRole('button', { name: 'Check-In History' }).click();
  const calendar = page.getByRole('dialog', { name: 'Check-In History' });
  await expect(calendar).toBeVisible({ timeout: 10000 });
  // Day buttons render only once the window's check-ins have loaded.
  await calendar.locator('button[aria-label$=", no check-in yet"]').first().waitFor({ timeout: 10000 });
  return calendar;
}

// A seed at most a few days old is in this month or the one before.
async function revealDay(calendar, dayButton) {
  if (await dayButton.count() > 0) return;
  await calendar.getByRole('button', { name: 'Previous month' }).click();
}

const detailSheet = (page) => page.getByRole('dialog', { name: /How was .+ day/ });

async function confirmPastDaySave(page) {
  const confirm = page.getByRole('dialog', { name: /Save changes to/ });
  await expect(confirm).toBeVisible({ timeout: 5000 });
  await confirm.getByRole('button', { name: 'Save' }).click();
  await expect(confirm).toBeHidden({ timeout: 10000 });
}

async function startOffDayWithWeight(page) {
  await detailSheet(page).getByRole('button', { name: 'Off Day' }).click();
  const picker = page.getByRole('dialog', { name: 'What happened?' });
  await picker.getByRole('button', { name: 'Weight', exact: true }).click();
  await picker.getByRole('button', { name: 'Continue' }).click();
  const details = page.getByRole('dialog', { name: 'A few details' });
  await expect(details).toBeVisible({ timeout: 5000 });
  return details;
}

test('AC2: a weight typed in a daily check-in shows in the sheet (labeled), on Pet Profile and on Trends', async ({ page }) => {
  const { supabase, petId, name } = await createPet();
  const card = await openPetCard(page, name);
  const calendar = await openHistory(page, card);

  const blankDay = calendar.locator('button[aria-label$=", no check-in yet"]').first();
  await blankDay.click();
  const details = await startOffDayWithWeight(page);
  const weightBox = details.getByLabel('Weight in lbs');

  // Same 0.1 to 300 lbs rule as the Log weight sheet (wording B).
  await weightBox.fill('301');
  await expect(details.getByRole('alert')).toHaveText('Enter a weight between 0.1 and 300 lbs.');
  await expect(details.getByRole('button', { name: 'Save check-in' })).toBeDisabled();

  await weightBox.fill('10.6');
  await expect(details.getByRole('alert')).toHaveCount(0);
  await details.getByRole('button', { name: 'Save check-in' }).click();
  await confirmPastDaySave(page);
  await expect(details).toBeHidden({ timeout: 10000 });

  const rows = await savedWeights(supabase, petId);
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].numeric_value)).toBe(10.6);
  expect(rows[0].daily_check_in_id).not.toBeNull();

  // Pet Profile's Weight card and the Log weight sheet's list.
  await calendar.getByRole('button', { name: 'Close' }).click();
  const card2 = await openPetCard(page, name);
  await expect(weightRow(card2)).toContainText('10.6 lbs', { timeout: 10000 });
  const sheet = await openSheetFromCard(page, card2);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('10.6 lbs');
  await expect(entries(sheet).first()).toContainText('From daily check-in');
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Trends, over a range that covers any day History can reopen.
  await page.goto(`/pet/${petId}/trends`);
  await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1Y' }).click();
  const trendsWeight = page.locator('div.rounded-2xl').filter({ has: page.getByText('Weight', { exact: true }) }).last();
  await expect(trendsWeight).toContainText('10.6', { timeout: 10000 });
});

test('re-saving an existing check-in keeps its weight: Great Day, and Off Day with the Weight box untouched', async ({ page }) => {
  const { supabase, userId, petId, name } = await createPet();
  const checkInDate = isoDateDaysAgo(3);
  const { data: checkIn, error: ciError } = await supabase.from('daily_check_ins').insert({
    pet_id: petId, created_by: userId, check_in_date: checkInDate, status: 'off',
    symptom_count: 0, completed_at: new Date().toISOString(), source: 'app',
  }).select('id').single();
  if (ciError) throw ciError;
  const { data: type, error: typeError } = await supabase.from('observation_types').select('id').eq('code', 'weight').single();
  if (typeError) throw typeError;
  const { error: obsError } = await supabase.from('observations').insert({
    pet_id: petId, created_by: userId, daily_check_in_id: checkIn.id, observation_type_id: type.id, numeric_value: 9.4,
  });
  if (obsError) throw obsError;

  const checkInWeights = async () => (await savedWeights(supabase, petId))
    .filter((r) => r.daily_check_in_id != null)
    .map((r) => Number(r.numeric_value));
  const dayStatus = async () => (await supabase.from('daily_check_ins').select('status')
    .eq('pet_id', petId).eq('check_in_date', checkInDate).single()).data?.status;

  const card = await openPetCard(page, name);

  // 1. Tap Great Day on the saved Off Day.
  let calendar = await openHistory(page, card);
  let dayButton = calendar.locator('button[aria-label$=", off"]').first();
  await revealDay(calendar, dayButton);
  await dayButton.click();
  await expect(detailSheet(page)).toContainText('Already logged as Off Day', { timeout: 5000 });
  await detailSheet(page).getByRole('button', { name: 'Great Day' }).click();
  await confirmPastDaySave(page);
  await expect.poll(dayStatus, { timeout: 10000 }).toBe('great');
  expect(await checkInWeights()).toEqual([9.4]);
  await calendar.getByRole('button', { name: 'Close' }).click();
  await expect(calendar).toBeHidden();

  // 2. Re-save as Off Day. The Weight box shows the saved weight, and
  //    leaving it alone keeps it.
  calendar = await openHistory(page, card);
  dayButton = calendar.locator('button[aria-label$=", great"]').first();
  await revealDay(calendar, dayButton);
  await dayButton.click();
  const details = await startOffDayWithWeight(page);
  await expect(details.getByLabel('Weight in lbs')).toHaveValue('9.4', { timeout: 10000 });
  await details.getByRole('button', { name: 'Save check-in' }).click();
  await confirmPastDaySave(page);
  await expect.poll(dayStatus, { timeout: 10000 }).toBe('off');
  expect(await checkInWeights()).toEqual([9.4]);

  // The weight still shows, still as a check-in weight.
  await calendar.getByRole('button', { name: 'Close' }).click();
  const card2 = await openPetCard(page, name);
  await expect(weightRow(card2)).toContainText('9.4 lbs', { timeout: 10000 });
  const sheet = await openSheetFromCard(page, card2);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('From daily check-in');
});

// --- One weight per pet per day (Lynn, 2026-11-25) ---

async function seedCheckIn(supabase, userId, petId, checkInDate, status, weightLbs) {
  const { data: checkIn, error: ciError } = await supabase.from('daily_check_ins').insert({
    pet_id: petId, created_by: userId, check_in_date: checkInDate, status,
    symptom_count: 0, completed_at: new Date().toISOString(), source: 'app',
  }).select('id').single();
  if (ciError) throw ciError;
  const { data: type, error: typeError } = await supabase.from('observation_types').select('id').eq('code', 'weight').single();
  if (typeError) throw typeError;
  if (weightLbs != null) {
    const { error: obsError } = await supabase.from('observations').insert({
      pet_id: petId, created_by: userId, daily_check_in_id: checkIn.id, observation_type_id: type.id, numeric_value: weightLbs,
    });
    if (obsError) throw obsError;
  }
  return { checkInId: checkIn.id, weightTypeId: type.id };
}

test('one weight per day: a check-in weight of 11.0, then the sheet logs 12.0 that day, then the check-in is re-saved as Great Day: 12.0 is the only weight, everywhere', async ({ page }) => {
  const { supabase, userId, petId, name } = await createPet();
  const checkInDate = isoDateDaysAgo(3);
  await seedCheckIn(supabase, userId, petId, checkInDate, 'off', 11.0);
  const dayStatus = async () => (await supabase.from('daily_check_ins').select('status')
    .eq('pet_id', petId).eq('check_in_date', checkInDate).single()).data?.status;

  // The sheet logs 12.0 for the same day: it updates that day's weight.
  const card = await openPetCard(page, name);
  let sheet = await openSheetFromCard(page, card);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await sheet.getByLabel('Date', { exact: true }).fill(checkInDate);
  await logWeight(sheet, 12.0);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('12.0 lbs', { timeout: 10000 });
  let rows = await savedWeights(supabase, petId);
  expect(rows.map((r) => Number(r.numeric_value))).toEqual([12]);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  // Re-save the check-in as Great Day.
  const calendar = await openHistory(page, card);
  const dayButton = calendar.locator('button[aria-label$=", off"]').first();
  await revealDay(calendar, dayButton);
  await dayButton.click();
  await expect(detailSheet(page)).toContainText('Already logged as Off Day', { timeout: 5000 });
  await detailSheet(page).getByRole('button', { name: 'Great Day' }).click();
  await confirmPastDaySave(page);
  await expect.poll(dayStatus, { timeout: 10000 }).toBe('great');
  await calendar.getByRole('button', { name: 'Close' }).click();
  await expect(calendar).toBeHidden();

  rows = await savedWeights(supabase, petId);
  expect(rows.map((r) => Number(r.numeric_value))).toEqual([12]);

  // Pet Profile, the sheet's list and Trends all show 12.0.
  const card2 = await openPetCard(page, name);
  await expect(weightRow(card2)).toContainText('12.0 lbs', { timeout: 10000 });
  sheet = await openSheetFromCard(page, card2);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('12.0 lbs');
  await sheet.getByRole('button', { name: 'Close' }).click();

  await page.goto(`/pet/${petId}/trends`);
  await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1Y' }).click();
  const trendsWeight = page.locator('div.rounded-2xl').filter({ has: page.getByText('Weight', { exact: true }) }).last();
  await expect(trendsWeight).toContainText('12', { timeout: 10000 });
  await expect(trendsWeight).not.toContainText('11.0');
});

test("one weight per day: typing a weight in a check-in removes that day's standalone weight", async ({ page }) => {
  const { supabase, userId, petId, name } = await createPet();
  const checkInDate = isoDateDaysAgo(3);
  const { weightTypeId } = await seedCheckIn(supabase, userId, petId, checkInDate, 'great', null);
  const { error: saError } = await supabase.from('observations').insert({
    pet_id: petId, created_by: userId, daily_check_in_id: null, observation_type_id: weightTypeId,
    numeric_value: 12.0, observed_at: `${checkInDate}T12:00:00.000Z`,
  });
  if (saError) throw saError;
  const dayStatus = async () => (await supabase.from('daily_check_ins').select('status')
    .eq('pet_id', petId).eq('check_in_date', checkInDate).single()).data?.status;

  const card = await openPetCard(page, name);
  const calendar = await openHistory(page, card);
  const dayButton = calendar.locator('button[aria-label$=", great"]').first();
  await revealDay(calendar, dayButton);
  await dayButton.click();
  const details = await startOffDayWithWeight(page);
  // The box preloads the day's weight, even though it was logged outside
  // the check-in, so the owner sees what typing would replace.
  await expect(details.getByLabel('Weight in lbs')).toHaveValue('12', { timeout: 10000 });
  await details.getByLabel('Weight in lbs').fill('13.5');
  await details.getByRole('button', { name: 'Save check-in' }).click();
  await confirmPastDaySave(page);
  await expect.poll(dayStatus, { timeout: 10000 }).toBe('off');
  await calendar.getByRole('button', { name: 'Close' }).click();

  // The check-in weight is the day's only weight.
  await expect.poll(async () => (await savedWeights(supabase, petId))
    .map((r) => [Number(r.numeric_value), r.daily_check_in_id != null]), { timeout: 10000 })
    .toEqual([[13.5, true]]);
  const card2 = await openPetCard(page, name);
  await expect(weightRow(card2)).toContainText('13.5 lbs', { timeout: 10000 });
});

// Spec 0081 AC9 (FR13): the Symptoms page is retired. An old link or
// bookmark to it opens the pet's profile instead.
test("AC9: an old Symptoms link opens the pet's profile", async ({ page }) => {
  const { petId, name } = await createPet();
  await page.goto(`/pet/${petId}/symptoms`);
  // Same redirect as the retired /pet/:id/profile: Pets, with this pet's
  // profile card open (its Weight row only shows once the card is open).
  await expect(page).toHaveURL(/\/pets$/, { timeout: 10000 });
  const card = page.locator('div.rounded-2xl.px-4.py-4:not(.bg-card)')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(weightRow(card)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Log symptoms' })).toHaveCount(0);
});

// --- QA 2026-11-26: edge cases beyond the happy path ---

// A standalone weight seeded straight into the database, dated like the
// app dates it (noon UTC of the chosen day).
async function seedStandaloneWeight(supabase, userId, petId, date, lbs) {
  const { data: type, error: typeError } = await supabase.from('observation_types').select('id').eq('code', 'weight').single();
  if (typeError) throw typeError;
  const { data, error } = await supabase.from('observations').insert({
    pet_id: petId, created_by: userId, daily_check_in_id: null, observation_type_id: type.id,
    numeric_value: lbs, observed_at: `${date}T12:00:00.000Z`,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

test('empty and odd input: a blank weight and a cleared date are refused; two decimals save as one', async ({ page }) => {
  const { supabase, petId, name } = await createPet();
  const card = await openPetCard(page, name);
  const sheet = await openSheetFromCard(page, card);
  await expect(sheet.getByText('No weights logged yet.')).toBeVisible({ timeout: 10000 });

  // Blank weight: wording B, nothing saved.
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Enter a weight between 0.1 and 300 lbs.');

  // Cleared date: "Choose a date.", nothing saved.
  const dateInput = sheet.getByLabel('Date', { exact: true });
  const today = await dateInput.inputValue();
  await dateInput.fill('');
  await logWeight(sheet, 10);
  await expect(sheet.getByRole('alert')).toHaveText('Choose a date.');
  expect(await savedWeights(supabase, petId)).toHaveLength(0);

  // Extra decimals round to one place.
  await dateInput.fill(today);
  await logWeight(sheet, '10.26');
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('10.3 lbs');
  expect((await savedWeights(supabase, petId)).map((r) => Number(r.numeric_value))).toEqual([10.3]);
});

test('network failure: the list, a save and a delete each fail with their own message and change nothing', async ({ page }) => {
  const { supabase, userId, petId, name } = await createPet();
  await seedStandaloneWeight(supabase, userId, petId, isoDateDaysFromNow(-6), 9.5);
  const card = await openPetCard(page, name);
  await expect(weightRow(card)).toContainText('9.5 lbs', { timeout: 10000 });

  // The recent-weights list can't load.
  const failGets = (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 500, json: { message: 'made-up failure' } })
    : route.continue());
  await page.route('**/rest/v1/observations*', failGets);
  let sheet = await openSheetFromCard(page, card);
  await expect(sheet.getByText('Unable to load recent weights.', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.unroute('**/rest/v1/observations*', failGets);
  await sheet.getByRole('button', { name: 'Close' }).click();

  // A save that can't reach the database (reads still work).
  sheet = await openSheetFromCard(page, card);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  const failWrites = (route) => (route.request().method() === 'GET'
    ? route.continue()
    : route.abort('internetdisconnected'));
  await page.route('**/rest/v1/observations*', failWrites);
  await logWeight(sheet, 10.5);
  await expect(sheet.getByRole('alert')).toHaveText("We couldn't save this weight. Please try again.", { timeout: 10000 });

  // A delete that can't reach the database.
  await entries(sheet).first().getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this weight?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm.getByText("We couldn't delete this weight. Please try again.", { exact: true })).toBeVisible({ timeout: 10000 });
  await page.unroute('**/rest/v1/observations*', failWrites);

  // Nothing changed: the one seeded weight is still there, unchanged.
  expect((await savedWeights(supabase, petId)).map((r) => Number(r.numeric_value))).toEqual([9.5]);
});

test('deleted elsewhere: editing or deleting a weight another device already deleted says so', async ({ page }) => {
  const { supabase, userId, petId, name } = await createPet();
  const firstId = await seedStandaloneWeight(supabase, userId, petId, isoDateDaysFromNow(-8), 9.1);
  const secondId = await seedStandaloneWeight(supabase, userId, petId, isoDateDaysFromNow(-9), 9.2);
  const card = await openPetCard(page, name);
  const sheet = await openSheetFromCard(page, card);
  await expect(entries(sheet)).toHaveCount(2, { timeout: 10000 });

  // Edit: start editing the newer one, it's deleted elsewhere, then Save.
  await entries(sheet).first().getByRole('button', { name: 'Edit' }).click();
  await expect(sheet.getByLabel('Weight', { exact: true })).toHaveValue('9.1');
  await supabase.from('observations').delete().eq('id', firstId);
  await logWeight(sheet, 9.9);
  await expect(sheet.getByRole('alert')).toHaveText('This weight has already been deleted.', { timeout: 10000 });
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await expect(entries(sheet).first()).toContainText('9.2 lbs');

  // Delete: the other one is deleted elsewhere before the owner confirms.
  await entries(sheet).first().getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this weight?' });
  await expect(confirm).toBeVisible();
  await supabase.from('observations').delete().eq('id', secondId);
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm.getByText('This weight has already been deleted.', { exact: true })).toBeVisible({ timeout: 10000 });

  // Neither attempt brought a weight back.
  expect(await savedWeights(supabase, petId)).toHaveLength(0);
});

test("multiple pets: a weight logged for one pet never shows on another pet's card", async ({ page }) => {
  const petA = await createPet();
  const petB = await createPet();
  const cardA = await openPetCard(page, petA.name);
  const sheet = await openSheetFromCard(page, cardA);
  await expect(sheet.getByText('No weights logged yet.')).toBeVisible({ timeout: 10000 });
  await logWeight(sheet, 14.2);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  await sheet.getByRole('button', { name: 'Close' }).click();

  const cardB = await openPetCard(page, petB.name);
  await expect(weightRow(cardB)).toContainText('No weight history.', { timeout: 10000 });
  const sheetB = await openSheetFromCard(page, cardB);
  await expect(sheetB.getByText('No weights logged yet.')).toBeVisible({ timeout: 10000 });
  expect(await savedWeights(petB.supabase, petB.petId)).toHaveLength(0);
  expect((await savedWeights(petA.supabase, petA.petId)).map((r) => Number(r.numeric_value))).toEqual([14.2]);
});

// QA 2026-11-26: a memorial pet's weight history can be read but no new
// weight logged, on Pet Profile and on Trends alike (canLogWeightFor).
test('memorial pet: no way to log a weight from Pet Profile or Trends', async ({ page }) => {
  const { supabase, petId, name } = await createPet();
  const { error } = await supabase.from('pets').update({ is_memorial: true }).eq('id', petId);
  if (error) throw error;

  const card = await openPetCard(page, name);
  await expect(card.getByRole('button', { name: 'Edit Pet' })).toBeVisible({ timeout: 10000 });
  await expect(weightRow(card)).toHaveCount(0);
  await expect(card.getByText('Record Weight', { exact: true })).toHaveCount(0);

  await page.goto(`/pet/${petId}/trends`);
  const trendsWeight = page.locator('div.rounded-2xl').filter({ has: page.getByText('Weight', { exact: true }) }).last();
  await expect(trendsWeight).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Log weight' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Log weight' })).toHaveCount(0);
});

// Lynn 2026-11-25: Home's Weight chip stays direction-only (no number);
// AC1's numbers are on Pet Profile and Trends.
test("Home's Weight chip shows the direction from yesterday's to today's weight, with no number", async ({ page }) => {
  const { name } = await createPet();
  const card = await openPetCard(page, name);
  const sheet = await openSheetFromCard(page, card);
  await expect(sheet.getByText('No weights logged yet.')).toBeVisible({ timeout: 10000 });
  const dateInput = sheet.getByLabel('Date', { exact: true });
  const today = await dateInput.inputValue();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);

  await dateInput.fill(yesterday);
  await logWeight(sheet, 10.0);
  await expect(entries(sheet)).toHaveCount(1, { timeout: 10000 });
  // The date resets to today after a save.
  await expect(dateInput).toHaveValue(today);
  await logWeight(sheet, 11.0);
  await expect(entries(sheet)).toHaveCount(2, { timeout: 10000 });
  await sheet.getByRole('button', { name: 'Close' }).click();

  await page.goto('/');
  await dismissAnyOpenSheet(page);
  const homeCard = page.getByRole('link', { name: `${name}. View profile.`, exact: true });
  await expect(homeCard).toBeVisible({ timeout: 15000 });
  const chip = homeCard.getByRole('button', { name: 'Weight increased versus yesterday' });
  await expect(chip).toBeVisible({ timeout: 15000 });
  await expect(chip).not.toContainText('11');
  await expect(chip).not.toContainText('lbs');
});
