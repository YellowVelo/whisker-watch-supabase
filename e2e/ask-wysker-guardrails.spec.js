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

// Spec 0081: the Trends screen asks for its own Insight Summary
// (trends_summary) when it loads. That request is answered with no summary
// here, so it never reaches a test's handler (or counts as an Ask Wysker
// call) and never makes a real AI call on dev.
async function routeAskWysker(page, handler) {
  await page.route(ASK_VET_ASSISTANT, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.task === 'trends_summary') return route.fulfill({ json: { summary: null } });
    return handler(route);
  });
}

// Spec 0081: opened from Trends (the Symptoms page, once the "Weight"
// screen, is retired).
async function openAskWyskerFromTrendsScreen(page) {
  await page.goto(`/pet/${petId}/trends`);
  await dismissAnyOpenSheet(page);
  await page.getByRole('button', { name: 'Ask Wysker' }).click();
  await expect(page.getByRole('heading', { name: 'Ask Wysker' })).toBeVisible();
}

// Spec 0080: the app names a task and sends ids only. The server writes
// the prompt, so this checks the request's fields instead of prompt text.
test('screen name reaches the AI request', async ({ page }) => {
  let capturedBody = null;
  await routeAskWysker(page, async (route) => {
    capturedBody = JSON.parse(route.request().postData());
    await route.fulfill({ json: { reply: 'Test reply', urgent: false } });
  });

  await openAskWyskerFromTrendsScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('What should I watch for?');
  await page.locator('textarea').press('Enter');

  await expect.poll(() => capturedBody).not.toBeNull();
  expect(capturedBody.task).toBe('pet_chat');
  expect(capturedBody.pet_id).toBe(petId);
  expect(capturedBody.screen).toBe('Trends');
  expect(capturedBody.question).toBe('What should I watch for?');
  expect(capturedBody).not.toHaveProperty('prompt');
  expect(capturedBody).not.toHaveProperty('response_json_schema');
  // History is the conversation before the question: just the greeting.
  expect(capturedBody.history).toHaveLength(1);
  expect(capturedBody.history[0]).toEqual({ role: 'assistant', content: expect.stringContaining(petName) });
});

test('fixed disclaimer banner is visible in pet-scoped and general mode', async ({ page }) => {
  await routeAskWysker(page, (route) => route.fulfill({ json: { reply: 'Test reply', urgent: false } }));
  await openAskWyskerFromTrendsScreen(page);
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
  await routeAskWysker(page, async (route) => {
    requestCount += 1;
    await route.fulfill({ json: { reply: 'should never be seen', urgent: false } });
  });

  await openAskWyskerFromTrendsScreen(page);
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
  await routeAskWysker(page, async (route) => {
    // Spec 0080: the server drops the AI's text and sends only the flag;
    // the app must still discard any text if one ever arrives.
    await route.fulfill({ json: { reply: 'this answer should never render', urgent: true } });
  });

  await openAskWyskerFromTrendsScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('is this something to worry about');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toContainText(/contact your veterinarian/i);
  await expect(page.getByText('this answer should never render')).not.toBeVisible();
});

test('an ordinary, non-urgent question shows the normal AI reply with no emergency messaging', async ({ page }) => {
  await routeAskWysker(page, async (route) => {
    await route.fulfill({ json: { reply: 'Ordinary, calm answer text.', urgent: false } });
  });

  await openAskWyskerFromTrendsScreen(page);
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
  await routeAskWysker(page, async (route) => {
    await route.fulfill({
      status: 429,
      json: { error: "You've reached the limit for AI requests. Please wait a few minutes and try again.", code: 'rate_limited' },
    });
  });

  await openAskWyskerFromTrendsScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('one more question');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toContainText(/reached the limit/i);
  // Loading state cleared, not stuck spinning forever: the bouncing-dots
  // "thinking" indicator (shown only while loading) is gone.
  await expect(page.locator('.animate-bounce')).toHaveCount(0);
});

// Spec 0080 AC6 (the app side): over the 100-a-day cap, the server answers
// 429 daily_limit with wording A, and the chat shows exactly that.
const DAILY_LIMIT_MESSAGE = "You've reached today's limit for Ask Wysker and document scans. You can try again tomorrow.";

test('hitting the daily limit shows the daily-limit message', async ({ page }) => {
  await routeAskWysker(page, async (route) => {
    await route.fulfill({ status: 429, json: { error: DAILY_LIMIT_MESSAGE, code: 'daily_limit' } });
  });

  await openAskWyskerFromTrendsScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('one more question today');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toHaveText(DAILY_LIMIT_MESSAGE);
  await expect(page.locator('.animate-bounce')).toHaveCount(0);
});

// Spec 0080 wording C: Insights with too few check-ins. The server answers
// { not_enough_data: true } without calling the AI.
test('Insights with too few check-ins shows the not-enough-check-ins message', async ({ page }) => {
  let capturedBody = null;
  await routeAskWysker(page, async (route) => {
    capturedBody = JSON.parse(route.request().postData());
    await route.fulfill({ json: { not_enough_data: true } });
  });

  await openAskWyskerFromTrendsScreen(page);
  await page.getByRole('button', { name: `Analyze ${petName}'s Records` }).click();

  await expect(page.getByText('Not enough check-ins yet.')).toBeVisible();
  await expect(page.getByText(`Insights look at ${petName}'s last 30 days of daily check-ins. Check in on at least 2 days and they'll be ready.`)).toBeVisible();
  expect(capturedBody).toEqual({ task: 'pet_insights', pet_id: petId, screen: 'Trends' });
});

test('a non-rate-limit AI failure shows a clear error instead of hanging', async ({ page }) => {
  await routeAskWysker(page, async (route) => {
    await route.fulfill({ status: 500, json: { error: 'AI request failed' } });
  });

  await openAskWyskerFromTrendsScreen(page);
  await page.getByRole('button', { name: 'Ask a Question' }).click();
  await page.locator('textarea').fill('any question');
  await page.locator('textarea').press('Enter');

  await expect(page.getByRole('alert')).toContainText(/something went wrong/i);
  await expect(page.locator('.animate-bounce')).toHaveCount(0);
});
