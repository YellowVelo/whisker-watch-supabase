// Confirmed a working, wired-up feature (App.jsx route, Home.jsx link,
// BottomTabBar active-tab logic) — this is normal coverage, not a
// regression hunt for a suspected-missing feature.
//
// Spec 0057 adds the sitter-identity tests below, closing out spec 0037's
// (Sitter Wellbeing Chips) unfinished Test Plan / Launch Plan Task #18.
// These are the suite's only tests that need a *second* signed-in
// identity (a sitter looking at a pet they don't own) — kept entirely
// local to this file (its own `test` override, its own setup/teardown)
// rather than touching e2e/global-setup.js or e2e/fixtures.js, which
// every other spec in the suite depends on.
import { test as base, expect } from '@playwright/test';
import { test as test1, dismissAnyOpenSheet } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

function newClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function signInAsTest1(supabase) {
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`pet-sitter.spec.js: could not sign in as test1@: ${error.message}`);
}

// Signs in as test4@ directly via signInWithPassword (same approach
// global-setup.js uses for test1@) and hands Playwright a storageState
// object with that session pre-loaded into localStorage, so every test in
// this file starts already logged in as the sitter — never as test1@.
const test = base.extend({
  storageState: async ({}, use) => {
    const supabase = newClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: process.env.PLAYWRIGHT_TEST4_SITTER_EMAIL,
      password: process.env.PLAYWRIGHT_TEST4_SITTER_PASSWORD,
    });
    if (error || !data.session) {
      throw new Error(`pet-sitter.spec.js: could not sign in as test4@: ${error?.message}`);
    }
    const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    await use({
      cookies: [],
      origins: [{
        origin: BASE_URL,
        localStorage: [{ name: storageKey, value: JSON.stringify(data.session) }],
      }],
    });
  },
});

// Unique per run, same disposable-fixture naming convention add-pet.spec.js
// uses, so cleanup can find exactly what this run created even if a
// previous run's afterAll somehow failed.
const RUN_ID = Date.now();
// Deliberately distinct prefixes ("A"/"B"), not "Checkin"/"NoCheckin" —
// one name being a substring of the other would make the `hasText`
// row-locator filters below ambiguous.
const PET_WITH_CHECKIN_NAME = `E2E Sitter Test Pet A ${RUN_ID}`;
const PET_NO_CHECKIN_NAME = `E2E Sitter Test Pet B ${RUN_ID}`;

let petWithCheckinId;
let petNoCheckinId;
// Whether test4@ owns or co-owns any pets of its own on dev (spec 0079's
// AC2 needs a sitter with none; checked in beforeAll, not assumed).
let test4OwnsPets = false;
// IDs of the two seeded pets that test4@ can actually read as a sitter
// (checked in beforeAll). AC1/AC3 assert sat pets are *absent*; without
// this they'd pass vacuously if the sit never gave test4@ access.
let satPetIdsVisibleToTest4 = [];

