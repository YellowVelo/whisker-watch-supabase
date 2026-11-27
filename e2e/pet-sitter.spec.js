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

// One signed-in test1@ client per worker for this file's own setup, checks
// and cleanup (Supabase limits sign-ins per IP). A failed test restarts the
// worker, which simply signs in once more.
let test1ClientPromise = null;
function test1Client() {
  if (!test1ClientPromise) {
    test1ClientPromise = (async () => {
      const supabase = newClient();
      await signInAsTest1(supabase);
      const { data } = await supabase.auth.getUser();
      return { supabase, userId: data.user.id };
    })();
    test1ClientPromise.catch(() => { test1ClientPromise = null; });
  }
  return test1ClientPromise;
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
  const { supabase, userId: ownerId } = await test1Client();

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
  const { supabase } = await test1Client();
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
// beforeAll). Cards are found by this run's unique pet or sitter name, since
// older runs may have left "E2E Sitter" sits behind on dev.
function sitCard(page, text) {
  return page.locator('div.rounded-xl', { hasText: text });
}

async function test1SitIds() {
  const { supabase, userId } = await test1Client();
  const { data, error } = await supabase.from('pet_sits').select('id').eq('created_by', userId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.id));
}

async function newSitIdsSince(before) {
  return [...(await test1SitIds())].filter((id) => !before.has(id));
}

// Safety net: removes any sit test1@ gained during a test, so a refused save
// that ever slipped through (or a test that saves on purpose) leaves nothing
// behind. Errors are logged, not thrown, so they can't hide the real result.
async function deleteSitsCreatedSince(before) {
  try {
    const { supabase } = await test1Client();
    for (const id of await newSitIdsSince(before)) {
      const { error } = await supabase.from('pet_sits').delete().eq('id', id);
      if (error) console.warn(`cleanup: could not delete pet sit ${id}: ${error.message}`);
    }
  } catch (err) {
    console.warn(`cleanup: could not list test1@'s pet sits: ${err?.message ?? err}`);
  }
}

async function openNewSitDialog(page) {
  await page.goto('/pet-sitter');
  await expect(sitCard(page, PET_WITH_CHECKIN_NAME)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'New Pet Sit' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('New Pet Sitting Period')).toBeVisible();
  const petPill = dialog.getByRole('button', { name: PET_NO_CHECKIN_NAME });
  if (await petPill.count()) await petPill.click();
  const [startInput, endInput] = await dialog.locator('input[type="date"]').all();
  return { dialog, startInput, endInput };
}

// Keyboard entry below assumes Chromium's en-US date order (MM/DD/YYYY),
// which is Playwright's default locale for this suite.
test1('AC4: a start year of 2101 typed on the keyboard shows the date message and saves nothing', async ({ page }) => {
  const before = await test1SitIds();
  try {
    const { dialog, startInput, endInput } = await openNewSitDialog(page);

    // Spec 0088 AC1: a real click on the box puts the cursor there (it no
    // longer opens the calendar), so the date can be typed. Clicked on the
    // month (the left of the box): Chromium sends a click on the empty space
    // to the right of the date to the year part instead.
    await startInput.click({ position: { x: 20, y: 22 } });
    await page.keyboard.type('01012101');
    await endInput.click({ position: { x: 20, y: 22 } });
    await page.keyboard.type('11282026');
    await expect(startInput).toHaveValue('2101-01-01');
    await expect(endInput).toHaveValue('2026-11-28');

    await dialog.getByRole('button', { name: 'Create & Generate Checklist' }).click();
    await expect(dialog.getByText('Please enter a real date with a 4-digit year.')).toBeVisible();
    await expect(dialog).toBeVisible();

    expect(await newSitIdsSince(before)).toEqual([]);
  } finally {
    await deleteSitsCreatedSince(before);
  }
});

