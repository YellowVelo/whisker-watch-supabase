// Deliberately thin — the one shared thing every "already logged in"
// test needs (the saved test1@ session from global-setup.js). Anything
// specific to one flow belongs in that flow's own spec file, not here.
import { test as base, expect } from '@playwright/test';
import { AUTH_FILE } from './global-setup.js';

export const test = base.extend({
  storageState: async ({}, use) => {
    await use(AUTH_FILE);
  },
});

export { expect } from '@playwright/test';

// Spec 0046: the pet-creation -> wizard transition (and every step
// transition after it) writes to the real wysker-watch-dev backend before
// the next step's heading renders — "Step 2 of 6" specifically follows
// Pet.create -> navigate -> Pet.get -> getOrCreatePetOnboarding (see
// src/pages/PetOnboarding.jsx), 3-4 sequential real round-trips, not one.
// Playwright's 5s default expect timeout assumes something closer to a
// single round-trip and intermittently timed out here in full-suite runs
// even though the page loaded correctly, just a little slower than usual.
// Centralized here (rather than each spec file setting its own timeout)
// so add-pet.spec.js, onboarding.spec.js, and pet-edit-conditions.spec.js
// all get the same fix instead of three separate copies to keep in sync.
export async function waitForOnboardingStep(page, stepText) {
  await expect(page.getByText(stepText)).toBeVisible({ timeout: 15000 });
}

// Home auto-launches a check-in or multi-day Catch-Up sheet the moment
// it loads if test1@'s real pets have anything pending for today — a
// fact of the live fixture account's data drifting day to day, not
// something any one test controls. Tests that need Home for something
// else (e.g. reaching the Pet Sitter link) call this first so that
// sheet doesn't block their own clicks.
export async function dismissAnyOpenSheet(page) {
  // Home's auto-launch fires from a useEffect once its own several
  // parallel fetches (pets, check-ins, wellbeing, weight, medication
  // counts) resolve — against the real wysker-watch-dev backend that
  // can take a couple of seconds, well past initial paint.
  await page.waitForLoadState('networkidle').catch(() => {});

  const dialog = page.getByRole('dialog').first();
  for (let i = 0; i < 3; i++) {
    const appeared = await dialog
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) break;
    // BottomSheet.jsx has no exit animation — onClose unmounts it
    // synchronously — so 'detached' resolves immediately once clicked.
    await page.getByRole('button', { name: 'Close' }).first().click();
    await dialog.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  }
}

// Spec 0083: signed-in users can't delete a `pets` row directly (migration
// 0062), so test cleanups delete a throwaway pet the way the app does. The
// primary owner first removes the pet's co-owner rows (allowed by 0056), so
// delete-pet sees a pet with no co-owners and deletes it for good (scenario
// S3) instead of handing it to a co-owner. `client` must be the primary
// owner's own signed-in client. Best-effort: a failed cleanup is logged,
// never thrown, so it can't hide the test's own result.
export async function deleteTestPet(client, petId) {
  if (!petId) return;
  try {
    const { error: coOwnerError } = await client.from('pet_co_owners').delete().eq('pet_id', petId);
    if (coOwnerError) console.warn(`cleanup: could not remove co-owners of pet ${petId}: ${coOwnerError.message}`);
    const { data, error } = await client.functions.invoke('delete-pet', { body: { pet_id: petId } });
    if (error) console.warn(`cleanup: delete-pet failed for pet ${petId}: ${error.message}`);
    else if (data?.mode !== 'deleted') {
      console.warn(`cleanup: delete-pet did not delete pet ${petId} (mode: ${data?.mode ?? 'none'}); it may have been handed to a co-owner`);
    }
  } catch (err) {
    console.warn(`cleanup: could not delete pet ${petId}: ${err?.message ?? err}`);
  }
}