test.beforeAll(async () => {
  const supabase = newClient();
  await signInAsTest1(supabase);
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user.id;

  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .insert([
      { name: PET_WITH_CHECKIN_NAME, species: 'Cat', created_by: ownerId },
      { name: PET_NO_CHECKIN_NAME, species: 'Cat', created_by: ownerId },
    ])
    .select();
  if (petsError) throw petsError;
  petWithCheckinId = pets.find((p) => p.name === PET_WITH_CHECKIN_NAME).id;
  petNoCheckinId = pets.find((p) => p.name === PET_NO_CHECKIN_NAME).id;

  // Same three writes InviteSitterDialog.jsx's real UI flow makes (create
  // the sit, invite by email) — called directly instead of clicked
  // through, since this is setup data, not the thing under test.
  const { data: sit, error: sitError } = await supabase
    .from('pet_sits')
    .insert({
      created_by: ownerId,
      pet_ids: [petWithCheckinId, petNoCheckinId],
      sitter_name: 'E2E Sitter',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (sitError) throw sitError;

  const { error: accessError } = await supabase
    .from('pet_sitter_access')
    .insert({
      pet_sit_id: sit.id,
      owner_id: ownerId,
      created_by: ownerId,
      sitter_email: process.env.PLAYWRIGHT_TEST4_SITTER_EMAIL,
    });
  if (accessError) throw accessError;

  // Great Day today AND yesterday -> a known, deterministic "equal"
  // (steady/"unchanged") direction on every Wellbeing attribute, via the
  // same atomic RPC (migration 0034) markGreatDay uses — no need to
  // duplicate its observation-catalog logic here since a Great Day with
  // no observations at all already yields a symptom count of 0 both days.
  //
  // Dates MUST be computed in the same timezone SitterPetRow uses
  // (src/components/WellbeingChipGrid.jsx): the signed-in sitter's saved
  // profile.timezone, falling back to the browser's detected zone. test4@
  // has had America/New_York saved on dev since 2026-08-20, so using the
  // browser's zone alone (UTC in CI) seeded the wrong calendar day every
  // evening between 00:00 UTC and midnight Eastern, and the badges never
  // appeared (found during spec 0072, 2026-11-20; punch list PA-57). Read
  // the zone as test4@ itself, since profiles are readable only by their
  // own owner. Playwright's browser runs on this same host, so the
  // fallback matches what the page detects.
  const sitterClient = newClient();
  const { data: sitterAuth, error: sitterSignInError } = await sitterClient.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST4_SITTER_EMAIL,
    password: process.env.PLAYWRIGHT_TEST4_SITTER_PASSWORD,
  });
  if (sitterSignInError) throw sitterSignInError;
  // Link the invite inserted above to test4@'s account, the same call the
  // app makes on every sign-in (AuthContext.jsx). Sitter visibility checks
  // sitter_user_id (is_pet_sitter(), migration 0057), which only
  // claim_pending_sitter_invites() (0028) sets, so without this the query
  // below sees no sat pets. It only touches unlinked invites for the
  // caller's own email; the browser's sign-in later repeats it as a no-op.
  const { error: claimError } = await sitterClient.rpc('claim_pending_sitter_invites');
  if (claimError) throw claimError;
  const { data: sitterProfile } = await sitterClient
    .from('profiles')
    .select('timezone')
    .eq('id', sitterAuth.user.id)
    .maybeSingle();
  const [ownPetsR, coOwnedR] = await Promise.all([
    sitterClient.from('pets').select('id').eq('created_by', sitterAuth.user.id).limit(1),
    sitterClient.from('pet_co_owners').select('pet_id').eq('co_owner_user_id', sitterAuth.user.id).limit(1),
  ]);
  if (ownPetsR.error) throw ownPetsR.error;
  if (coOwnedR.error) throw coOwnedR.error;
  test4OwnsPets = (ownPetsR.data?.length || 0) + (coOwnedR.data?.length || 0) > 0;

  const { data: visibleSatPets, error: visibleSatPetsError } = await sitterClient
    .from('pets')
    .select('id')
    .in('id', [petWithCheckinId, petNoCheckinId]);
  if (visibleSatPetsError) throw visibleSatPetsError;
  satPetIdsVisibleToTest4 = (visibleSatPets || []).map((p) => p.id);

  const localTz = sitterProfile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStrInTz = (instant) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: localTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const todayStr = dateStrInTz(new Date());
  const yesterdayStr = dateStrInTz(new Date(Date.now() - 86400000));

  const greatDayPayload = (date) => ({
    pet_id: petWithCheckinId,
    check_in_date: date,
    status: 'great',
    symptom_count: 0,
    completed_at: new Date().toISOString(),
    source: 'app',
    observations: [],
  });

  const { error: checkinError } = await supabase.rpc('save_daily_check_ins', {
    payloads: [greatDayPayload(todayStr), greatDayPayload(yesterdayStr)],
  });
  if (checkinError) throw checkinError;
});

