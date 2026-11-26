// Spec 0081 T18: one review for bloodwork imported from a photo, PDF or
// spreadsheet (FR27-FR36; AC14, AC16-AC19, AC21-AC23), on the Health
// Records page's Bloodwork section.
//
// No real AI call: `ask-vet-assistant` is answered with page.route(), in
// the shape the server's cleanBloodworkAnswer() sends (same pattern as
// ask-wysker-guardrails.spec.js and vaccination-scan-review.spec.js). So
// this checks the app's half: what is sent, how the review shows the
// answer, and what is saved. Whether the AI reads a real sheet or report
// correctly is a manual check on dev (spec 0081 Test Plan).
//
// Each test makes its own throwaway pet on test1@ and deletes it after
// with delete-pet, which removes its bloodwork, weights, linked documents
// and their files. A file kept by a test is also removed directly.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { test, expect } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

const ASK_VET_ASSISTANT = '**/functions/v1/ask-vet-assistant';
const FIXTURES = path.join(process.cwd(), 'e2e/fixtures');
const CSV_FIXTURE = path.join(FIXTURES, 'bloodwork-rows-sample.csv');
const XLSX_FIXTURE = path.join(FIXTURES, 'bloodwork-template-sample.xlsx');
const SCAN_FIXTURE = path.join(FIXTURES, 'test-scan.png');
const REVIEW = 'Review imported bloodwork';

let supabase;
let userId;
let createdPetIds = [];
let keptPaths = [];

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
  if (keptPaths.length) await supabase.storage.from('uploads').remove(keptPaths);
  keptPaths = [];
});

async function createPet() {
  const { data, error } = await supabase
    .from('pets')
    .insert({ created_by: userId, name: `E2E Bloodwork Import ${Date.now()}`, species: 'Cat' })
    .select('id')
    .single();
  if (error) throw error;
  createdPetIds.push(data.id);
  return data.id;
}

async function bloodworkRows(petId) {
  const { data, error } = await supabase.from('bloodwork').select('date, bun, creatinine, sdma, lab_name').eq('pet_id', petId).order('date', { ascending: false });
  if (error) throw error;
  return data;
}

async function weightRows(petId) {
  const { data, error } = await supabase
    .from('observations')
    .select('numeric_value, observed_at, daily_check_in_id, observation_types!inner(code)')
    .eq('pet_id', petId)
    .eq('observation_types.code', 'weight')
    .order('observed_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function fileExists(storagePath) {
  const [folder, name] = storagePath.split('/');
  const { data } = await supabase.storage.from('uploads').list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
}

// Answers every ask-vet-assistant call with `answer` and records the
// request bodies, so a test can check what was sent (or that nothing was).
async function stubAI(page, answer) {
  const calls = [];
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    calls.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ json: answer });
  });
  return calls;
}

