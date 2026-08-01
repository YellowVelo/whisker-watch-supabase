// Home auto-launches whatever's most pending for test1@'s real pets —
// depending on how many real days have passed since this fixture
// account was last seeded, that may be the multi-day Catch-Up flow
// rather than a plain check-in (a fact about the live account, not
// something this test controls). dismissAnyOpenSheet() closes whatever
// auto-opened so this test can drive its own, specific trigger: the
// "Start ...'s Daily Check-In" prompt nested under a pet's card, which
// only appears for a pet with no check-in recorded yet today.
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const today = new Date().toISOString().slice(0, 10);
let checkInPetId;

test.afterEach(async () => {
  if (!checkInPetId) return;
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (signInError) return;
  // The app has no UI to undo a saved check-in (confirmed while writing
  // this test — the only "reopen regardless of status" trigger left in
  // PetProfileContent.jsx is unreachable dead code now that the
  // standalone /pet/:petId page just redirects, see PetProfile.jsx).
  // Deleting the row here restores this pet's pre-test "not yet
  // checked in today" state, so re-running this suite the same day
  // doesn't permanently exhaust every real pet's pending slot.
  await supabase.from('daily_check_ins').delete().eq('pet_id', checkInPetId).eq('check_in_date', today);
  checkInPetId = undefined;
});

test('a logged-in owner can complete a same-day check-in and see it reflected', async ({ page }) => {
  await page.goto('/');
  await dismissAnyOpenSheet(page);

  const startButton = page.getByRole('button', { name: /Start .+'s Daily Check-In/ }).first();
  const petName = (await startButton.textContent()).match(/Start (.+)'s Daily Check-In/)[1];
  const petLink = page.getByRole('link', { name: `${petName}. View profile.` });
  const href = await petLink.getAttribute('href');
  checkInPetId = href.match(/\/pet\/([^/]+)\//)[1];

  await startButton.click();

  const greatDayButton = page.getByRole('button', { name: 'Great Day' });
  await expect(greatDayButton).toBeVisible();
  await greatDayButton.click();

  // Spec 0026 replaced this row's old per-Vibe "{name} had a Great Day"
  // text with a reachable edit path: once checked in, the row becomes a
  // button that reopens today's check-in instead of navigating to Trends,
  // labeled "Edit {name}'s Daily Check-In" regardless of which Vibe was
  // picked. Scoped to this specific pet — other pets from previous runs
  // of this same-day test may already show the identical label.
  await expect(page.getByRole('button', { name: `Edit ${petName}'s Daily Check-In` })).toBeVisible();
});
