// Spec 0029 (Onboarding Refresh) — the full 6-step wizard, not just pet
// creation (see add-pet.spec.js for that). Covers: species-filtered
// Health Conditions skipping correctly for a "generally healthy" pet,
// skipping Medications/Vaccinations, the Review screen summarizing what
// was entered, the Review -> edit -> Back -> Review round trip (this
// exact path had a real bug: Back disappeared when a Review edit-link
// jumped to a step outside the pet's normal conditional path — fixed by
// falling back to Review when the current step isn't in getVisibleSteps),
// and Finish landing on the Completion screen and then Home.
import { test, expect, waitForOnboardingStep } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const PET_NAME = `E2E Onboarding Pet ${Date.now()}`;

test.afterEach(async () => {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (signInError) return;

  const { data: pets } = await supabase.from('pets').select('id').eq('name', PET_NAME);
  for (const pet of pets ?? []) {
    await supabase.functions.invoke('delete-pet', { body: { pet_id: pet.id } });
  }
});

test('a healthy pet with no meds/vaccinations can complete onboarding, edit from Review, and land on Home', async ({ page }) => {
  await page.goto('/pet/new/onboarding');

  // Step 1: Pet Information
  await page.getByRole('button', { name: /Cat/ }).click();
  await page.locator('#pet-name').fill(PET_NAME);
  await page.locator('#sex-Female').click();
  await page.locator('#altered-Yes').click();
  await page.getByRole('button', { name: "I don't know" }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: Health Conditions — "generally healthy" skips the Conditions
  // card entirely and goes straight into the baseline questions.
  await waitForOnboardingStep(page, 'Step 2 of 6');
  await page.getByRole('radio', { name: `${PET_NAME} is generally healthy` }).click();

  // Medications yes/no -> "No" skips Medication Entry
  await page.getByRole('radio', { name: 'No' }).click();

  // Transition screen
  await page.getByRole('button', { name: 'Continue' }).click();

  // Five baseline questions — first option each time is enough to advance.
  for (let i = 0; i < 5; i++) {
    await page.getByRole('radio').first().click();
  }

  // Step 4: Vaccinations — skip
  await waitForOnboardingStep(page, 'Step 4 of 6');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 5: Review
  await waitForOnboardingStep(page, 'Step 5 of 6');
  await expect(page.getByText('No known health conditions selected.')).toBeVisible();
  await expect(page.getByText('No medications have been added yet.')).toBeVisible();
  await expect(page.getByText('No vaccinations have been added yet.')).toBeVisible();

  // Regression check: edit Health Conditions from Review (a step outside
  // this pet's normal path, since it answered "generally healthy") then
  // use Back — must return to Review, not strand the owner with no way back.
  // Health Conditions is the first Review section with an Edit link (Pet
  // Information has none), so .first() targets it unambiguously.
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByRole('heading', { name: `Which conditions has ${PET_NAME} been diagnosed with?` })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await waitForOnboardingStep(page, 'Step 5 of 6');
  await expect(page.getByRole('heading', { name: 'Review your information' })).toBeVisible();

  // Finish -> Completion screen -> Home
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL('/');
});

// Spec 0045: OnboardingShell.jsx was modeled directly on CatchUpFlow.jsx's
// overlay pattern and inherited its missing role="dialog"/focus-trap gap.
// Checked here on the "new pet" entry screen specifically because it's the
// one OnboardingShell render that exists before any pet or onboarding row
// is created (PetOnboarding.jsx renders it directly for petId === 'new'),
// so pressing Escape and navigating away needs no cleanup afterward.
test('the onboarding shell is a focus-trapped modal dialog', async ({ page }) => {
  await page.goto('/pet/new/onboarding');

  const dialog = page.getByRole('dialog', { name: 'Pet Information' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Focus lands on the shell's own first focusable element (Cancel) on
  // open, matching CatchUpFlow's identical behavior.
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();

  // Escape closes it, same as clicking Cancel (onClose navigates to /pets).
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/pets');
});