test.afterAll(async () => {
  const supabase = newClient();
  await signInAsTest1(supabase);
  // delete-pet (the same Edge Function the real Delete Pet flow uses, and
  // the same one add-pet.spec.js's cleanup calls) already strips the pet
  // out of any pet_sits.pet_ids array it's in, deleting the pet_sits row
  // entirely once it's empty — which cascades pet_sitter_access and the
  // seeded check-in/observations rows. No separate cleanup needed.
  for (const petId of [petWithCheckinId, petNoCheckinId]) {
    if (!petId) continue;
    await supabase.functions.invoke('delete-pet', { body: { pet_id: petId } });
  }
});

const WELLBEING_LABELS = ['Energy', 'Mobility', 'Breathing', 'Skin / Itching', 'Behavior'];

test1('a logged-in owner can reach the Pet Sitter page from Home', async ({ page }) => {
  // Deliberately uses the shared test1@ fixture from fixtures.js, not the
  // test4@-signed-in `test` defined above — this is normal single-identity
  // coverage, unrelated to the sitter-identity tests below.
  await page.goto('/');
  await dismissAnyOpenSheet(page);
  await page.getByRole('link', { name: /Pet Sitt/ }).first().click();

  await expect(page).toHaveURL('/pet-sitter');
  await expect(page.getByRole('heading', { name: 'Pet Sitter' })).toBeVisible();
});

test('a sitter sees 5 read-only Wellbeing badges on a shared pet row', async ({ page }) => {
  await page.goto('/pets');
  const row = page.locator('a').filter({ hasText: PET_WITH_CHECKIN_NAME });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByRole('group')).toHaveCount(5, { timeout: 15000 });
});

test('badges reflect the correct direction for a logged check-in', async ({ page }) => {
  await page.goto('/pets');
  const row = page.locator('a').filter({ hasText: PET_WITH_CHECKIN_NAME });
  for (const label of WELLBEING_LABELS) {
    await expect(row.getByRole('group', { name: `${label} unchanged versus yesterday` })).toBeVisible({ timeout: 15000 });
  }
});

test('a pet with no check-in yet shows the "no check-in yet" state, not a spinner or error', async ({ page }) => {
  await page.goto('/pets');
  const row = page.locator('a').filter({ hasText: PET_NO_CHECKIN_NAME });
  for (const label of WELLBEING_LABELS) {
    await expect(row.getByRole('group', { name: `${label}: No check-in yet` })).toBeVisible({ timeout: 15000 });
  }
});

test('tapping a badge only fires the row\'s existing navigation to Trends, nothing extra', async ({ page }) => {
  await page.goto('/pets');
  const row = page.locator('a').filter({ hasText: PET_WITH_CHECKIN_NAME });
  await expect(row.getByRole('group').first()).toBeVisible({ timeout: 15000 });

  // AttributeTrendChip only attaches a click handler when interactive=true
  // (SitterPetRow always passes false — see WellbeingChipGrid.jsx) — a
  // sitter's chip is a plain, non-interactive <div role="group">, so this
  // click has nothing to intercept it and simply bubbles up to the row's
  // own <Link>, same as clicking anywhere else on the row would.
  await row.getByRole('group').first().click();
  await expect(page).toHaveURL(new RegExp(`/pet/${petWithCheckinId}/trends`), { timeout: 15000 });
});

// Spec 0076 (PA-28): a sitter who types the address of an owner-only page
// for a pet they only sit for gets a notice, not the form or download.
test('a sitter opening Edit Pet or Vet Report for a sat pet sees the owners-only notice', async ({ page }) => {
  for (const suffix of ['edit', 'export']) {
    await page.goto(`/pet/${petWithCheckinId}/${suffix}`);
    await expect(page.getByText("Only this pet's owners can do this.")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Back' }).last()).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Download Report' })).toHaveCount(0);
});

// Spec 0079 (PA-61): Home and Ask Wysker's general chat list only pets the
// person owns or co-owns. test4@ only sits for the two pets seeded above.
const SAT_PET_NAMES = [PET_WITH_CHECKIN_NAME, PET_NO_CHECKIN_NAME];

