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
import { test, expect } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

let weightPetId;

async function signInSupabase() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as ${process.env.PLAYWRIGHT_TEST1_EMAIL}: ${error.message}`);
  return { supabase, userId: data.user.id };
}

function isoDateDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.afterEach(async () => {
  if (!weightPetId) return;
  const { supabase } = await signInSupabase();
  await supabase.functions.invoke('delete-pet', { body: { pet_id: weightPetId } });
  weightPetId = undefined;
});

async function createPet() {
  const { supabase, userId } = await signInSupabase();
  const name = `E2E Weight Pet ${Date.now()}`;
  const { data: pet, error } = await supabase
    .from('pets')
    .insert({ created_by: userId, name, species: 'Cat' })
    .select('id')
    .single();
  if (error) throw error;
  weightPetId = pet.id;
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
