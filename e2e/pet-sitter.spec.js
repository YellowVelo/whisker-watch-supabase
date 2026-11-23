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

// The Pet Sitter card shows on Home both with and without pets of one's
// own once someone sits for others' pets, so it marks Home as loaded.
async function openHomeAsSitter(page) {
  await page.goto('/');
  await dismissAnyOpenSheet(page);
  await expect(page.getByRole('link', { name: /Pet Sitter/ })).toBeVisible({ timeout: 15000 });
}

test('AC1: a pet the sitter only sits for is not in Home\'s pet list', async ({ page }) => {
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

test('AC3: Ask Wysker\'s general chat does not tell the AI about a sat pet', async ({ page }) => {
  let capturedPrompt = null;
  await page.route('**/functions/v1/ask-vet-assistant', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, body: 'ok' });
    capturedPrompt = JSON.parse(route.request().postData()).prompt;
    await route.fulfill({ json: { reply: 'E2E canned reply', urgent: false } });
  });

  await openHomeAsSitter(page);
  await page.getByRole('button', { name: 'Ask Wysker' }).click();
  await expect(page.getByRole('heading', { name: 'Ask Wysker' })).toBeVisible();
  await page.getByPlaceholder('Ask about any of your pets…').fill('What should I feed them?');
  await page.getByPlaceholder('Ask about any of your pets…').press('Enter');

  await expect.poll(() => capturedPrompt, { timeout: 15000 }).not.toBeNull();
  await expect(page.getByText('E2E canned reply')).toBeVisible();
  for (const name of SAT_PET_NAMES) {
    expect(capturedPrompt).not.toContain(name);
  }
});