// Spec 0088 AC3/AC4/AC6 (the real calendar is drawn outside the page, so
// Lynn checks that it appears by hand): with showPicker() stubbed, clicking a
// date box never calls it, each calendar button calls it once for its own
// box, and a showPicker() that throws causes no page error and typing still
// works. Then spec 0085 AC5/AC6 through the real dialog, ending with a 30-day
// sit that saves with 31 checklist days.
test1('0088 AC3/AC4/AC6 + 0085 AC5/AC6: only the calendar button opens the calendar; reversed and 31-day sits are refused; 30 days saves with 31 rows', async ({ page }) => {
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__showPickerCalls = [];
    w.__showPickerThrows = false;
    HTMLInputElement.prototype.showPicker = function showPicker() {
      w.__showPickerCalls.push(this.id);
      if (w.__showPickerThrows) throw new DOMException('not allowed', 'NotAllowedError');
    };
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const pickerCalls = () => page.evaluate(() => /** @type {any} */ (window).__showPickerCalls);

  const before = await test1SitIds();
  const sitterName = `E2E 30 Day Sit ${RUN_ID}`;
  try {
    const { dialog, startInput, endInput } = await openNewSitDialog(page);
    await dialog.getByPlaceholder('e.g. Sarah').fill(sitterName);
    const startButton = dialog.getByRole('button', { name: 'Choose start date', exact: true });
    const endButton = dialog.getByRole('button', { name: 'Choose end date', exact: true });

    // AC4: clicking inside each box (left part and centre) opens nothing.
    await startInput.click({ position: { x: 20, y: 22 } });
    await startInput.click();
    await endInput.click({ position: { x: 20, y: 22 } });
    await endInput.click();
    expect(await pickerCalls()).toEqual([]);

    // AC3: each button opens the calendar for its own box, once.
    await startButton.click();
    await expect.poll(pickerCalls).toEqual(['sit-start-date']);
    await endButton.click();
    await expect.poll(pickerCalls).toEqual(['sit-start-date', 'sit-end-date']);

    // AC6: a calendar that can't open causes no error, and typing still works.
    await page.evaluate(() => { /** @type {any} */ (window).__showPickerThrows = true; });
    await endButton.click();
    await expect.poll(pickerCalls).toEqual(['sit-start-date', 'sit-end-date', 'sit-end-date']);
    await endInput.click({ position: { x: 20, y: 22 } });
    await page.keyboard.type('11282026');
    await expect(endInput).toHaveValue('2026-11-28');
    await page.evaluate(() => { /** @type {any} */ (window).__showPickerThrows = false; });
    expect(pageErrors).toEqual([]);
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    const save = dialog.getByRole('button', { name: 'Create & Generate Checklist' });

    // AC5: end before start.
    await startInput.fill('2026-03-10');
    await endInput.fill('2026-03-09');
    await save.click();
    await expect(dialog.getByText("The end date can't be before the start date.")).toBeVisible();
    // Changing a date clears the message.
    await endInput.fill('2026-03-10');
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    // AC6: 31 days after start is refused.
    await endInput.fill('2026-04-10');
    await save.click();
    await expect(dialog.getByText('A pet sit can be up to 30 days. For a longer trip, add a second sit.')).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(await newSitIdsSince(before)).toEqual([]);

    // AC6: exactly 30 days saves, with one checklist row per day (31).
    await endInput.fill('2026-04-09');
    await save.click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    const card = sitCard(page, sitterName);
    await expect(card.getByText('Mar 10 – Apr 9, 2026')).toBeVisible({ timeout: 15000 });
    await expect(card.getByText('Thursday, April 9', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(card.getByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), /)).toHaveCount(31);
    expect(await newSitIdsSince(before)).toHaveLength(1);
    expect(pageErrors).toEqual([]);
  } finally {
    await deleteSitsCreatedSince(before);
  }
});

// Spec 0088 AC2: a saved sit's wrong year is fixed by clicking the year and
// typing over it. Dev's 0063 rule stops a 6-digit year being planted, so the
// sit is seeded a year early and both years are retyped (changing only the
// end year would break the 30-day rule). Lynn's 272026 sit is checked on prod.
test1('0088 AC2: clicking the year in a saved sit\'s dates and typing a new one saves the new dates', async ({ page }) => {
  const { supabase, userId } = await test1Client();
  const sitterName = `E2E Retype Year Sit ${RUN_ID}`;
  const { data: sit, error } = await supabase
    .from('pet_sits')
    .insert({
      created_by: userId,
      pet_ids: [petNoCheckinId],
      sitter_name: sitterName,
      start_date: '2025-11-20',
      end_date: '2025-11-28',
    })
    .select('id')
    .single();
  if (error) throw error;

  try {
    await page.goto('/pet-sitter');
    const card = sitCard(page, sitterName);
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByRole('button', { name: 'Edit sit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Pet Sitting Period')).toBeVisible();
    const startInput = dialog.locator('#sit-start-date');
    const endInput = dialog.locator('#sit-end-date');
    await expect(endInput).toHaveValue('2025-11-28');

    // The year is the third part of MM/DD/YYYY; click on it, then type.
    for (const input of [startInput, endInput]) {
      // Measure this box's own displayed MM/DD/ prefix, from its value.
      const { yearX, y } = await input.evaluate((el) => {
        const [, mm, dd] = el.value.split('-');
        const style = getComputedStyle(el);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = style.font;
        const padLeft = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
        return {
          yearX: padLeft + ctx.measureText(`${mm}/${dd}/`).width + ctx.measureText('20').width,
          y: el.getBoundingClientRect().height / 2,
        };
      });
      await input.click({ position: { x: yearX, y } });
      await page.keyboard.type('2026');
    }
    await expect(startInput).toHaveValue('2026-11-20');
    await expect(endInput).toHaveValue('2026-11-28');

    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    await expect(card.getByText('Nov 20 – Nov 28, 2026')).toBeVisible({ timeout: 15000 });
    const { data: saved, error: readError } = await supabase
      .from('pet_sits').select('start_date, end_date').eq('id', sit.id).single();
    if (readError) throw readError;
    expect(saved).toEqual({ start_date: '2026-11-20', end_date: '2026-11-28' });
  } finally {
    const { error: cleanupError } = await supabase.from('pet_sits').delete().eq('id', sit.id);
    if (cleanupError) console.warn(`cleanup: could not delete pet sit ${sit.id}: ${cleanupError.message}`);
  }
});