// Precondition for the "absent" checks below: test4@ really can see both
// sat pets, in the database (beforeAll) and in the app (the Pets page).
async function expectSitterCanSeeSatPets(page) {
  expect(satPetIdsVisibleToTest4.sort()).toEqual([petWithCheckinId, petNoCheckinId].sort());
  await page.goto('/pets');
  for (const name of SAT_PET_NAMES) {
    await expect(page.locator('a').filter({ hasText: name })).toBeVisible({ timeout: 15000 });
  }
}

// The Pet Sitter card shows on Home both with and without pets of one's
// own once someone sits for others' pets, so it marks Home as loaded.
async function openHomeAsSitter(page) {
  await page.goto('/');
  await dismissAnyOpenSheet(page);
  await expect(page.getByRole('link', { name: /Pet Sitter/ })).toBeVisible({ timeout: 15000 });
}

test('AC1: a pet the sitter only sits for is not in Home\'s pet list', async ({ page }) => {
  await expectSitterCanSeeSatPets(page);
  await openHomeAsSitter(page);
  for (const name of SAT_PET_NAMES) {
    await expect(page.getByText(name)).toHaveCount(0);
  }
});

test('AC2: a sitter with no pets of their own sees the welcome screen and a Pet Sitter card', async ({ page }) => {
  test.skip(test4OwnsPets, 'test4@ owns or co-owns pets on dev; the welcome-screen card is covered by src/pages/Home.test.js');
  await openHomeAsSitter(page);
  await expect(page.getByRole('heading', { name: 'Welcome to Wysker Watch' })).toBeVisible();
  const card = page.getByRole('link', { name: /Pet Sitter/ });
  await expect(card).toContainText("See the pets you're sitting");
  await card.click();
  await expect(page).toHaveURL('/pet-sitter');
});

// Spec 0080: the server now builds the household pet list itself (owned
// and co-owned only, proven by supabase/tests/ai_tasks.test.ts), so the
// app-side check is that the general chat request carries no pet details
// at all: no pet names and no pet ids.
test('AC3: Ask Wysker\'s general chat does not tell the AI about a sat pet', async ({ page }) => {
  let capturedBody = null;
  let capturedRaw = null;
  await page.route('**/functions/v1/ask-vet-assistant', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, body: 'ok' });
    capturedRaw = route.request().postData();
    capturedBody = JSON.parse(capturedRaw);
    await route.fulfill({ json: { reply: 'E2E canned reply', urgent: false } });
  });

  await expectSitterCanSeeSatPets(page);
  await openHomeAsSitter(page);
  await page.getByRole('button', { name: 'Ask Wysker' }).click();
  await expect(page.getByRole('heading', { name: 'Ask Wysker' })).toBeVisible();
  await page.getByPlaceholder('Ask about any of your pets…').fill('What should I feed them?');
  await page.getByPlaceholder('Ask about any of your pets…').press('Enter');

  await expect.poll(() => capturedBody, { timeout: 15000 }).not.toBeNull();
  await expect(page.getByText('E2E canned reply')).toBeVisible();
  expect(capturedBody.task).toBe('household_chat');
  expect(capturedBody).not.toHaveProperty('pet_id');
  expect(capturedBody).not.toHaveProperty('pets');
  expect(capturedBody).not.toHaveProperty('prompt');
  for (const name of SAT_PET_NAMES) {
    expect(capturedRaw).not.toContain(name);
  }
  for (const id of [petWithCheckinId, petNoCheckinId]) {
    expect(capturedRaw).not.toContain(id);
  }
});

// Spec 0085: the owner's sit list (as test1@, who created the sit seeded in
// beforeAll). Cards are found by this run's unique pet name, since older
// runs may have left "E2E Sitter" sits behind on dev.
function sitCard(page, petName) {
  return page.locator('div.rounded-xl', { hasText: petName });
}

