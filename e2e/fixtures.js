// Deliberately thin — the one shared thing every "already logged in"
// test needs (the saved test1@ session from global-setup.js). Anything
// specific to one flow belongs in that flow's own spec file, not here.
import { test as base } from '@playwright/test';
import { AUTH_FILE } from './global-setup.js';

export const test = base.extend({
  storageState: async ({}, use) => {
    await use(AUTH_FILE);
  },
});

export { expect } from '@playwright/test';

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