// Spec 0088 AC5: each calendar button has a 44px tap area and its approved label.
test1('0088 AC5: the calendar buttons are at least 44x44px with the approved labels', async ({ page }) => {
  const { dialog } = await openNewSitDialog(page);
  for (const label of ['Choose start date', 'Choose end date']) {
    const button = dialog.getByRole('button', { name: label, exact: true });
    await expect(button).toHaveAttribute('aria-label', label);
    await expect(button).toHaveAttribute('type', 'button');
    const box = await button.boundingBox();
    expect(box, label).not.toBeNull();
    expect(box?.width, label).toBeGreaterThanOrEqual(44);
    expect(box?.height, label).toBeGreaterThanOrEqual(44);
  }
});

// Spec 0088 AC7: at phone width the two date boxes sit side by side with
// their buttons, nothing overlaps, and the full date text isn't clipped.
test1('0088 AC7: at 375px both date boxes and their calendar buttons fit without overlap or clipped dates', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { dialog, startInput, endInput } = await openNewSitDialog(page);
  // The widest dates (two-digit month and day).
  await startInput.fill('2026-12-28');
  await endInput.fill('2026-12-30');

  const startBox = await startInput.boundingBox();
  const endBox = await endInput.boundingBox();
  const startButton = await dialog.getByRole('button', { name: 'Choose start date', exact: true }).boundingBox();
  const endButton = await dialog.getByRole('button', { name: 'Choose end date', exact: true }).boundingBox();
  for (const [name, b] of [['start box', startBox], ['end box', endBox], ['start button', startButton], ['end button', endButton]]) {
    expect(b, name).not.toBeNull();
    expect(b.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${name} right edge`).toBeLessThanOrEqual(375 + 0.5);
  }
  // Side by side, on the same row.
  expect(Math.abs(startBox.y - endBox.y)).toBeLessThan(1);
  expect(overlaps(startBox, endBox), 'the two boxes overlap').toBe(false);
  expect(overlaps(startButton, endButton), 'the two buttons overlap').toBe(false);
  expect(overlaps(startButton, endBox), 'start button covers the end box').toBe(false);
  expect(overlaps(endButton, startBox), 'end button covers the start box').toBe(false);
  // Each button sits at the right end inside its own box.
  for (const [name, button, box] of [['start', startButton, startBox], ['end', endButton, endBox]]) {
    expect(button.x, `${name} button inside its box`).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(button.x + button.width, `${name} button inside its box`).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  // The full MM/DD/YYYY text fits in the box's content area, and the button
  // starts at or right of where the text ends. (A date input's scrollWidth
  // always equals its clientWidth in Chromium, so it can't show clipping.)
  for (const [name, input, button] of [['start', startInput, startButton], ['end', endInput, endButton]]) {
    const m = await input.evaluate((el) => {
      const [yyyy, mm, dd] = el.value.split('-');
      const style = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = style.font;
      const padLeft = parseFloat(style.paddingLeft);
      const padRight = parseFloat(style.paddingRight);
      const textWidth = ctx.measureText(`${mm}/${dd}/${yyyy}`).width;
      return {
        textWidth,
        contentWidth: el.clientWidth - padLeft - padRight,
        textEnd: el.getBoundingClientRect().left + el.clientLeft + padLeft + textWidth,
      };
    });
    expect(m.textWidth, `${name} date text cut off`).toBeLessThanOrEqual(m.contentWidth);
    expect(button.x, `${name} button covers the date text`).toBeGreaterThanOrEqual(m.textEnd - 0.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await testInfo.attach('sit-dates-375', { body: await dialog.screenshot(), contentType: 'image/png' });
});

// ---- Spec 0088 QA ----------------------------------------------------------

// What Chromium actually draws inside a date box. The month/day/year parts
// live in the browser's own (user-agent) shadow tree, which page scripts
// can't reach, so this reads it over the DevTools protocol (Chromium only).
// Returns the drawn text (e.g. "11/28/2026", or "mm/dd/yyyy" when empty),
// where that text starts and ends on screen, the input's content box (inside
// its padding, so the calendar button's pr-11 area is excluded), and the
// width of the browser's own calendar icon (0 when hidden).
async function dateBoxRendering(page, inputId) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const attrs = (n) => {
      const out = {};
      const a = n.attributes || [];
      for (let i = 0; i < a.length; i += 2) out[a[i]] = a[i + 1];
      return out;
    };
    const kids = (n) => [...(n.children || []), ...(n.shadowRoots || [])];
    const find = (n, pred) => {
      if (pred(n)) return n;
      for (const c of kids(n)) {
        const hit = find(c, pred);
        if (hit) return hit;
      }
      return null;
    };
    const texts = (n) => (n.nodeType === 3 ? [n.nodeValue] : kids(n).flatMap(texts));
    const xs = (q) => [q[0], q[2], q[4], q[6]];
    const box = async (n) => (await cdp.send('DOM.getBoxModel', { nodeId: n.nodeId })).model;

    const input = find(root, (n) => n.nodeName === 'INPUT' && attrs(n).id === inputId);
    if (!input) throw new Error(`no input #${inputId}`);
    const wrapper = find(input, (n) => attrs(n).pseudo === '-webkit-datetime-edit-fields-wrapper');
    if (!wrapper) throw new Error(`#${inputId} has no datetime fields (not Chromium?)`);
    const parts = (wrapper.children || []).filter((c) => c.nodeType === 1);
    const first = await box(parts[0]);
    const last = await box(parts[parts.length - 1]);
    const inputModel = await box(input);
    const indicator = find(input, (n) => attrs(n).pseudo === '-webkit-calendar-picker-indicator');
    let indicatorWidth = 0;
    if (indicator) {
      // A display:none node has no box, and DevTools says so with an error.
      indicatorWidth = await box(indicator).then((m) => m.width, () => 0);
    }
    return {
      text: texts(wrapper).join(''),
      textLeft: Math.min(...xs(first.border)),
      textRight: Math.max(...xs(last.border)),
      contentLeft: Math.min(...xs(inputModel.content)),
      contentRight: Math.max(...xs(inputModel.content)),
      borderLeft: Math.min(...xs(inputModel.border)),
      indicatorWidth,
    };
  } finally {
    await cdp.detach();
  }
}

// Clicks the month part (left of the box), as the 0085 AC4 test does.
const clickMonth = (input) => input.click({ position: { x: 20, y: 22 } });

// Spec 0088 AC1, on the drawn text rather than the stored value (reviewer
// item), plus FR3 keyboard-only use: Tab from the Sitter Name box goes
// through the start box's parts, then "Choose start date", then the end
// box, then "Choose end date"; Enter and Space on each button open that
// box's calendar (showPicker stubbed: the real one is drawn outside the
// page). Dates typed with the keyboard alone land in the right boxes.
test1('0088 QA: keyboard only: Tab reaches each box and calendar button in order, Enter/Space open the calendar, typed dates show as MM/DD/YYYY', async ({ page }) => {
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__showPickerCalls = [];
    HTMLInputElement.prototype.showPicker = function showPicker() {
      w.__showPickerCalls.push(this.id);
    };
  });
  const pickerCalls = () => page.evaluate(() => /** @type {any} */ (window).__showPickerCalls);
  const focused = () => page.evaluate(() => {
    const el = document.activeElement;
    return el?.id || el?.getAttribute('aria-label') || el?.tagName || '';
  });

  const { dialog, startInput, endInput } = await openNewSitDialog(page);
  // Empty boxes show the placeholder, and the browser's own icon is hidden (FR7).
  for (const id of ['sit-start-date', 'sit-end-date']) {
    const r = await dateBoxRendering(page, id);
    expect(r.text, `${id} empty`).toBe('mm/dd/yyyy');
    expect(r.indicatorWidth, `${id} browser calendar icon`).toBe(0);
  }

  await dialog.getByPlaceholder('e.g. Sarah').focus();
  const order = [];
  for (let i = 0; i < 12 && !order.includes('Choose end date'); i++) {
    await page.keyboard.press('Tab');
    order.push(await focused());
  }
  const seq = order.join(' > ');
  const at = (name) => order.indexOf(name);
  expect(at('sit-start-date'), seq).toBeGreaterThanOrEqual(0);
  expect(at('Choose start date'), seq).toBeGreaterThan(order.lastIndexOf('sit-start-date'));
  expect(at('sit-end-date'), seq).toBeGreaterThan(at('Choose start date'));
  expect(at('Choose end date'), seq).toBeGreaterThan(order.lastIndexOf('sit-end-date'));
  // Nothing opened the calendar just by tabbing through.
  expect(await pickerCalls()).toEqual([]);

  // Enter on the end button (focused now), Space on the start button.
  await page.keyboard.press('Enter');
  await expect.poll(pickerCalls).toEqual(['sit-end-date']);
  await dialog.getByRole('button', { name: 'Choose start date', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(pickerCalls).toEqual(['sit-end-date', 'sit-start-date']);
  // The buttons are type="button", so Enter/Space never submitted anything.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);

  // Keyboard-only typing: Shift+Tab from the start button back into the
  // start box (its year), back twice more to its month, then type.
  await page.keyboard.press('Shift+Tab');
  expect(await focused()).toBe('sit-start-date');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('11202026');
  await expect(startInput).toHaveValue('2026-11-20');
  // Tab: start box's year -> start button -> end box (month).
  await page.keyboard.press('Tab');
  expect(await focused()).toBe('Choose start date');
  await page.keyboard.press('Tab');
  expect(await focused()).toBe('sit-end-date');
  await page.keyboard.type('11282026');
  await expect(endInput).toHaveValue('2026-11-28');

  expect((await dateBoxRendering(page, 'sit-start-date')).text).toBe('11/20/2026');
  expect((await dateBoxRendering(page, 'sit-end-date')).text).toBe('11/28/2026');
  // Typing never opened the calendar either.
  expect(await pickerCalls()).toEqual(['sit-end-date', 'sit-start-date']);
});

// Spec 0088 AC1 in the Edit dialog (the case Lynn hit), plus FR6: after a
// bad year is typed through the new box, 0085's Save checks still fire and
// nothing is written; the message clears on the next keystroke; a fixed
// date then saves. Chromium lets a 6-digit year be typed, so this replays
// Lynn's 272026 mistake from the keyboard and checks Save refuses it.
test1('0088 QA: Edit dialog: typed dates show in the box; a 6-digit year can\'t be typed; 0001, 1999, 2101 and reversed dates are refused on Save; a failed save keeps the typed dates; the fix saves', async ({ page }) => {
  const { supabase, userId } = await test1Client();
  const sitterName = `E2E Typed Bad Year Sit ${RUN_ID}`;
  const { data: sit, error } = await supabase
    .from('pet_sits')
    .insert({
      created_by: userId,
      pet_ids: [petNoCheckinId],
      sitter_name: sitterName,
      start_date: '2026-03-01',
      end_date: '2026-03-03',
    })
    .select('id')
    .single();
  if (error) throw error;
  const stored = async () => {
    const { data, error: readError } = await supabase
      .from('pet_sits').select('start_date, end_date').eq('id', sit.id).single();
    if (readError) throw readError;
    return data;
  };

  try {
    await page.goto('/pet-sitter');
    const card = sitCard(page, sitterName);
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByRole('button', { name: 'Edit sit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Pet Sitting Period')).toBeVisible();
    const startInput = dialog.locator('#sit-start-date');
    const endInput = dialog.locator('#sit-end-date');
    const save = dialog.getByRole('button', { name: 'Save Changes' });
    const alert = dialog.getByRole('alert');
    expect((await dateBoxRendering(page, 'sit-end-date')).text).toBe('03/03/2026');

    // A whole date typed over a saved one, from the month.
    await clickMonth(startInput);
    await page.keyboard.type('11202026');
    await clickMonth(endInput);
    await page.keyboard.type('11282026');
    expect((await dateBoxRendering(page, 'sit-start-date')).text).toBe('11/20/2026');
    expect((await dateBoxRendering(page, 'sit-end-date')).text).toBe('11/28/2026');

    // Lynn's 6-digit end year, typed into the year part (month, Tab, Tab).
    // With 0085's max="2100-12-31" Chromium caps the year part at 4 digits,
    // so 272026 can't be typed any more: the box keeps a 4-digit year.
    await clickMonth(endInput);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('272026');
    expect((await dateBoxRendering(page, 'sit-end-date')).text).toMatch(/^11\/28\/\d{4}$/);
    await expect(endInput).toHaveValue(/^\d{4}-11-28$/);

    // Years outside 2000-2100 can still be typed, and Save refuses them
    // with 0085's message, writing nothing.
    for (const typed of ['11280001', '11281999', '11282101']) {
      await clickMonth(endInput);
      await page.keyboard.type(typed);
      await expect(endInput).toHaveValue(`${typed.slice(4)}-11-28`);
      // Typing cleared any message from the previous round.
      await expect(alert).toHaveCount(0);
      await save.click();
      await expect(alert, typed).toHaveText('Please enter a real date with a 4-digit year.');
      await expect(dialog).toBeVisible();
    }
    expect(await stored()).toEqual({ start_date: '2026-03-01', end_date: '2026-03-03' });

    // End before start.
    await clickMonth(endInput);
    await page.keyboard.type('11192026');
    await save.click();
    await expect(alert).toHaveText("The end date can't be before the start date.");
    expect(await stored()).toEqual({ start_date: '2026-03-01', end_date: '2026-03-03' });

    // Fixed by typing. A network failure on the first Save keeps the dialog
    // open with the typed dates still in the boxes; the retry saves.
    await clickMonth(endInput);
    await page.keyboard.type('11282026');
    await expect(endInput).toHaveValue('2026-11-28');
    const dropWrite = (route) => (route.request().method() === 'GET' ? route.continue() : route.abort('internetdisconnected'));
    await page.route('**/rest/v1/pet_sits?*', dropWrite);
    await save.click();
    await expect(page.getByText("Couldn't save this pet sit").first()).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('Edit Pet Sitting Period')).toBeVisible();
    await expect(startInput).toHaveValue('2026-11-20');
    await expect(endInput).toHaveValue('2026-11-28');
    expect(await stored()).toEqual({ start_date: '2026-03-01', end_date: '2026-03-03' });
    await page.unroute('**/rest/v1/pet_sits?*', dropWrite);
    await save.click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    await expect(card.getByText('Nov 20 – Nov 28, 2026')).toBeVisible({ timeout: 15000 });
    expect(await stored()).toEqual({ start_date: '2026-11-20', end_date: '2026-11-28' });
  } finally {
    const { error: cleanupError } = await supabase.from('pet_sits').delete().eq('id', sit.id);
    if (cleanupError) console.warn(`cleanup: could not delete pet sit ${sit.id}: ${cleanupError.message}`);
  }
});

