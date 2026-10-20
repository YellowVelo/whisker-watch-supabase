// Spec 0034. The `notifications` table has no insert policy for regular
// users (migration 0005 — only the service role writes to it) and
// generate_vaccination_due_notifications() is deliberately not grantable
// to authenticated users either (same locked-down pattern as the existing
// compute_daily_analytics_summary cron function, migration 0023) — so a
// real user session can never produce a vaccination-due notification on
// its own. To seed one for this test, we shell out to the Supabase CLI
// (must be linked to wysker-watch-dev — enforced by assertLinkedToDev
// below) and invoke the
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
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { test, expect } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

// Spec 0067. `--linked` runs against whatever project the local CLI was
// last linked to (supabase/.temp/project-ref), not necessarily dev — and
// this repo's CLI gets re-linked to staging/prod for manual deploys
// (0006 Technical Standards §11). Linked to prod, this would fire prod's
// real daily vaccination-notification job against real users. Refuse
// unless the link is wysker-watch-dev.
const DEV_PROJECT_REF = 'rebvizgpchpzjpoohjrd';

function assertLinkedToDev() {
  const refFile = path.join('supabase', '.temp', 'project-ref');
  let linkedRef;
  try {
    linkedRef = readFileSync(refFile, 'utf8').trim();
  } catch {
    throw new Error(`Refusing to run: no ${refFile} found, so the Supabase CLI isn't linked to any project. Run \`npx supabase link --project-ref ${DEV_PROJECT_REF}\` (wysker-watch-dev) first.`);
  }
  if (linkedRef !== DEV_PROJECT_REF) {
    throw new Error(`Refusing to run: the Supabase CLI is linked to project "${linkedRef}", not wysker-watch-dev (${DEV_PROJECT_REF}). This test calls the real vaccination-notification job, which must never run against staging or prod. Run \`npx supabase link --project-ref ${DEV_PROJECT_REF}\` first.`);
  }
}

