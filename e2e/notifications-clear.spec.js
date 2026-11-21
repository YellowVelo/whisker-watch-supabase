// Spec 0076 (PA-58): dismiss one, Mark all read, and Clear all on the
// Notifications page.
//
// Normal users can't create notifications (migration 0005 has no insert
// policy; only the server writes them), so seeding uses the Supabase CLI
// against the linked dev project, the same way
// vaccination-due-reminders.spec.js does (see that file's header for why
// the SQL goes through a temp file). Skipped in CI for the same reason.
//
// Each test seeds its own fresh pair, one ordinary notice and one vaccine
// reminder, and removes them afterwards, so the tests don't depend on run
// order. "Clear all" also clears any older leftovers on test1@'s account,
// which only ever helps the other notification tests.
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { test, expect } from './fixtures.js';

dotenv.config({ path: '.env.playwright' });

test.skip(!!process.env.CI, 'Needs a local run: seeding uses `supabase db query --linked`, and CI has no linked project.');

// Refuse to seed anywhere but the project this suite signs in to (dev).
// Guards against the CLI having been linked to staging or prod.
function assertLinkedToTestProject() {
  const refFile = path.join('supabase', '.temp', 'project-ref');
  const linkedRef = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : '';
  const expectedRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
  if (linkedRef !== expectedRef) {
    throw new Error(`Supabase CLI is linked to "${linkedRef || 'nothing'}", not the e2e project "${expectedRef}". Refusing to seed.`);
  }
}

function runSql(sql) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wysker-e2e-'));
  const file = path.join(dir, 'query.sql');
  writeFileSync(file, sql);
  try {
    execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--file', file], { stdio: 'pipe', shell: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let supabase;
let userId;
let petId;

test.beforeAll(async () => {
  assertLinkedToTestProject();
  supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PLAYWRIGHT_TEST1_EMAIL,
    password: process.env.PLAYWRIGHT_TEST1_PASSWORD,
  });
  if (error) throw new Error(`could not sign in as test1@: ${error.message}`);
  userId = data.user.id;

  const { data: pets, error: petsError } = await supabase.from('pets').select('id').limit(1);
  if (petsError || !pets?.length) throw new Error('test1@ has no pets to attach a test vaccination to');
  petId = pets[0].id;
});

// Seeds one ordinary notice and one vaccine reminder (10 days out, the
// 14_day stage). Returns what the test needs to find and clean them up.
async function seedPair(label) {
  const message = `E2E notice ${label} ${Date.now()}`;
  const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const vaccineName = `E2E Clear Vaccine ${label}`;
  const { data: vax, error } = await supabase
    .from('vaccinations')
    .insert({ pet_id: petId, vaccine_name: vaccineName, next_due_date: dueDate, created_by: userId })
    .select()
    .single();
  if (error) throw new Error(`could not create test vaccination: ${error.message}`);

  runSql(
    `insert into public.notifications (user_id, type, message, read) values ('${userId}', 'ownership_transfer', '${message}', false);\n`
    + 'select public.generate_vaccination_due_notifications();',
  );
  return { message, vaccineName, vaccinationId: vax.id };
}

async function cleanup({ message, vaccinationId }) {
  await supabase.from('notifications').delete().eq('message', message);
  await supabase.from('notifications').delete().eq('related_type', 'vaccination_due').eq('related_id', vaccinationId);
  await supabase.from('vaccinations').delete().eq('id', vaccinationId);
}

async function reminderRow(vaccinationId) {
  const { data } = await supabase
    .from('notifications')
    .select('id, read')
    .eq('related_type', 'vaccination_due')
    .eq('related_id', vaccinationId);
  return data || [];
}

async function noticeRows(message) {
  const { data } = await supabase.from('notifications').select('id, read').eq('message', message);
  return data || [];
}

test('dismissing an ordinary notice deletes it', async ({ page }) => {
  const seed = await seedPair('A');
  try {
    await page.goto('/notifications');
    await expect(page.getByText(seed.message)).toBeVisible();
    await page.getByRole('button', { name: `Dismiss: ${seed.message}` }).click();
    await expect(page.getByText(seed.message)).toBeHidden();

    await page.reload();
    await expect(page.getByText(seed.message)).toBeHidden();
    expect(await noticeRows(seed.message)).toHaveLength(0);
  } finally {
    await cleanup(seed);
  }
});

test('"Mark all read" marks the notice read and hides the reminder', async ({ page }) => {
  const seed = await seedPair('B');
  try {
    await page.goto('/notifications');
    await expect(page.getByText(seed.message)).toBeVisible();
    await expect(page.getByText(new RegExp(seed.vaccineName))).toBeVisible();

    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByText(new RegExp(seed.vaccineName))).toBeHidden();
    await expect(page.getByText(seed.message)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all read' })).toBeHidden();

    const [notice] = await noticeRows(seed.message);
    expect(notice.read).toBe(true);
    const reminders = await reminderRow(seed.vaccinationId);
    expect(reminders.every((r) => r.read)).toBe(true);
  } finally {
    await cleanup(seed);
  }
});

test('"Clear all" deletes notices, marks reminders read, and the reminder does not come back', async ({ page }) => {
  const seed = await seedPair('C');
  try {
    await page.goto('/notifications');
    await expect(page.getByText(seed.message)).toBeVisible();

    await page.getByRole('button', { name: 'Clear all' }).click();
    const sheet = page.getByRole('dialog', { name: 'Clear all notifications?' });
    await sheet.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByText('No notifications yet.')).toBeVisible();

    expect(await noticeRows(seed.message)).toHaveLength(0);
    const reminders = await reminderRow(seed.vaccinationId);
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((r) => r.read)).toBe(true);

    // The daily job sees the reminder was already sent at this stage and
    // doesn't make a new one (migration 0044).
    runSql('select public.generate_vaccination_due_notifications();');
    await page.reload();
    await expect(page.getByText('No notifications yet.')).toBeVisible();
  } finally {
    await cleanup(seed);
  }
});

test('cancelling "Clear all" changes nothing', async ({ page }) => {
  const seed = await seedPair('D');
  try {
    await page.goto('/notifications');
    await expect(page.getByText(seed.message)).toBeVisible();

    await page.getByRole('button', { name: 'Clear all' }).click();
    const sheet = page.getByRole('dialog', { name: 'Clear all notifications?' });
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByText(seed.message)).toBeVisible();
    expect(await noticeRows(seed.message)).toHaveLength(1);
  } finally {
    await cleanup(seed);
  }
});