// Spec 0088 AC2, Lynn's exact case. Dev's 0063 rule won't store a year of
// 272026, so the sit is saved with valid dates and only the page's read of
// it is altered in the browser to end 272026-11-28 (as prod's sit does).
// The owner clicks the year, types 2026 and saves; the real save goes to
// dev, which stores 2026-11-28.
test1('0088 QA AC2: a sit loaded with end year 272026 can be fixed by clicking the year and typing 2026', async ({ page }) => {
  const { supabase, userId } = await test1Client();
  const sitterName = `E2E Six Digit Year Sit ${RUN_ID}`;
  const { data: sit, error } = await supabase
    .from('pet_sits')
    .insert({
      created_by: userId,
      pet_ids: [petNoCheckinId],
      sitter_name: sitterName,
      start_date: '2026-11-20',
      end_date: '2026-11-28',
    })
    .select('id')
    .single();
  if (error) throw error;

  const alterRead = async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const rows = await response.json();
    if (Array.isArray(rows)) {
      for (const row of rows) if (row.id === sit.id) row.end_date = '272026-11-28';
    }
    return route.fulfill({ response, json: rows });
  };
  await page.route('**/rest/v1/pet_sits?*', alterRead);

  try {
    await page.goto('/pet-sitter');
    const card = sitCard(page, sitterName);
    await expect(card).toBeVisible({ timeout: 15000 });
    // 0085: an unusable saved date shows as "Dates not set", not a crash.
    await expect(card.getByText('Dates not set')).toBeVisible();
    await card.getByRole('button', { name: 'Edit sit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Pet Sitting Period')).toBeVisible();
    const endInput = dialog.locator('#sit-end-date');
    await expect(endInput).toHaveValue('272026-11-28');
    expect((await dateBoxRendering(page, 'sit-end-date')).text).toBe('11/28/272026');

    // Click inside the year part (measured from the box's own drawn parts).
    const drawn = await dateBoxRendering(page, 'sit-end-date');
    const endBox = await endInput.boundingBox();
    await endInput.click({ position: { x: drawn.textRight - endBox.x - 10, y: 22 } });
    await page.keyboard.type('2026');
    await expect(endInput).toHaveValue('2026-11-28');
    expect((await dateBoxRendering(page, 'sit-end-date')).text).toBe('11/28/2026');

    // From here the page reads dev as it really is.
    await page.unroute('**/rest/v1/pet_sits?*', alterRead);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    await expect(card.getByText('Nov 20 – Nov 28, 2026')).toBeVisible({ timeout: 15000 });
    const { data: saved, error: readError } = await supabase
      .from('pet_sits').select('start_date, end_date').eq('id', sit.id).single();
    if (readError) throw readError;
    expect(saved).toEqual({ start_date: '2026-11-20', end_date: '2026-11-28' });
  } finally {
    await page.unroute('**/rest/v1/pet_sits?*', alterRead).catch(() => {});
    const { error: cleanupError } = await supabase.from('pet_sits').delete().eq('id', sit.id);
    if (cleanupError) console.warn(`cleanup: could not delete pet sit ${sit.id}: ${cleanupError.message}`);
  }
});

