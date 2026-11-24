// Spec 0080 (Lynn's planning answer, Open Question 4): when the 100-a-day
// AI cap is hit, the new-pet setup scan buttons (Medication Entry and
// Vaccination Entry, src/components/onboarding/) show wording A instead of
// "Couldn't read that ...", and manual entry stays available. Any other AI
// failure keeps the old "Couldn't read that ..." message.
//
// The AI call is stubbed with page.route (same pattern as
// ask-wysker-guardrails.spec.js), so this never reaches Anthropic and never
// touches the real daily cap. The scan file itself is really uploaded to
// dev's private bucket and is deleted again by usePendingScan's discard()
// when the scan fails. Also checks the request names a task and carries no
// prompt (spec 0080 FR1/FR3).
//
// One onboarding pet is created (by the wizard) and deleted in afterAll;
// the cleanup signs in once for the file (CLAUDE.md sign-in rule).
import path from 'path';
import { test, expect, waitForOnboardingStep } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const PET_NAME = `E2E Onboarding Scan Limit Pet ${Date.now()}`;
const ASK_VET_ASSISTANT = '**/functions/v1/ask-vet-assistant';
const SCAN_FIXTURE = path.join(process.cwd(), 'e2e/fixtures/test-scan.png');
const DAILY_LIMIT_MESSAGE = "You've reached today's limit for Ask Wysker and document scans. You can try again tomorrow.";

test.afterAll(async () => {
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

test('onboarding scans show wording A on a daily_limit 429, and the old message on other failures', async ({ page }) => {
  const bodies = [];
  let reply = { status: 429, json: { error: DAILY_LIMIT_MESSAGE, code: 'daily_limit' } };
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    bodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill(reply);
  });

  await page.goto('/pet/new/onboarding');

  // Step 1: Pet Information
  await page.getByRole('button', { name: /Dog/ }).click();
  await page.locator('#pet-name').fill(PET_NAME);
  await page.locator('#sex-Female').click();
  await page.locator('#altered-Yes').click();
  await page.getByRole('button', { name: "I don't know" }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: generally healthy, then "Yes" to medications -> Medication Entry.
  await waitForOnboardingStep(page, 'Step 2 of 6');
  await page.getByRole('radio', { name: `${PET_NAME} is generally healthy` }).click();
  await page.getByRole('radio', { name: 'Yes' }).click();

  // Medication label scan, daily cap reached.
  await expect(page.getByText('Scan Medication Label')).toBeVisible();
  await page.setInputFiles('input[type="file"]', SCAN_FIXTURE);
  await expect(page.getByRole('alert')).toHaveText(DAILY_LIMIT_MESSAGE);
  // Manual entry stays available and the button is back (not stuck reading).
  await expect(page.getByText('Scan Medication Label')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();

  expect(bodies).toHaveLength(1);
  expect(bodies[0].task).toBe('scan_medication');
  expect(typeof bodies[0].file_path).toBe('string');
  expect(bodies[0].prompt).toBeUndefined();
  expect(bodies[0].response_json_schema).toBeUndefined();
  expect(bodies[0].file_url).toBeUndefined();

  // Any other failure keeps the old manual-entry message.
  reply = { status: 500, json: { error: 'Something went wrong. Please try again.' } };
  await page.setInputFiles('input[type="file"]', SCAN_FIXTURE);
  await expect(page.getByRole('alert')).toHaveText("Couldn't read that label — you can still enter it manually below.");

  // Skip medications, through the transition screen and baseline questions.
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole('radio').first().click();
  }

  // Step 4: Vaccination record scan, daily cap reached.
  await waitForOnboardingStep(page, 'Step 4 of 6');
  reply = { status: 429, json: { error: DAILY_LIMIT_MESSAGE, code: 'daily_limit' } };
  await expect(page.getByText('Scan Vaccination Record')).toBeVisible();
  await page.setInputFiles('input[type="file"]', SCAN_FIXTURE);
  await expect(page.getByRole('alert')).toHaveText(DAILY_LIMIT_MESSAGE);
  await expect(page.getByText('Scan Vaccination Record')).toBeVisible();

  const vaccineBody = bodies[bodies.length - 1];
  expect(vaccineBody.task).toBe('scan_vaccine_single');
  expect(vaccineBody.prompt).toBeUndefined();
  expect(vaccineBody.response_json_schema).toBeUndefined();

  // Any other failure keeps the old message here too.
  reply = { status: 502, json: { error: 'Something went wrong. Please try again.' } };
  await page.setInputFiles('input[type="file"]', SCAN_FIXTURE);
  await expect(page.getByRole('alert')).toHaveText("Couldn't read that record — you can still enter it manually below.");
});
