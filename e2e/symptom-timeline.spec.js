// Spec 0059: PetSymptoms.jsx's "Log Symptoms" overlay used to render
// inline inside this page's own <PageTransition>, whose Framer Motion
// wrapper carries a CSS transform even at rest — the same mechanism
// already fixed once for BottomSheet/CatchUpFlow/OnboardingShell (spec
// 0045's own comment on BottomSheet.jsx flagged this as a known, deferred
// gap here). That transform becomes the panel's containing block, so once
// the Timeline page has been scrolled down, the panel's "fixed inset-0"
// anchors to the page's full scroll height instead of the real viewport —
// its header/footer render far below the visible screen. This spec is the
// direct regression coverage: portaling to document.body fixes that.
import { test, expect } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const PET_NAME = `E2E Symptoms Pet ${Date.now()}`;
const SEEDED_LOG_COUNT = 20;
let symptomsPetId;

async function signInSupabase() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as ${process.env.PLAYWRIGHT_TEST1_EMAIL}: ${error.message}`);
  return { supabase, userId: data.user.id };
}

test.afterEach(async () => {
  if (!symptomsPetId) return;
  const { supabase } = await signInSupabase();
  // symptom_logs.pet_id references pets(id) on delete cascade, so deleting
  // the pet cleans up every seeded row too — same pattern catch-up-flow.spec.js
  // already uses for its own throwaway pet.
  await supabase.functions.invoke('delete-pet', { body: { pet_id: symptomsPetId } });
  symptomsPetId = undefined;
});

test('the "Log Symptoms" panel stays pinned to the viewport after scrolling, and is a focus-trapped dialog', async ({ page }) => {
  const { supabase, userId } = await signInSupabase();

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .insert({ created_by: userId, name: PET_NAME })
    .select('id')
    .single();
  if (petError) throw petError;
  symptomsPetId = pet.id;

  // Enough rows to make the Timeline page taller than the viewport —
  // otherwise "scroll down" has nothing to prove.
  const rows = Array.from({ length: SEEDED_LOG_COUNT }, (_, i) => {
    const d = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000);
    return { created_by: userId, pet_id: pet.id, date: d.toISOString().slice(0, 10), appetite: 'Ate most' };
  });
  const { error: logsError } = await supabase.from('symptom_logs').insert(rows);
  if (logsError) throw logsError;

  await page.goto(`/pet/${pet.id}/symptoms`);
  await expect(page.getByRole('heading', { name: 'Symptom Timeline' })).toBeVisible({ timeout: 10000 });

  // Scroll the page down first — this is the failure condition the bug
  // needed: opening the panel from scrollY≈0 masked it before spec 0059.
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: 'Log symptoms' }).click();

  const panel = page.getByRole('dialog', { name: 'Log Symptoms' });
  await expect(panel).toBeVisible({ timeout: 5000 });
  await expect(panel).toHaveAttribute('aria-modal', 'true');

  // The actual regression check: the panel's own header is inside the
  // viewport, not scrolled thousands of pixels away.
  await expect(panel.getByRole('heading', { name: 'Log Symptoms' })).toBeInViewport();

  // Focus lands on the panel's own first focusable element (Close) on open.
  await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused();

  // Tab from the last focusable element wraps back to the first, staying
  // inside the panel rather than leaking into the page behind it.
  const lastFocusable = panel.locator(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ).last();
  await lastFocusable.focus();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused();

  // Escape closes it, same as clicking Close.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});