async function countTest1Sits() {
  const supabase = newClient();
  await signInAsTest1(supabase);
  const { data: userData } = await supabase.auth.getUser();
  const { count, error } = await supabase
    .from('pet_sits')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userData.user.id);
  if (error) throw error;
  return count;
}

test1('AC4: a start year of 2101 typed on the keyboard shows the date message and saves nothing', async ({ page }) => {
  const before = await countTest1Sits();

  await page.goto('/pet-sitter');
  await expect(sitCard(page, PET_WITH_CHECKIN_NAME)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'New Pet Sit' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('New Pet Sitting Period')).toBeVisible();

  const petPill = dialog.getByRole('button', { name: PET_NO_CHECKIN_NAME });
  if (await petPill.count()) await petPill.click();

  // focus() rather than click(): a click opens the calendar (openDatePicker).
  const [startInput, endInput] = await dialog.locator('input[type="date"]').all();
  await startInput.focus();
  await page.keyboard.type('01012101');
  await endInput.focus();
  await page.keyboard.type('01022026');
  await expect(startInput).toHaveValue('2101-01-01');
  await expect(endInput).toHaveValue('2026-01-02');

  await dialog.getByRole('button', { name: 'Create & Generate Checklist' }).click();
  await expect(dialog.getByText('Please enter a real date with a 4-digit year.')).toBeVisible();
  await expect(dialog).toBeVisible();

  expect(await countTest1Sits()).toBe(before);
});

test1('AC11: Share, Edit and Delete on a sit are each at least 44x44px', async ({ page }) => {
  await page.goto('/pet-sitter');
  const card = sitCard(page, PET_WITH_CHECKIN_NAME);
  await expect(card).toBeVisible({ timeout: 15000 });
  for (const name of ['Share with sitter', 'Edit sit', 'Delete sit']) {
    const box = await card.getByRole('button', { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box?.width, name).toBeGreaterThanOrEqual(44);
    expect(box?.height, name).toBeGreaterThanOrEqual(44);
  }
});

// AC2/AC3 regression on a valid sit. Uses its own sit (on the seeded pet
// without check-ins) so deleting it can't affect the sitter tests above.
test1('AC2/AC3: an owner can edit a sit\'s dates, see one checklist row per day, then delete it', async ({ page }) => {
  const supabase = newClient();
  await signInAsTest1(supabase);
  const { data: userData } = await supabase.auth.getUser();
  const sitterName = `E2E Edit Sit ${RUN_ID}`;
  const { data: sit, error } = await supabase
    .from('pet_sits')
    .insert({
      created_by: userData.user.id,
      pet_ids: [petNoCheckinId],
      sitter_name: sitterName,
      start_date: '2026-03-01',
      end_date: '2026-03-01',
    })
    .select('id')
    .single();
  if (error) throw error;

  try {
    await page.goto('/pet-sitter');
    const card = page.locator('div.rounded-xl', { hasText: sitterName });
    await expect(card).toBeVisible({ timeout: 15000 });

    await card.getByRole('button', { name: 'Edit sit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Pet Sitting Period')).toBeVisible();
    await dialog.locator('input[type="date"]').nth(1).fill('2026-03-03');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(card.getByText('Mar 1 – Mar 3, 2026')).toBeVisible({ timeout: 15000 });
    for (const day of ['Sunday, March 1', 'Monday, March 2', 'Tuesday, March 3']) {
      await expect(card.getByText(day, { exact: true })).toBeVisible({ timeout: 15000 });
    }
    await expect(card.getByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), /)).toHaveCount(3);

    await card.getByRole('button', { name: 'Delete sit', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('div.rounded-xl', { hasText: sitterName })).toHaveCount(0, { timeout: 15000 });
    const { data: rows } = await supabase.from('pet_sits').select('id').eq('id', sit.id);
    expect(rows ?? []).toHaveLength(0);
  } finally {
    await supabase.from('pet_sits').delete().eq('id', sit.id);
  }
});