// Opens Health Records, picks a file and returns the uploaded file's
// storage path (or null if nothing was uploaded).
async function importFile(page, petId, files, { expectUpload = true } = {}) {
  await page.goto(`/pet/${petId}/health-records`);
  const uploadReq = expectUpload
    ? page.waitForRequest((req) => req.method() === 'POST' && /\/storage\/v1\/object\/uploads\//.test(req.url()))
    : null;
  await page.setInputFiles('input[type="file"]', files);
  if (!uploadReq) return null;
  const url = new URL((await uploadReq).url());
  return decodeURIComponent(url.pathname.split('/storage/v1/object/uploads/')[1]);
}

const reviewSheet = (page) => page.getByRole('dialog', { name: REVIEW });
const cards = (page) => reviewSheet(page).getByTestId('bloodwork-visit-card');

const csvAnswer = {
  visits: [
    { date: '2026-10-02', lab_name: 'Made-up Lab', vet_name: 'Dr. Test', values: { bun: 32, creatinine: 2.1, sdma: 15 }, not_tracked: [], conflict: false },
    { date: '2026-06-14', lab_name: 'Made-up Lab', vet_name: 'Dr. Test', values: { bun: 28, creatinine: 1.9, sdma: 13 }, not_tracked: [], conflict: false },
    { date: '2026-03-14', lab_name: 'Made-up Lab', vet_name: 'Dr. Test', values: { bun: 25, creatinine: 1.7, sdma: 12 }, not_tracked: [], conflict: false },
  ],
  skipped: [],
};

test('the Upload File picker takes photos, PDFs and spreadsheets, with the help line (wording E)', async ({ page }) => {
  const petId = await createPet();
  await page.goto(`/pet/${petId}/health-records`);
  await expect(page.getByText('(accepts photo, PDF, CSV or Excel)', { exact: true })).toBeVisible({ timeout: 10000 });
  const accept = await page.locator('input[type="file"]').getAttribute('accept');
  for (const part of ['image/*', 'application/pdf', '.csv', '.xlsx']) expect(accept).toContain(part);
});

test('AC14: a three-visit CSV shows three visits, and confirming saves three records and keeps the file', async ({ page }) => {
  const petId = await createPet();
  const calls = await stubAI(page, csvAnswer);
  const storagePath = await importFile(page, petId, CSV_FIXTURE);

  await expect(reviewSheet(page)).toBeVisible({ timeout: 15000 });
  await expect(reviewSheet(page).getByText('We found 3 visits. Check each one before saving.')).toBeVisible();
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).nth(0)).toContainText('Oct 2, 2026');
  await expect(cards(page).nth(1)).toContainText('Jun 14, 2026');
  await expect(cards(page).nth(2)).toContainText('Mar 14, 2026');
  // The app's unit beside every value.
  await expect(cards(page).nth(0).getByTestId('unit-bun')).toHaveText('mg/dL');
  await expect(cards(page).nth(0).getByTestId('unit-sdma')).toHaveText('µg/dL');

  // Only the sheet's text went to the AI, never the file.
  expect(calls).toHaveLength(1);
  expect(calls[0].task).toBe('bloodwork_spreadsheet');
  expect(calls[0].file_path).toBeUndefined();
  expect(calls[0].sheet_text).toContain('2026-10-02,Made-up Lab,Dr. Test,32,2.1,15');

  expect(await bloodworkRows(petId)).toEqual([]);
  await reviewSheet(page).getByRole('button', { name: 'Save 3 visits' }).click();
  await expect(reviewSheet(page)).not.toBeVisible({ timeout: 10000 });

  await expect.poll(async () => (await bloodworkRows(petId)).map((r) => [r.date, r.bun, r.creatinine, r.sdma])).toEqual([
    ['2026-10-02', 32, 2.1, 15],
    ['2026-06-14', 28, 1.9, 13],
    ['2026-03-14', 25, 1.7, 12],
  ]);
  await expect.poll(async () => {
    const { data } = await supabase.from('pet_documents').select('storage_path, kind').eq('pet_id', petId);
    return data ?? [];
  }).toEqual([{ storage_path: storagePath, kind: 'bloodwork' }]);
  expect(await fileExists(storagePath)).toBe(true);
  keptPaths.push(storagePath);
});

test('an edited value is what gets saved', async ({ page }) => {
  const petId = await createPet();
  await stubAI(page, { visits: [csvAnswer.visits[0]], skipped: [] });
  const storagePath = await importFile(page, petId, CSV_FIXTURE);
  keptPaths.push(storagePath);

  await expect(cards(page)).toHaveCount(1, { timeout: 15000 });
  await cards(page).first().getByLabel('BUN').fill('33.5');
  await reviewSheet(page).getByRole('button', { name: 'Save 1 visit' }).click();
  await expect(reviewSheet(page)).not.toBeVisible({ timeout: 10000 });
  await expect.poll(async () => (await bloodworkRows(petId)).map((r) => r.bun)).toEqual([33.5]);
});

