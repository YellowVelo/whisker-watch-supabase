// Spec 0036: Edit Pet and Conditions split off the old shared EditPetSheet
// into two routed pages. Covers the spec's Test Plan directly — each test
// below maps to one Acceptance Criterion.
import { test, expect, waitForOnboardingStep } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const DOG_NAME = `E2E EditPet Dog ${Date.now()}`;
const CAT_NAME = `E2E EditPet Cat ${Date.now()}`;

async function deletePetsByName(names) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (signInError) return;
  for (const name of names) {
    const { data: pets } = await supabase.from('pets').select('id').eq('name', name);
    for (const pet of pets ?? []) {
      await supabase.functions.invoke('delete-pet', { body: { pet_id: pet.id } });
    }
  }
}

test.afterEach(async () => {
  await deletePetsByName([DOG_NAME, CAT_NAME]);
});

// Creates a pet via the real onboarding flow (same path add-pet.spec.js
// uses), skips the rest of onboarding, and returns to Pets with the pet's
// card expanded so callers can immediately reach its action pills/cards.
async function createPetAndExpand(page, { species, name }) {
  await page.goto('/pets');
  await page.getByRole('button', { name: 'Add Pet' }).click();
  await expect(page).toHaveURL(/\/pet\/new\/onboarding/);
  await page.getByRole('button', { name: new RegExp(species) }).click();
  await page.locator('#pet-name').fill(name);
  await page.locator(`#sex-Female`).click();
  await page.locator('#altered-Yes').click();
  await page.getByRole('button', { name: "I don't know" }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForOnboardingStep(page, 'Step 2 of 6');
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page.getByRole('heading', { name })).toBeVisible();
  await petCard(page, name).getByRole('button', { name: 'Show more' }).click();
}

// The pet's whole expandable card (ExpandablePetProfileCard's rounded-2xl
// wrapper) — the nearest ancestor that contains both the identity heading
// and the action pills / Show more toggle rendered below it.
function petCard(page, name) {
  return page.getByRole('heading', { name }).locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
}

test('Edit Pet opens a dedicated page with no Conditions picker', async ({ page }) => {
  await createPetAndExpand(page, { species: 'Dog', name: DOG_NAME });

  await petCard(page, DOG_NAME).getByRole('button', { name: 'Edit Pet' }).click();
  await expect(page).toHaveURL(/\/pet\/[\w-]+\/edit$/);
  await expect(page.getByRole('heading', { name: 'Edit Pet' })).toBeVisible();
  await expect(page.getByPlaceholder('Search conditions...')).toHaveCount(0);
});

test('Conditions opens a separate dedicated page with category headings and search', async ({ page }) => {
  await createPetAndExpand(page, { species: 'Dog', name: DOG_NAME });

  await petCard(page, DOG_NAME).getByRole('link', { name: 'Conditions' }).click();
  await expect(page).toHaveURL(/\/pet\/[\w-]+\/conditions$/);
  await expect(page.getByRole('heading', { name: 'Conditions' })).toBeVisible();
  await expect(page.getByPlaceholder('Search conditions...')).toBeVisible();
  await expect(page.getByText('Digestive', { exact: false })).toBeVisible();
});

test('selecting a condition and saving updates only conditions, not other pet fields', async ({ page }) => {
  await createPetAndExpand(page, { species: 'Dog', name: DOG_NAME });

  await petCard(page, DOG_NAME).getByRole('link', { name: 'Conditions' }).click();
  await expect(page).toHaveURL(/\/conditions$/);
  await page.getByRole('button', { name: 'Arthritis', exact: true }).click();
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page).toHaveURL(/\/pets$/);
  // The condition chip renders in the identity block even collapsed —
  // confirming the save landed without needing to re-expand the card.
  await expect(page.getByRole('heading', { name: DOG_NAME })).toBeVisible();
  await expect(petCard(page, DOG_NAME).getByText('Arthritis')).toBeVisible();

  await petCard(page, DOG_NAME).getByRole('button', { name: 'Show more' }).click();
  await expect(petCard(page, DOG_NAME).getByRole('link', { name: 'Conditions' })).toContainText('1');
  // Name/breed in the identity block are untouched by the conditions save.
  await expect(page.getByRole('heading', { name: DOG_NAME })).toBeVisible();
});

test('Edit Pet makes previously creation-only fields editable and they persist', async ({ page }) => {
  await createPetAndExpand(page, { species: 'Dog', name: DOG_NAME });

  await petCard(page, DOG_NAME).getByRole('button', { name: 'Edit Pet' }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await page.locator('#microchip').fill('985141000099999');
  await page.locator('#sex-Male').click();
  await page.locator('#altered-No').click();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page).toHaveURL(/\/pets$/);

  // Reopen and confirm the values round-tripped through a real save.
  await petCard(page, DOG_NAME).getByRole('button', { name: 'Show more' }).click();
  await petCard(page, DOG_NAME).getByRole('button', { name: 'Edit Pet' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.locator('#microchip')).toHaveValue('985141000099999');
  await expect(page.locator('#sex-Male')).toHaveAttribute('data-state', 'checked');
  await expect(page.locator('#altered-No')).toHaveAttribute('data-state', 'checked');
});

test('AKC registration section is dog-only', async ({ page }) => {
  await createPetAndExpand(page, { species: 'Dog', name: DOG_NAME });
  await petCard(page, DOG_NAME).getByRole('button', { name: 'Edit Pet' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByText('Registered with AKC?')).toBeVisible();

  await createPetAndExpand(page, { species: 'Cat', name: CAT_NAME });
  await petCard(page, CAT_NAME).getByRole('button', { name: 'Edit Pet' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByText('Registered with AKC?')).toHaveCount(0);
});

test('the legacy free-text Medications field is gone from Edit Pet', async ({ page }) => {
  await createPetAndExpand(page, { species: 'Dog', name: DOG_NAME });
  await petCard(page, DOG_NAME).getByRole('button', { name: 'Edit Pet' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel('Medications', { exact: true })).toHaveCount(0);
});

test('Back without saving discards changes on Edit Pet', async ({ page }) => {
  await createPetAndExpand(page, { species: 'Dog', name: DOG_NAME });
  await petCard(page, DOG_NAME).getByRole('button', { name: 'Edit Pet' }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await page.locator('#pet-name').fill('Should Not Persist');
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page).toHaveURL(/\/pets$/);
  await expect(page.getByRole('heading', { name: DOG_NAME })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Should Not Persist' })).toHaveCount(0);
});