// Spec 0088 AC7 on what Chromium really draws (reviewer item: the canvas
// estimate in the AC7 test above was only shown to work with scratch
// changes). At desktop and 375px, the drawn MM/DD/YYYY ends inside the
// input's content box and left of the calendar button, and the browser's
// own icon is hidden. Then a negative control: widening the boxes' right
// padding with test-only CSS really clips the date, and this check sees it.
test1('0088 QA: the drawn date isn\'t clipped or covered at desktop and 375px, and the check catches a clipped one', async ({ page }) => {
  const check = async (label) => {
    const out = [];
    for (const [id, name] of [['sit-start-date', 'Choose start date'], ['sit-end-date', 'Choose end date']]) {
      const r = await dateBoxRendering(page, id);
      const button = await page.getByRole('dialog').getByRole('button', { name, exact: true }).boundingBox();
      const input = await page.locator(`#${id}`).boundingBox();
      out.push({
        ...r,
        id,
        label,
        buttonX: button.x,
        inputX: input.x,
        fits: r.textRight <= r.contentRight + 0.5 && r.textRight <= button.x + 0.5,
      });
    }
    return out;
  };

  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const { startInput, endInput } = await openNewSitDialog(page);
    await startInput.fill('2026-12-28');
    await endInput.fill('2026-12-30');
    for (const r of await check(`${width}px`)) {
      const where = `${r.label} ${r.id}`;
      expect(r.text, where).toBe(r.id === 'sit-start-date' ? '12/28/2026' : '12/30/2026');
      expect(r.indicatorWidth, `${where} browser icon`).toBe(0);
      // DevTools and Playwright agree on where the box is.
      expect(Math.abs(r.borderLeft - r.inputX), `${where} coordinates`).toBeLessThan(1);
      expect(r.textLeft, `${where} text starts inside the box`).toBeGreaterThanOrEqual(r.contentLeft - 0.5);
      expect(r.fits, `${where}: text ends at ${r.textRight}, content ends at ${r.contentRight}, button at ${r.buttonX}`).toBe(true);
    }
  }

  // Negative control at 375px: leave too little room and the date is cut off.
  await page.addStyleTag({ content: '#sit-start-date, #sit-end-date { padding-right: 120px !important; }' });
  for (const r of await check('375px clipped')) {
    expect(r.fits, `${r.id} clipped date not detected (ends ${r.textRight}, content ends ${r.contentRight})`).toBe(false);
  }
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

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Reviewer item: at phone width (375px) a sit with a long sitter name and
// long pet names keeps its three 44px buttons on screen, inside the card,
// not on top of the header text, with no sideways scrolling. Also checks the
// Custom Daily Tasks chips' 44px "x" buttons never cover a neighbouring chip.
test1('phone width: sit card header buttons and task-chip "x" buttons fit at 375px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { supabase, userId } = await test1Client();
  const before = await test1SitIds();
  const sitterName = `E2E Sitter With A Really Quite Long Name ${RUN_ID}`;
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('pet_sits').insert({
    created_by: userId,
    pet_ids: [petWithCheckinId, petNoCheckinId],
    sitter_name: sitterName,
    start_date: today,
    end_date: today,
  });
  if (error) throw error;

  try {
    await page.goto('/pet-sitter');
    const card = sitCard(page, sitterName);
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    const header = await card.locator('p', { hasText: /Dates not set| – / }).first().boundingBox();
    const boxes = [];
    for (const name of ['Share with sitter', 'Edit sit', 'Delete sit']) {
      const box = await card.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.x, `${name} left edge`).toBeGreaterThanOrEqual(cardBox.x - 0.5);
      expect(box.x + box.width, `${name} right edge`).toBeLessThanOrEqual(Math.min(375, cardBox.x + cardBox.width) + 0.5);
      expect(overlaps(box, header), `${name} covers the date header`).toBe(false);
      boxes.push(box);
    }
    expect(overlaps(boxes[0], boxes[1]) || overlaps(boxes[1], boxes[2])).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await testInfo.attach('sit-card-375', { body: await card.screenshot(), contentType: 'image/png' });

    // Task chips in the New Pet Sit dialog, enough to wrap onto 2+ rows.
    await page.getByRole('button', { name: 'New Pet Sit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New Pet Sitting Period')).toBeVisible();
    const taskInput = dialog.getByPlaceholder('e.g. Change water, Clean litter...');
    for (const t of ['Water', 'Clean litter', 'Brush', 'Give the evening pill', 'Play', 'Lights']) {
      await taskInput.fill(t);
      await taskInput.press('Enter');
    }
    const removeButtons = dialog.getByRole('button', { name: /^Remove / });
    await expect(removeButtons).toHaveCount(6);
    const chips = await removeButtons.evaluateAll((btns) => btns.map((b) => {
      const chip = /** @type {HTMLElement} */ (b.parentElement).getBoundingClientRect();
      const btn = b.getBoundingClientRect();
      return {
        chip: { x: chip.x, y: chip.y, width: chip.width, height: chip.height },
        btn: { x: btn.x, y: btn.y, width: btn.width, height: btn.height },
      };
    }));
    const buttonOverlaps = [];
    for (let i = 0; i < chips.length; i++) {
      expect(chips[i].btn.width, `chip ${i} x width`).toBeGreaterThanOrEqual(44);
      expect(chips[i].btn.height, `chip ${i} x height`).toBeGreaterThanOrEqual(44);
      for (let j = 0; j < chips.length; j++) {
        if (i === j) continue;
        expect(overlaps(chips[i].btn, chips[j].chip), `chip ${i}'s x covers chip ${j}`).toBe(false);
        if (j > i && overlaps(chips[i].btn, chips[j].btn)) buttonOverlaps.push([i, j]);
      }
    }
    await testInfo.attach('task-chips-375', {
      body: JSON.stringify({ chips, buttonOverlaps }, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('task-chips-375-shot', { body: await dialog.screenshot(), contentType: 'image/png' });
  } finally {
    await deleteSitsCreatedSince(before);
  }
});

// AC2/AC3 regression on a valid sit. Uses its own sit (on the seeded pet
// without check-ins) so deleting it can't affect the sitter tests above.
test1('AC2/AC3: an owner can edit a sit\'s dates, see one checklist row per day, then delete it', async ({ page }) => {
  const { supabase, userId } = await test1Client();
  const sitterName = `E2E Edit Sit ${RUN_ID}`;
  const { data: sit, error } = await supabase
    .from('pet_sits')
    .insert({
      created_by: userId,
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
    const { error: cleanupError } = await supabase.from('pet_sits').delete().eq('id', sit.id);
    if (cleanupError) console.warn(`cleanup: could not delete pet sit ${sit.id}: ${cleanupError.message}`);
  }
});

// Spec 0087 AC1/AC2/AC4: a food and a medication that are switched on but
// ended yesterday drop off the sit card and move to "Past medications" on
// the Medications tab; current ones stay. Seeded on the beforeAll pet without
// check-ins (its own sit, found by a unique sitter name). "Yesterday" is on
// test1@'s saved calendar (profiles.timezone, else the browser's zone), the same zone
// the app's todayForUser() reads.
test1('spec 0087 AC1/AC2/AC4: the sit card lists only current foods and meds; an ended med is under Past medications', async ({ page }) => {
  const { supabase, userId } = await test1Client();
  const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  // Same order as the app's todayForUser(): saved zone, else the browser's
  // (spec 0087 QA: test1@ has America/New_York saved on dev as of
  // 2026-11-27, but don't rely on it).
  const tz = profile?.timezone
    || await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    || 'UTC';
  const dateStrInTz = (instant) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const todayStr = dateStrInTz(new Date());
  const yesterdayStr = dateStrInTz(new Date(Date.now() - 86400000));

  const currentFood = `E2E Current Food ${RUN_ID}`;
  const endedFood = `E2E Ended Food ${RUN_ID}`;
  const currentMed = `E2E Current Med ${RUN_ID}`;
  const endedMed = `E2E Ended Med ${RUN_ID}`;
  const sitterName = `E2E Current Items Sit ${RUN_ID}`;
  let foodIds = [];
  let medIds = [];
  let sitId = null;

  try {
    const { data: foods, error: foodsError } = await supabase
      .from('pet_foods')
      .insert([
        { pet_id: petNoCheckinId, name: currentFood, active: true, start_date: yesterdayStr, end_date: null },
        { pet_id: petNoCheckinId, name: endedFood, active: true, start_date: yesterdayStr, end_date: yesterdayStr },
      ])
      .select('id');
    if (foodsError) throw foodsError;
    foodIds = foods.map((r) => r.id);

    const { data: meds, error: medsError } = await supabase
      .from('medications')
      .insert([
        { pet_id: petNoCheckinId, name: currentMed, active: true, start_date: yesterdayStr, end_date: null },
        { pet_id: petNoCheckinId, name: endedMed, active: true, start_date: yesterdayStr, end_date: yesterdayStr },
      ])
      .select('id');
    if (medsError) throw medsError;
    medIds = meds.map((r) => r.id);

    const { data: sit, error: sitError } = await supabase
      .from('pet_sits')
      .insert({
        created_by: userId,
        pet_ids: [petNoCheckinId],
        sitter_name: sitterName,
        start_date: todayStr,
        end_date: todayStr,
      })
      .select('id')
      .single();
    if (sitError) throw sitError;
    sitId = sit.id;

    // AC1/AC2: the sit card.
    await page.goto('/pet-sitter');
    const card = page.locator('div.rounded-xl', { hasText: sitterName });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByText(sitterName).click();
    await expect(card.getByText('Sitter Instructions')).toBeVisible({ timeout: 15000 });
    await expect(card.getByText(currentFood)).toBeVisible();
    await expect(card.getByText(currentMed)).toBeVisible();
    await expect(card.getByText(endedFood)).toHaveCount(0);
    await expect(card.getByText(endedMed)).toHaveCount(0);

    // AC4: the Medications tab.
    await page.goto(`/pet/${petNoCheckinId}/medications`);
    await dismissAnyOpenSheet(page);
    await expect(page.getByText('Active Medications (1)')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(currentMed)).toBeVisible();
    await expect(page.getByText(endedMed)).toHaveCount(0);
    const pastToggle = page.getByRole('button', { name: /Past medications \(1\)/ });
    await expect(pastToggle).toBeVisible();
    await pastToggle.click();
    await expect(page.getByText(endedMed)).toBeVisible();
  } finally {
    if (sitId) {
      const { error } = await supabase.from('pet_sits').delete().eq('id', sitId);
      if (error) console.warn(`cleanup: could not delete pet sit ${sitId}: ${error.message}`);
    }
    if (medIds.length) {
      const { error } = await supabase.from('medications').delete().in('id', medIds);
      if (error) console.warn(`cleanup: could not delete medications: ${error.message}`);
    }
    if (foodIds.length) {
      const { error } = await supabase.from('pet_foods').delete().in('id', foodIds);
      if (error) console.warn(`cleanup: could not delete foods: ${error.message}`);
    }
  }
});