test('AC16: a visit already on file starts unticked and saving adds nothing for that date', async ({ page }) => {
  const petId = await createPet();
  const { error } = await supabase.from('bloodwork').insert({ pet_id: petId, date: '2026-06-14', bun: 99 });
  if (error) throw error;
  await stubAI(page, csvAnswer);
  const storagePath = await importFile(page, petId, CSV_FIXTURE);
  keptPaths.push(storagePath);

  await expect(cards(page)).toHaveCount(3, { timeout: 15000 });
  const onFile = cards(page).nth(1);
  await expect(onFile).toContainText('Already on file');
  await expect(onFile.getByRole('checkbox', { name: 'Include' })).not.toBeChecked();
  await expect(cards(page).nth(0).getByRole('checkbox', { name: 'Include' })).toBeChecked();
  await expect(cards(page).nth(0)).not.toContainText('Already on file');

  await reviewSheet(page).getByRole('button', { name: 'Save 2 visits' }).click();
  await expect(reviewSheet(page)).not.toBeVisible({ timeout: 10000 });
  await expect.poll(async () => (await bloodworkRows(petId)).map((r) => [r.date, r.bun])).toEqual([
    ['2026-10-02', 32],
    ['2026-06-14', 99],
    ['2026-03-14', 25],
  ]);
});

test('AC17/AC21: a two-visit scan shows two cards with creatinine under "Not imported", never as a value', async ({ page }) => {
  const petId = await createPet();
  const calls = await stubAI(page, {
    visits: [
      { date: '2026-10-02', lab_name: 'IDEXX', values: { bun: 32, sdma: 15 }, not_tracked: ['Chloride', 'Globulin', 'GGT'], conflict: false },
      { date: '2026-06-14', lab_name: 'IDEXX', values: { bun: 28 }, not_tracked: ['Chloride'], conflict: false },
    ],
    skipped: [
      { visit: 0, date: '2026-10-02', field: 'creatinine', label: 'Creatinine', unit: 'µmol/L', value: 194.48 },
      { visit: 1, date: '2026-06-14', field: 'creatinine', label: 'Creatinine', unit: 'µmol/L', value: 170.2 },
    ],
  });
  const storagePath = await importFile(page, petId, SCAN_FIXTURE);
  keptPaths.push(storagePath);

  await expect(cards(page)).toHaveCount(2, { timeout: 15000 });
  expect(calls[0]).toMatchObject({ task: 'scan_bloodwork', file_path: storagePath });
  expect(calls[0].sheet_text).toBeUndefined();
  for (let i = 0; i < 2; i += 1) {
    const card = cards(page).nth(i);
    await expect(card.getByText('Not imported (different unit): Creatinine µmol/L')).toBeVisible();
    await expect(card.getByLabel('Creatinine')).toHaveCount(0);
    await expect(card).not.toContainText('194.48');
  }
  await expect(cards(page).nth(0).getByText('Not tracked yet: Chloride, Globulin, GGT')).toBeVisible();

  await reviewSheet(page).getByRole('button', { name: 'Save 2 visits' }).click();
  await expect(reviewSheet(page)).not.toBeVisible({ timeout: 10000 });
  await expect.poll(async () => (await bloodworkRows(petId)).map((r) => [r.date, r.creatinine])).toEqual([
    ['2026-10-02', null],
    ['2026-06-14', null],
  ]);
});

test('AC18: Cancel saves nothing and deletes the uploaded file', async ({ page }) => {
  const petId = await createPet();
  await stubAI(page, csvAnswer);
  const storagePath = await importFile(page, petId, CSV_FIXTURE);

  await expect(reviewSheet(page)).toBeVisible({ timeout: 15000 });
  await reviewSheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(reviewSheet(page)).not.toBeVisible();

  await expect.poll(() => fileExists(storagePath)).toBe(false);
  expect(await bloodworkRows(petId)).toEqual([]);
  const { data } = await supabase.from('pet_documents').select('id').eq('pet_id', petId);
  expect(data ?? []).toEqual([]);
});

test('AC18: closing the review saves nothing and deletes the uploaded file', async ({ page }) => {
  const petId = await createPet();
  await stubAI(page, { visits: [csvAnswer.visits[0]], skipped: [] });
  const storagePath = await importFile(page, petId, SCAN_FIXTURE);

  await expect(reviewSheet(page)).toBeVisible({ timeout: 15000 });
  await reviewSheet(page).getByRole('button', { name: 'Close' }).click();
  await expect(reviewSheet(page)).not.toBeVisible();

  await expect.poll(() => fileExists(storagePath)).toBe(false);
  expect(await bloodworkRows(petId)).toEqual([]);
});

