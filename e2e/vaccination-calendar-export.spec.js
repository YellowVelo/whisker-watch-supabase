// Spec 0034. ExportCalendarButton.jsx was fully built but orphaned —
// present in the codebase, wired into zero pages on main — until this
// spec reconnected it to the Vaccinations and Medications pages. This is
// plain UI-reachable coverage (no elevated seeding needed, unlike
// vaccination-due-reminders.spec.js), confirming the reconnect actually
// works end to end rather than just compiling.
//
// ExportCalendarButton shows a blocking native alert() instead of a
// download if the pet has zero medications/vaccinations with a
// next_due_date (src/components/ExportCalendarButton.jsx). test1@'s real
// fixture pets aren't guaranteed to have one, so each test seeds its own
// throwaway vaccination record rather than relying on fixture state or
// another spec file's data.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { test, expect } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

let supabase;
let petId;
let vaccinationId;

test.beforeAll(async () => {
  supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as test1@: ${error.message}`);

  const { data: pets, error: petsError } = await supabase.from('pets').select('id').limit(1);
  if (petsError || !pets?.length) throw new Error('test1@ has no pets to attach a test vaccination to');
  petId = pets[0].id;

  const dueDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const userId = (await supabase.auth.getUser()).data.user.id;
  const { data: vax, error: vaxError } = await supabase
    .from('vaccinations')
    .insert({ pet_id: petId, vaccine_name: 'E2E Export Test', next_due_date: dueDate, created_by: userId })
    .select()
    .single();
  if (vaxError) throw new Error(`could not create test vaccination: ${vaxError.message}`);
  vaccinationId = vax.id;
});

test.afterAll(async () => {
  if (vaccinationId) await supabase.from('vaccinations').delete().eq('id', vaccinationId);
});

test('the Export to Calendar button downloads a .ics file from the Vaccinations page', async ({ page }) => {
  await page.goto(`/pet/${petId}/vaccinations`);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10_000 }),
    page.getByRole('button', { name: 'Export to Calendar' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/_health_calendar\.ics$/);
});

test('the Export to Calendar button is reachable from the Medications page', async ({ page }) => {
  await page.goto(`/pet/${petId}/medications`);

  await expect(page.getByRole('button', { name: 'Export to Calendar' })).toBeVisible();
});
