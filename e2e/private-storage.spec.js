// Spec 0071 (punch list PA-01) — pet photos from private storage.
//
// Who-can-open-what (owner/co-owner/sitter/stranger/signed out) is covered
// by supabase/tests/private_uploads.test.ts, which can create throwaway
// households of users. These tests cover what only a browser shows: a photo
// uploaded in Edit Pet appears through a signed link, and refused files get
// a plain-language message instead of an endless spinner.
//
// Each test uses its own throwaway pet on test1@ (same pattern as
// vaccination-scan-review.spec.js), removed with delete-pet afterward,
// which also removes its photo file.
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { test, expect } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

const PHOTO_FIXTURE = path.join(process.cwd(), 'e2e/fixtures/test-scan.png');
const MB = 1024 * 1024;

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

async function createPet(name) {
  const { data, error } = await supabase.from('pets').insert({ created_by: userId, name, species: 'Cat' }).select('id').single();
  if (error) throw error;
  createdPetIds.push(data.id);
  return data.id;
}

test('a photo added in Edit Pet is saved as a private file and shown through a signed link', async ({ page }) => {
  const petName = `E2E Photo Pet ${Date.now()}`;
  const petId = await createPet(petName);

  await page.goto(`/pet/${petId}/edit`);
  await page.setInputFiles('input[type="file"]', PHOTO_FIXTURE);
  await expect(page.getByText('Change photo')).toBeVisible();
  await page.getByRole('button', { name: /^Save/ }).click();

  await expect.poll(async () => {
    const { data } = await supabase.from('pets').select('photo_path').eq('id', petId).single();
    return data?.photo_path ?? '';
  }).toMatch(new RegExp(`^${userId}/`));

  await page.goto(`/pet/${petId}`);
  const photo = page.getByTestId('pet-photo').first();
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/uploads\//);
  // Actually loaded, not just present in the page.
  await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('a photo over 10 MB is refused with a message, and nothing is uploaded', async ({ page }) => {
  const petId = await createPet(`E2E Big Photo ${Date.now()}`);
  let uploadAttempted = false;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/storage/v1/object/uploads/')) uploadAttempted = true;
  });

  await page.goto(`/pet/${petId}/edit`);
  await page.setInputFiles('input[type="file"]', {
    name: 'huge.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(11 * MB),
  });

  await expect(page.getByText('That file is over 10 MB. Try a smaller photo or PDF.').first()).toBeVisible();
  await expect(page.getByText('Add photo')).toBeVisible();
  expect(uploadAttempted).toBe(false);
});

test('a non-photo file picked as a pet photo is refused with a message', async ({ page }) => {
  const petId = await createPet(`E2E Wrong Type ${Date.now()}`);

  await page.goto(`/pet/${petId}/edit`);
  await page.setInputFiles('input[type="file"]', {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a photo'),
  });

  await expect(page.getByText('Wysker Watch can only use photos (JPEG, PNG, WebP, GIF) or PDFs.').first()).toBeVisible();
  await expect(page.getByText('Add photo')).toBeVisible();
});