function runGeneratorFunction() {
  assertLinkedToDev();
  const dir = mkdtempSync(path.join(tmpdir(), 'wysker-e2e-'));
  const file = path.join(dir, 'query.sql');
  writeFileSync(file, 'select public.generate_vaccination_due_notifications();');
  try {
    // --workdir . pins the CLI to the same supabase/.temp assertLinkedToDev
    // just checked. Without it, the CLI walks up to a parent folder's link
    // when there's no supabase/config.toml here (e.g. a git worktree nested
    // inside the main checkout), so it could use a different link than the
    // one the guard read.
    execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--workdir', '.', '--file', file], { stdio: 'pipe', shell: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Spec 0068. Every test vaccination's name starts with this, so leftovers
// from an earlier run that never got cleaned up can be found and removed.
const TEST_VACCINE_PREFIX = 'E2E Test Rabies';

// Vaccinations the current test created. Cleaned up in afterEach rather
// than a try/finally inside the test: afterEach still runs when a test
// times out or seeding throws partway, and its errors are reported next
// to the test's own error instead of replacing it.
const createdVaccinationIds = new Set();

let supabase;
let petId;
let petName;

// Deletes the given test vaccinations and their reminders, failing loudly
// if Supabase reports an error. Before spec 0068 these errors were
// ignored, so a failed delete left rows behind with no sign of it.
async function deleteTestVaccinations(ids) {
  if (!ids.length) return;
  const { error: notifError } = await supabase
    .from('notifications')
    .delete()
    .eq('related_type', 'vaccination_due')
    .in('related_id', ids);
  if (notifError) throw new Error(`could not delete test notifications: ${notifError.message}`);
  const { error: vaxError } = await supabase.from('vaccinations').delete().in('id', ids);
  if (vaxError) throw new Error(`could not delete test vaccinations: ${vaxError.message}`);
}

// IDs of test1@'s vaccination reminders whose vaccination no longer
// exists. These come from a test vaccination deleted without its
// reminders — including other spec files' vaccinations (e.g.
// vaccination-calendar-export.spec.js), since the reminder job this file
// runs covers every vaccination in dev, not just this file's.
async function findOrphanedReminderIds() {
  const { data: reminders, error } = await supabase
    .from('notifications')
    .select('id, related_id')
    .eq('related_type', 'vaccination_due');
  if (error) throw new Error(`could not look up vaccination reminders: ${error.message}`);
  const relatedIds = [...new Set(reminders.map((n) => n.related_id))];
  if (!relatedIds.length) return [];
  const { data: existing, error: vaxError } = await supabase.from('vaccinations').select('id').in('id', relatedIds);
  if (vaxError) throw new Error(`could not look up reminded vaccinations: ${vaxError.message}`);
  const existingIds = new Set(existing.map((v) => v.id));
  return reminders.filter((n) => !existingIds.has(n.related_id)).map((n) => n.id);
}

// Removes every leftover test vaccination (and its reminders) plus any
// orphaned reminder on test1@, whichever run created them, then checks
// none are left. The check matters: row-level security turns a delete the
// user isn't allowed to make into a silent "0 rows deleted", not an error.
// Leftovers pile up fast: dev's daily reminder cron job (migration 0044)
// keeps adding reminders for a leaked vaccination every day it's left.
async function sweepLeftoverTestRows() {
  const { data: leftovers, error } = await supabase
    .from('vaccinations')
    .select('id')
    .like('vaccine_name', `${TEST_VACCINE_PREFIX}%`);
  if (error) throw new Error(`could not look up leftover test vaccinations: ${error.message}`);
  await deleteTestVaccinations(leftovers.map((v) => v.id));

  const orphanIds = await findOrphanedReminderIds();
  if (orphanIds.length) {
    const { error: orphanError } = await supabase.from('notifications').delete().in('id', orphanIds);
    if (orphanError) throw new Error(`could not delete orphaned reminders: ${orphanError.message}`);
  }

  const { count: vaxLeft, error: countError } = await supabase
    .from('vaccinations')
    .select('id', { count: 'exact', head: true })
    .like('vaccine_name', `${TEST_VACCINE_PREFIX}%`);
  if (countError) throw new Error(`could not verify test-row cleanup: ${countError.message}`);
  const orphansLeft = (await findOrphanedReminderIds()).length;
  if (vaxLeft || orphansLeft) {
    throw new Error(`test-row cleanup left ${vaxLeft} "${TEST_VACCINE_PREFIX}" vaccination(s) and ${orphansLeft} orphaned reminder(s) on test1@ — remove them by hand on wysker-watch-dev`);
  }
}

test.beforeAll(async () => {
  // Fail before seeding anything, so a refusal leaves no stray test rows.
  assertLinkedToDev();
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

  // Start from a clean slate even if an earlier run crashed mid-test.
  await sweepLeftoverTestRows();
});

test.afterEach(async () => {
  const ids = [...createdVaccinationIds];
  createdVaccinationIds.clear();
  await deleteTestVaccinations(ids);
});

test.afterAll(async () => {
  // supabase is unset if beforeAll refused (e.g. not linked to dev).
  if (supabase) await sweepLeftoverTestRows();
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
  // Registered before the CLI call, so afterEach still removes the row if
  // the CLI call throws. Before spec 0068 a CLI failure here leaked it.
  createdVaccinationIds.add(vax.id);
  runGeneratorFunction();
  return vax.id;
}

// The reminder card for one test vaccine. Scoping every check to it means
// another vaccination reminder on test1@'s list can't trip Playwright's
// "more than one match" (strict mode) error, or get clicked by mistake.
// `div.rounded-xl` is each reminder's outer card in Notifications.jsx.
function reminderCard(page, vaccineName) {
  return page.locator('div.rounded-xl').filter({ hasText: vaccineName });
}

test('a vaccination-due notification renders with the right stage copy and buttons', async ({ page }) => {
  await seedVaccinationDueNotification('E2E Test Rabies A');
  await page.goto('/notifications');

  const card = reminderCard(page, 'E2E Test Rabies A');
  await expect(card.getByText('Vaccination Due Soon')).toBeVisible();
  await expect(card.getByText(`E2E Test Rabies A is due for ${petName} in 14 days.`)).toBeVisible();
  await expect(card.getByRole('button', { name: 'View Vaccination' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Snooze 7 Days' })).toBeVisible();
});

test('tapping "View Vaccination" opens that vaccine\'s edit form on the Vaccinations page', async ({ page }) => {
  const vaccinationId = await seedVaccinationDueNotification('E2E Test Rabies B');
  await page.goto('/notifications');
  await reminderCard(page, 'E2E Test Rabies B').getByRole('button', { name: 'View Vaccination' }).click();

  await expect(page).toHaveURL(new RegExp(`/pet/${petId}/vaccinations\\?edit=${vaccinationId}`));
  await expect(page.getByRole('heading', { name: 'Edit Vaccination' })).toBeVisible();
  await expect(page.getByPlaceholder('e.g. Rabies')).toHaveValue('E2E Test Rabies B');
});

test('snoozing a vaccination reminder hides it and records a 7-day snooze', async ({ page }) => {
  const vaccinationId = await seedVaccinationDueNotification('E2E Test Rabies C');
  await page.goto('/notifications');
  const card = reminderCard(page, 'E2E Test Rabies C');
  await card.getByRole('button', { name: 'Snooze 7 Days' }).click();

  await expect(card).toHaveCount(0);

  // The page hides the card the instant Snooze is tapped, before the save
  // reaches the database (Notifications.jsx handleSnooze), so one immediate
  // read could beat the save — the old occasional `read` flake. Poll.
  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .from('notifications')
          .select('read, snoozed_until')
          .eq('related_type', 'vaccination_due')
          .eq('related_id', vaccinationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (error) throw new Error(`could not read the snoozed notification: ${error.message}`);
        return data.read === true && new Date(data.snoozed_until).getTime() > Date.now() + 6 * 24 * 60 * 60 * 1000;
      },
      { message: 'notification should be saved as read with a ~7-day snooze', timeout: 10_000 }
    )
    .toBe(true);

  // Re-running the generator right after snoozing must not re-create the
  // reminder — this is the dedup/snooze-respecting behavior migration
  // 0044 implements. Checked in the database directly: after a reload the
  // card is also absent while the list is still loading, which alone
  // would prove nothing.
  runGeneratorFunction();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('related_type', 'vaccination_due')
    .eq('related_id', vaccinationId);
  if (error) throw new Error(`could not count notifications: ${error.message}`);
  expect(count).toBe(1);

  await page.reload();
  // Wait for Notifications.jsx's loading placeholders to go away first.
  await expect(page.locator('main .animate-pulse')).toHaveCount(0);
  await expect(card).toHaveCount(0);
});
