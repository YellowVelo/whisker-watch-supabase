// Spec 0034. The `notifications` table has no insert policy for regular
// users (migration 0005 — only the service role writes to it) and
// generate_vaccination_due_notifications() is deliberately not grantable
// to authenticated users either (same locked-down pattern as the existing
// compute_daily_analytics_summary cron function, migration 0023) — so a
// real user session can never produce a vaccination-due notification on
// its own. To seed one for this test, we shell out to the Supabase CLI
// (already authenticated locally against wysker-watch-dev) and invoke the
// exact function the daily cron job calls — the most faithful way to test
// this without adding a service-role key to .env.playwright, which the
// rest of this suite deliberately avoids (see fixtures.js).
//
// The SQL is written to a temp file and run via `--file` rather than
// passed inline: on Windows, execFileSync needs `shell: true` to resolve
// npx.cmd, which routes the command through cmd.exe — and cmd.exe mangles
// unescaped parentheses/quotes in an inline SQL string (confirmed while
// writing this test: an inline call silently executed a corrupted query
// and returned an empty result, no error). A file path has none of those
// characters, sidestepping the whole problem.
//
// Each test seeds its own vaccination rather than sharing one from a
// single beforeAll: "View Vaccination" and "Snooze" both mark the
// notification read, which (correctly, per this spec) removes it from
// the visible list — so a shared fixture would make later tests
// order-dependent on what earlier ones already did to it.
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { test, expect } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

function runGeneratorFunction() {
  const dir = mkdtempSync(path.join(tmpdir(), 'wysker-e2e-'));
  const file = path.join(dir, 'query.sql');
  writeFileSync(file, 'select public.generate_vaccination_due_notifications();');
  try {
    execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--file', file], { stdio: 'pipe', shell: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let supabase;
let petId;
let petName;

test.beforeAll(async () => {
  supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as test1@: ${error.message}`);

  const { data: pets, error: petsError } = await supabase.from('pets').select('id, name').limit(1);
  if (petsError || !pets?.length) throw new Error('test1@ has no pets to attach a test vaccination to');
  petId = pets[0].id;
  petName = pets[0].name;
});

// 10 days out lands in the 14_day bucket (8-14 days), per the generator
// function's stage boundaries — see migration 0044.
async function seedVaccinationDueNotification(vaccineName) {
  const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const userId = (await supabase.auth.getUser()).data.user.id;
  const { data: vax, error } = await supabase
    .from('vaccinations')
    .insert({ pet_id: petId, vaccine_name: vaccineName, next_due_date: dueDate, created_by: userId })
    .select()
    .single();
  if (error) throw new Error(`could not create test vaccination: ${error.message}`);
  runGeneratorFunction();
  return vax.id;
}

async function cleanupVaccination(vaccinationId) {
  await supabase.from('notifications').delete().eq('related_type', 'vaccination_due').eq('related_id', vaccinationId);
  await supabase.from('vaccinations').delete().eq('id', vaccinationId);
}

test('a vaccination-due notification renders with the right stage copy and buttons', async ({ page }) => {
  const vaccinationId = await seedVaccinationDueNotification('E2E Test Rabies A');
  try {
    await page.goto('/notifications');

    await expect(page.getByText('Vaccination Due Soon')).toBeVisible();
    await expect(page.getByText(`E2E Test Rabies A is due for ${petName} in 14 days.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'View Vaccination' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Snooze 7 Days' })).toBeVisible();
  } finally {
    await cleanupVaccination(vaccinationId);
  }
});

test('tapping "View Vaccination" opens that vaccine\'s edit form on the Vaccinations page', async ({ page }) => {
  const vaccinationId = await seedVaccinationDueNotification('E2E Test Rabies B');
  try {
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'View Vaccination' }).click();

    await expect(page).toHaveURL(new RegExp(`/pet/${petId}/vaccinations\\?edit=${vaccinationId}`));
    await expect(page.getByRole('heading', { name: 'Edit Vaccination' })).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Rabies')).toHaveValue('E2E Test Rabies B');
  } finally {
    await cleanupVaccination(vaccinationId);
  }
});

test('snoozing a vaccination reminder hides it and records a 7-day snooze', async ({ page }) => {
  const vaccinationId = await seedVaccinationDueNotification('E2E Test Rabies C');
  try {
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Snooze 7 Days' }).click();

    await expect(page.getByText('Vaccination Due Soon')).not.toBeVisible();

    const { data } = await supabase
      .from('notifications')
      .select('read, snoozed_until')
      .eq('related_type', 'vaccination_due')
      .eq('related_id', vaccinationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(data.read).toBe(true);
    expect(new Date(data.snoozed_until).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    // Re-running the generator right after snoozing must not re-create the
    // reminder — this is the dedup/snooze-respecting behavior migration
    // 0044 implements.
    runGeneratorFunction();
    await page.reload();
    await expect(page.getByText('Vaccination Due Soon')).not.toBeVisible();
  } finally {
    await cleanupVaccination(vaccinationId);
  }
});
