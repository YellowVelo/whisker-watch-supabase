// Spec 0041 — Ask Wysker AI guardrails. Each test below maps to one
// Acceptance Criterion from the spec's Test Plan. None of these need a
// real Anthropic API call: AI-response-dependent assertions intercept the
// `ask-vet-assistant` request with page.route().fulfill() and return a
// synthetic body instead — this is the first use of Playwright's request
// interception in this suite, so it's new infrastructure here, not reuse
// of a proven pattern.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { test, expect, dismissAnyOpenSheet } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

const ASK_VET_ASSISTANT = '**/functions/v1/ask-vet-assistant';

let petId;
let petName;

test.beforeAll(async () => {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as test1@: ${error.message}`);

  const { data: pets, error: petsError } = await supabase.from('pets').select('id, name').limit(1);
  if (petsError || !pets?.length) throw new Error('test1@ has no pets to open Ask Wysker against');
  petId = pets[0].id;
  petName = pets[0].name;
});

async function openAskWyskerFromWeightScreen(page) {
  await page.goto(`/pet/${petId}/symptoms`);
  await dismissAnyOpenSheet(page);
  await page.getByRole('button', { name: 'Ask Wysker' }).click();
  await expect(page.getByRole('heading', { name: 'Ask Wysker' })).toBeVisible();
}

test('screen name reaches the AI request', async ({ page }) => {
  let capturedPrompt = null;
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    capturedPrompt = JSON.parse(route.request().postData()).prompt;
    await route.fulfill({ json: { reply: 'Test reply', urgent: false } });
  });

  await openAskWyskerFromWeightScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('What should I watch for?');
  await page.locator('textarea').press('Enter');

  await expect.poll(() => capturedPrompt).not.toBeNull();
  expect(capturedPrompt).toContain(petName);
  expect(capturedPrompt).toContain('Weight');
});

test('fixed disclaimer banner is visible in pet-scoped and general mode', async ({ page }) => {
  await openAskWyskerFromWeightScreen(page);
  await expect(page.getByText(/not veterinary advice/i)).toBeVisible();
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await expect(page.getByText(/not veterinary advice/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.goto('/');
  await dismissAnyOpenSheet(page);
  await page.getByRole('button', { name: 'Ask Wysker' }).click();
  await expect(page.getByText(/not veterinary advice/i)).toBeVisible();
});

test('emergency keyword match blocks the AI call and shows a hard-stop redirect with no bypass', async ({ page }) => {
  let requestCount = 0;
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    requestCount += 1;
    await route.fulfill({ json: { reply: 'should never be seen', urgent: false } });
  });

  await openAskWyskerFromWeightScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('my dog got into antifreeze, what do I do');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toContainText(/contact your veterinarian/i);
  await expect(page.getByText('should never be seen')).not.toBeVisible();
  expect(requestCount).toBe(0);

  // Hard stop, no bypass: nothing on screen offers a way past the redirect.
  await expect(page.getByRole('button', { name: /continue|anyway|not an emergency/i })).toHaveCount(0);
});

test('AI-flagged urgent backstop discards the AI reply and shows only the redirect', async ({ page }) => {
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    await route.fulfill({ json: { reply: 'this answer should never render', urgent: true } });
  });

  await openAskWyskerFromWeightScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('is this something to worry about');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toContainText(/contact your veterinarian/i);
  await expect(page.getByText('this answer should never render')).not.toBeVisible();
});

test('an ordinary, non-urgent question shows the normal AI reply with no emergency messaging', async ({ page }) => {
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    await route.fulfill({ json: { reply: 'Ordinary, calm answer text.', urgent: false } });
  });

  await openAskWyskerFromWeightScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('what is a healthy weight range?');
  await page.locator('textarea').press('Enter');

  await expect(page.getByText('Ordinary, calm answer text.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

// Spec 0050 — ask-vet-assistant rate limiting. Both tests below simulate
// the Edge Function's own failure responses via page.route() rather than
// actually firing 20+ real requests: doing that for real in a Playwright
// test would be slow, flaky (shared quota with anything else the test
// account recently did), and would spend real Anthropic API cost 20 times
// over just to exercise the 21st. A synthetic response proves the same
// client-side handling without any of that.
test('hitting the rate limit shows a clear message instead of hanging', async ({ page }) => {
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    await route.fulfill({
      status: 429,
      json: { error: "You've reached the limit for AI requests. Please wait a few minutes and try again." },
    });
  });

  await openAskWyskerFromWeightScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('one more question');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toContainText(/reached the limit/i);
  // Loading state cleared, not stuck spinning forever: the bouncing-dots
  // "thinking" indicator (shown only while loading) is gone.
  await expect(page.locator('.animate-bounce')).toHaveCount(0);
});

test('a non-rate-limit AI failure shows a clear error instead of hanging', async ({ page }) => {
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    await route.fulfill({ status: 500, json: { error: 'AI request failed' } });
  });

  await openAskWyskerFromWeightScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('any question');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toContainText(/something went wrong/i);
  await expect(page.locator('.animate-bounce')).toHaveCount(0);
});
