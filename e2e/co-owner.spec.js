// Spec 0072 (punch list PA-02): the co-owner list on Edit Pet. Only the
// primary owner can invite or remove co-owners (enforced by migration 0056);
// co-owners get a read-only list. The database rules themselves are tested
// in supabase/tests/co_owner_access.test.ts — this file covers what a person
// sees and clicks.
//
// Every test makes its own throwaway "E2E CoOwner" pet and deletes it
// afterward, so tests don't depend on test1@'s real pets or on each other.
// Everything is seeded through normal signed-in sessions (no service-role
// key, no CLI): a primary owner may add an email-only co-owner row, and the
// invitee links it with claim_pending_co_owner_invites(), the same calls the
// app makes. Seeding through the dialog itself is avoided because Invite
// also calls the invite-co-owner Edge Function, which creates a real auth
// account for the invited address.
import { test, expect, deleteTestPet } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

async function signedInClient(email, password) {
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return { client, userId: data.user.id, email };
}

async function createPet(owner, name) {
  const { data, error } = await owner.client
    .from('pets')
    .insert({ name, species: 'Dog', created_by: owner.userId })
    .select('id')
    .single();
  if (error) throw new Error(`could not create test pet: ${error.message}`);
  return data.id;
}

async function addPendingCoOwner(owner, petId, email) {
  const { error } = await owner.client
    .from('pet_co_owners')
    .insert({ pet_id: petId, owner_id: owner.userId, created_by: owner.userId, co_owner_email: email });
  if (error) throw new Error(`could not add co-owner row: ${error.message}`);
}

async function deletePet(owner, petId) {
  await deleteTestPet(owner.client, petId);
}

test.describe('as the primary owner', () => {
  let owner;
  let petId;
  const petName = `E2E CoOwner Pet ${Date.now()}`;
  const invitee = `e2e-coowner-${Date.now()}@example.com`;

  test.beforeEach(async () => {
    owner = await signedInClient(process.env.PLAYWRIGHT_TEST1_EMAIL, process.env.PLAYWRIGHT_TEST1_PASSWORD);
    petId = await createPet(owner, petName);
  });

  test.afterEach(async () => {
    await deletePet(owner, petId);
  });

  test('removing a co-owner asks first; Cancel keeps them, Remove takes them off (AC11)', async ({ page }) => {
    await addPendingCoOwner(owner, petId, invitee);

    await page.goto(`/pet/${petId}/edit`);
    await page.getByRole('button', { name: 'Invite Co-Owner' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(invitee)).toBeVisible();

    await dialog.getByRole('button', { name: `Remove ${invitee}` }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText(`Remove ${invitee} as a co-owner?`)).toBeVisible();
    await expect(confirm.getByText(`They'll lose access to ${petName}'s profile and records right away.`, { exact: false })).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByText(invitee)).toBeVisible();

    await dialog.getByRole('button', { name: `Remove ${invitee}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(dialog.getByText(invitee)).toHaveCount(0);
    await expect(dialog.getByText("No co-owners yet — it's just you.")).toBeVisible();

    const { data: rows } = await owner.client.from('pet_co_owners').select('id').eq('pet_id', petId);
    expect(rows ?? []).toHaveLength(0);
  });

  test('a refused invite shows an error instead of hanging (AC9)', async ({ page }) => {
    // Stand in for the database refusing the insert (migration 0056) by
    // failing the request itself; the Edge Function is never reached.
    await page.route('**/rest/v1/pet_co_owners*', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) })
        : route.continue(),
    );

    await page.goto(`/pet/${petId}/edit`);
    await page.getByRole('button', { name: 'Invite Co-Owner' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('partner@email.com').fill(invitee);
    await dialog.getByRole('button', { name: 'Invite' }).click();

    await expect(dialog.getByText("We couldn't add that co-owner. Please try again.")).toBeVisible();
    await dialog.getByPlaceholder('partner@email.com').fill(`again-${invitee}`);
    await expect(dialog.getByRole('button', { name: 'Invite' })).toBeEnabled();
  });
});

test.describe('as a co-owner', () => {
  // coowner1@ is a manual test inbox (spec 0070) whose dev login lives in
  // .env.playwright; CI has no secret for it, so this is local-only.
  test.skip(!process.env.COOWNER1_EMAIL || !process.env.COOWNER1_PASSWORD, 'Needs the coowner1@ dev login from .env.playwright (not available in CI).');

  let primary;
  let petId;
  const petName = `E2E CoOwner Shared Pet ${Date.now()}`;

  test.beforeEach(async () => {
    primary = await signedInClient(process.env.COOWNER1_EMAIL, process.env.COOWNER1_PASSWORD);
    petId = await createPet(primary, petName);
    await addPendingCoOwner(primary, petId, process.env.PLAYWRIGHT_TEST1_EMAIL.toLowerCase());
    await addPendingCoOwner(primary, petId, `e2e-other-${Date.now()}@example.com`);
    const test1 = await signedInClient(process.env.PLAYWRIGHT_TEST1_EMAIL, process.env.PLAYWRIGHT_TEST1_PASSWORD);
    const { error } = await test1.client.rpc('claim_pending_co_owner_invites');
    if (error) throw new Error(`test1@ could not claim the invite: ${error.message}`);
  });

  test.afterEach(async () => {
    await deletePet(primary, petId);
  });

  test('co-owners see the full list read-only, with no invite or remove controls (AC5)', async ({ page }) => {
    await page.goto(`/pet/${petId}/edit`);
    await expect(page.getByRole('button', { name: 'Invite Co-Owner' })).toHaveCount(0);
    await page.getByRole('button', { name: 'View Co-Owners' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Only the primary owner can add or remove co-owners.')).toBeVisible();
    await expect(dialog.getByText(/^e2e-other-/)).toBeVisible();
    await expect(dialog.getByText(process.env.PLAYWRIGHT_TEST1_EMAIL.toLowerCase())).toBeVisible();
    await expect(dialog.getByPlaceholder('partner@email.com')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  });
});
