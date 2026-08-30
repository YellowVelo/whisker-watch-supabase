// Spec 0061 — Invoice Scan / Multi-Pet Vaccination Review. None of these
// need a real Anthropic API call: the `ask-vet-assistant` request is
// intercepted with page.route().fulfill() and returns a synthetic body,
// the same pattern already established in e2e/ask-wysker-guardrails.spec.js.
// What CAN'T be covered here is whether Claude reads a real document
// correctly — that's a manual check with real sample documents, not
// something a mocked response can verify.
//
// Each test uses its own throwaway pet(s), created directly via Supabase
// (same pattern as e2e/catch-up-flow.spec.js) and cleaned up via the
// delete-pet Edge Function afterward, rather than touching test1@'s real
// pets/vaccination data.
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { test, expect } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

const ASK_VET_ASSISTANT = '**/functions/v1/ask-vet-assistant';
const SCAN_FIXTURE = path.join(process.cwd(), 'e2e/fixtures/test-scan.png');

let supabase;
let userId;
let createdPetIds = [];

test.beforeAll(async () => {
  supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as test1@: ${error.message}`);
  userId = data.user.id;
});

test.afterEach(async () => {
  const ids = createdPetIds;
  createdPetIds = [];
  for (const id of ids) {
    await supabase.functions.invoke('delete-pet', { body: { pet_id: id } });
  }
});

async function createPet(name, species) {
  const { data, error } = await supabase.from('pets').insert({ created_by: userId, name, species }).select('id').single();
  if (error) throw error;
  createdPetIds.push(data.id);
  return data.id;
}

async function openScanFrom(page, petId, mockResponse) {
  await page.route(ASK_VET_ASSISTANT, (route) => route.fulfill({ json: mockResponse }));
  await page.goto(`/pet/${petId}/vaccinations`);
  await page.setInputFiles('input[type="file"]', SCAN_FIXTURE);
}

test('single-pet document opens a review screen and saves nothing until confirmed', async ({ page }) => {
  const petName = `E2E Scan Pet ${Date.now()}`;
  const petId = await createPet(petName);

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'Rabies', date_given: '2026-08-01', next_due_date: '2027-08-01', administered_by: 'Dr. Test' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await expect(page.getByText(petName)).toBeVisible();
  await expect(page.getByPlaceholder('Vaccine name')).toHaveValue('Rabies');

  const { data: before } = await supabase.from('vaccinations').select('id').eq('pet_id', petId);
  expect(before?.length ?? 0).toBe(0);

  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data: after } = await supabase.from('vaccinations').select('vaccine_name, date_given').eq('pet_id', petId);
  expect(after.length).toBe(1);
  expect(after[0].vaccine_name).toBe('Rabies');
});

test('multi-pet document groups by the named pet, and a nameless line defaults to the launching pet', async ({ page }) => {
  const petAName = `E2E Scan Harper ${Date.now()}`;
  const petBName = `E2E Scan Auggie ${Date.now()}`;
  const petAId = await createPet(petAName);
  const petBId = await createPet(petBName);

  // Launched from pet A's page. One line names pet B explicitly; the other
  // has no pet_name at all, so per spec 0061 it should default to pet A
  // (the pet whose page the scan was started from) rather than being guessed.
  await openScanFrom(page, petAId, {
    vaccines: [
      { vaccine_name: 'Bordetella', date_given: '2026-08-10', pet_name: petBName },
      { vaccine_name: 'Rabies', date_given: '2026-08-10' },
    ],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await expect(page.getByText(petAName)).toBeVisible();
  await expect(page.getByText(petBName)).toBeVisible();

  await page.getByRole('button', { name: /Save 2 Vaccinations/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data: petAVax } = await supabase.from('vaccinations').select('vaccine_name').eq('pet_id', petAId);
  const { data: petBVax } = await supabase.from('vaccinations').select('vaccine_name').eq('pet_id', petBId);
  expect(petAVax.map((v) => v.vaccine_name)).toEqual(['Rabies']);
  expect(petBVax.map((v) => v.vaccine_name)).toEqual(['Bordetella']);
});

test('editing a field on the review screen before confirming saves the edited value', async ({ page }) => {
  const petName = `E2E Scan Edit ${Date.now()}`;
  const petId = await createPet(petName);

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'Rabies', date_given: '2026-01-01' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await page.locator('input[type="date"]').first().fill('2026-08-15');
  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('date_given').eq('pet_id', petId).single();
  expect(data.date_given).toBe('2026-08-15');
});

test('unchecking a detected vaccination excludes it from saving', async ({ page }) => {
  const petName = `E2E Scan Uncheck ${Date.now()}`;
  const petId = await createPet(petName);

  await openScanFrom(page, petId, {
    vaccines: [
      { vaccine_name: 'Rabies', date_given: '2026-08-01' },
      { vaccine_name: 'Bordetella', date_given: '2026-08-01' },
    ],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await page.getByRole('checkbox').nth(1).click();
  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('vaccine_name').eq('pet_id', petId);
  expect(data.map((v) => v.vaccine_name)).toEqual(['Rabies']);
});

test('a matching existing record is updated, not duplicated', async ({ page }) => {
  const petName = `E2E Scan Update ${Date.now()}`;
  const petId = await createPet(petName);
  await supabase.from('vaccinations').insert({ pet_id: petId, vaccine_name: 'Rabies', date_given: '2025-01-01', created_by: userId });

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'rabies', date_given: '2026-08-20' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await expect(page.getByText('Will update')).toBeVisible();
  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('id, date_given').eq('pet_id', petId);
  expect(data.length).toBe(1);
  expect(data[0].date_given).toBe('2026-08-20');
});

test('a differently-worded known vaccine name (added prefix) is recognized as the same vaccine', async ({ page }) => {
  const petName = `E2E Scan Fuzzy Prefix ${Date.now()}`;
  const petId = await createPet(petName, 'Dog');
  await supabase.from('vaccinations').insert({ pet_id: petId, vaccine_name: 'Rabies Vaccine', date_given: '2025-01-01', created_by: userId });

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'Canine - Rabies Vaccine', date_given: '2026-08-20' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await expect(page.getByText('Will update')).toBeVisible();
  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('id, date_given').eq('pet_id', petId);
  expect(data.length).toBe(1);
  expect(data[0].date_given).toBe('2026-08-20');
});

test('a differently-worded known vaccine name (added parenthetical) is recognized as the same vaccine', async ({ page }) => {
  const petName = `E2E Scan Fuzzy Paren ${Date.now()}`;
  const petId = await createPet(petName, 'Dog');
  await supabase.from('vaccinations').insert({ pet_id: petId, vaccine_name: 'Bordetella Vaccine', date_given: '2025-01-01', created_by: userId });

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'Canine - Bordetella Vaccine (Oral)', date_given: '2026-08-20' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await expect(page.getByText('Will update')).toBeVisible();
  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('id, date_given').eq('pet_id', petId);
  expect(data.length).toBe(1);
  expect(data[0].date_given).toBe('2026-08-20');
});

test('an unrecognized vaccine name worded differently from an existing record is not fuzzy-matched', async ({ page }) => {
  const petName = `E2E Scan Fuzzy Unknown ${Date.now()}`;
  const petId = await createPet(petName, 'Dog');
  await supabase.from('vaccinations').insert({ pet_id: petId, vaccine_name: 'Giardia Vaccine', date_given: '2025-01-01', created_by: userId });

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'Canine - Giardia Vaccine', date_given: '2026-08-20' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await expect(page.getByText('Will update')).not.toBeVisible();
  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('id, vaccine_name').eq('pet_id', petId).order('vaccine_name');
  expect(data.length).toBe(2);
  expect(data.map((v) => v.vaccine_name)).toEqual(['Canine - Giardia Vaccine', 'Giardia Vaccine']);
});

test('a medication mentioned in the scanned response is never shown or saved', async ({ page }) => {
  const petName = `E2E Scan Med ${Date.now()}`;
  const petId = await createPet(petName);

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'Rabies', date_given: '2026-08-01' }],
    // Not part of the requested schema, but confirms the client only ever
    // reads `vaccines` even if the model returns something else alongside it.
    medications: [{ name: 'Carprofen', pet_name: 'Some Other Pet' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await expect(page.getByText('Carprofen')).not.toBeVisible();

  await page.getByRole('button', { name: /Save 1 Vaccination/ }).click();
  const { data } = await supabase.from('medications').select('id').eq('pet_id', petId);
  expect(data?.length ?? 0).toBe(0);
});

test('an AI failure shows an error and never opens the review screen', async ({ page }) => {
  const petName = `E2E Scan Fail ${Date.now()}`;
  const petId = await createPet(petName);

  await page.route(ASK_VET_ASSISTANT, (route) => route.fulfill({
    status: 429,
    json: { error: "You've reached the limit for AI requests. Please wait a few minutes and try again." },
  }));
  await page.goto(`/pet/${petId}/vaccinations`);
  await page.setInputFiles('input[type="file"]', SCAN_FIXTURE);

  // .first(): the real Radix toast (fixed 2026-08-29 — see spec 0061's
  // investigation) now also renders an aria-live announcer span with the
  // same text for screen readers, alongside the visible toast itself.
  await expect(page.getByText(/reached the limit for AI requests/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('id').eq('pet_id', petId);
  expect(data?.length ?? 0).toBe(0);
});

test('closing the review screen without confirming saves nothing', async ({ page }) => {
  const petName = `E2E Scan Abandon ${Date.now()}`;
  const petId = await createPet(petName);

  await openScanFrom(page, petId, {
    vaccines: [{ vaccine_name: 'Rabies', date_given: '2026-08-01' }],
  });

  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Review Scanned Vaccinations' })).not.toBeVisible();

  const { data } = await supabase.from('vaccinations').select('id').eq('pet_id', petId);
  expect(data?.length ?? 0).toBe(0);
});