test('AC19: an old .xls is refused with wording G before any upload or AI call', async ({ page }) => {
  const petId = await createPet();
  const calls = await stubAI(page, csvAnswer);
  let uploads = 0;
  page.on('request', (req) => { if (/\/storage\/v1\/object\/uploads\//.test(req.url())) uploads += 1; });
  await importFile(page, petId, { name: 'labs.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) }, { expectUpload: false });

  await expect(page.getByText('This is an older Excel file. Save it as .xlsx or .csv and try again.', { exact: true })).toBeVisible({ timeout: 10000 });
  expect(calls).toHaveLength(0);
  expect(uploads).toBe(0);
});

test('AC19: a sheet over 60,000 characters is refused with wording G before any upload or AI call', async ({ page }) => {
  const petId = await createPet();
  const calls = await stubAI(page, csvAnswer);
  let uploads = 0;
  page.on('request', (req) => { if (/\/storage\/v1\/object\/uploads\//.test(req.url())) uploads += 1; });
  const rows = ['Date,BUN'];
  for (let i = 0; i < 6000; i += 1) rows.push(`2026-01-01,${1000 + i}`);
  await importFile(page, petId, { name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) }, { expectUpload: false });

  await expect(page.getByText('This spreadsheet is too large to import. Try a sheet with just the bloodwork results.', { exact: true })).toBeVisible({ timeout: 10000 });
  expect(calls).toHaveLength(0);
  expect(uploads).toBe(0);
});

test('AC19: a sheet with no bloodwork gets wording G and its file is deleted', async ({ page }) => {
  const petId = await createPet();
  await stubAI(page, { visits: [], skipped: [] });
  const storagePath = await importFile(page, petId, { name: 'pets.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Age\nBiscuit,4\n') });

  await expect(page.getByText("We couldn't find any bloodwork results in this spreadsheet.", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(reviewSheet(page)).toHaveCount(0);
  await expect.poll(() => fileExists(storagePath)).toBe(false);
});

test('a failed AI call shows the shared AI error and deletes the file', async ({ page }) => {
  const petId = await createPet();
  await page.route(ASK_VET_ASSISTANT, (route) => route.fulfill({ status: 500, json: { error: 'Something went wrong. Please try again.' } }));
  const storagePath = await importFile(page, petId, CSV_FIXTURE);

  await expect(page.getByText('Something went wrong. Please try again.', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => fileExists(storagePath)).toBe(false);
});

const templateAnswer = {
  visits: [
    { date: '2026-10-02', values: { bun: 32, creatinine: 2.1, sdma: 15, phosphorus: 5.2 }, weight_lbs: 9.8, not_tracked: ['Chloride'], conflict: false },
    { date: '2026-06-14', values: { bun: 28, creatinine: 1.9, sdma: 13, phosphorus: 4.8 }, weight_lbs: 10.1, not_tracked: ['Chloride'], conflict: false },
    { date: '2026-03-14', values: { bun: 25, creatinine: 1.7, sdma: 12, phosphorus: 4.5 }, weight_lbs: 10.4, not_tracked: ['Chloride'], conflict: false },
  ],
  skipped: [],
};

test("AC22: Lynn's template layout shows three visits with ticked weights, and saves three records and three weights", async ({ page }) => {
  const petId = await createPet();
  const calls = await stubAI(page, templateAnswer);
  const storagePath = await importFile(page, petId, XLSX_FIXTURE);
  keptPaths.push(storagePath);

  await expect(cards(page)).toHaveCount(3, { timeout: 15000 });
  // Both sheets were read and sent as text.
  expect(calls[0].task).toBe('bloodwork_spreadsheet');
  expect(calls[0].sheet_text).toContain('Inc Research');
  expect(calls[0].sheet_text).toContain('No Research');

  const weights = [9.8, 10.1, 10.4];
  for (let i = 0; i < 3; i += 1) {
    const line = cards(page).nth(i).getByRole('checkbox', { name: `Weight ${weights[i]} lbs: also add to weight history` });
    await expect(line).toBeChecked();
    // No reference-range number (e.g. 16-36, 0.8-2.4) shows as a value.
    await expect(cards(page).nth(i).getByLabel('BUN')).not.toHaveValue(/16|36/);
  }

  await reviewSheet(page).getByRole('button', { name: 'Save 3 visits' }).click();
  await expect(reviewSheet(page)).not.toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await bloodworkRows(petId)).map((r) => r.date)).toEqual(['2026-10-02', '2026-06-14', '2026-03-14']);
  await expect.poll(async () => (await weightRows(petId)).map((w) => [w.observed_at.slice(0, 10), Number(w.numeric_value), w.daily_check_in_id])).toEqual([
    ['2026-10-02', 9.8, null],
    ['2026-06-14', 10.1, null],
    ['2026-03-14', 10.4, null],
  ]);
});

test('FR36: a weight line starts unticked when the pet already has a weight that day, and unticked weights are not saved', async ({ page }) => {
  const petId = await createPet();
  const { data: type } = await supabase.from('observation_types').select('id').eq('code', 'weight').single();
  const { error } = await supabase.from('observations').insert({
    pet_id: petId, daily_check_in_id: null, observation_type_id: type.id, numeric_value: 11, observed_at: '2026-06-14T12:00:00.000Z',
  });
  if (error) throw error;
  await stubAI(page, templateAnswer);
  const storagePath = await importFile(page, petId, XLSX_FIXTURE);
  keptPaths.push(storagePath);

  await expect(cards(page)).toHaveCount(3, { timeout: 15000 });
  await expect(cards(page).nth(1).getByRole('checkbox', { name: /^Weight 10.1 lbs/ })).not.toBeChecked();
  await expect(cards(page).nth(0).getByRole('checkbox', { name: /^Weight 9.8 lbs/ })).toBeChecked();

  await reviewSheet(page).getByRole('button', { name: 'Save 3 visits' }).click();
  await expect(reviewSheet(page)).not.toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await weightRows(petId)).map((w) => [w.observed_at.slice(0, 10), Number(w.numeric_value)])).toEqual([
    ['2026-10-02', 9.8],
    ['2026-06-14', 11],
    ['2026-03-14', 10.4],
  ]);
});

test('AC23: the same date found twice with different values shows both, unticked, marked', async ({ page }) => {
  const petId = await createPet();
  await stubAI(page, {
    visits: [
      { date: '2026-10-02', values: { creatinine: 2.1 }, not_tracked: [], conflict: true },
      { date: '2026-10-02', values: { creatinine: 2.4 }, not_tracked: [], conflict: true },
      { date: '2026-06-14', values: { creatinine: 1.9 }, not_tracked: [], conflict: false },
    ],
    skipped: [],
  });
  const storagePath = await importFile(page, petId, XLSX_FIXTURE);
  keptPaths.push(storagePath);

  await expect(cards(page)).toHaveCount(3, { timeout: 15000 });
  for (let i = 0; i < 2; i += 1) {
    await expect(cards(page).nth(i).getByText('Found twice with different values. Check which is right.')).toBeVisible();
    await expect(cards(page).nth(i).getByRole('checkbox', { name: 'Include' })).not.toBeChecked();
  }
  await expect(cards(page).nth(0).getByLabel('Creatinine')).toHaveValue('2.1');
  await expect(cards(page).nth(1).getByLabel('Creatinine')).toHaveValue('2.4');
  await expect(cards(page).nth(2)).not.toContainText('Found twice');

  // The owner picks one version.
  await cards(page).nth(1).getByRole('checkbox', { name: 'Include' }).click();
  await reviewSheet(page).getByRole('button', { name: 'Save 2 visits' }).click();
  await expect(reviewSheet(page)).not.toBeVisible({ timeout: 10000 });
  await expect.poll(async () => (await bloodworkRows(petId)).map((r) => [r.date, r.creatinine])).toEqual([
    ['2026-10-02', 2.4],
    ['2026-06-14', 1.9],
  ]);
});
