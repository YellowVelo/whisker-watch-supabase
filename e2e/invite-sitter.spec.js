// Spec 0073 (punch list PA-53/PA-54): the Share with Sitter dialog lists
// invited sitters as soon as it opens, removes them through a full-size
// button with a confirmation, and shows an error instead of hanging when an
// invite can't be saved.
//
// Runs as test1@ (the suite's shared session). Setup uses test1@'s own
// signed-in client, making the same calls the app does (create a pet, a sit
// and an email-only invite), so no privileged access is needed. Each test
// makes and deletes its own pet; the sit and invite cascade away with it.

import { test, expect } from './fixtures.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

async function signedInClient(email, password) {
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return { client, userId: data.user.id };
}

test.describe('Share with Sitter dialog', () => {
  let owner;
  let petId;
  let sitId;
  const stamp = Date.now();
  const sitterName = `E2E Invite Sitter ${stamp}`;
  const invitee = `e2e-sitter-${stamp}@example.com`;

  test.beforeEach(async () => {
    owner = await signedInClient(process.env.PLAYWRIGHT_TEST1_EMAIL, process.env.PLAYWRIGHT_TEST1_PASSWORD);
    const { data: pet, error: petError } = await owner.client
      .from('pets')
      .insert({ name: `E2E Sitter Pet ${stamp}`, species: 'Cat', created_by: owner.userId })
      .select('id')
      .single();
    if (petError) throw new Error(`could not create test pet: ${petError.message}`);
    petId = pet.id;

    const today = new Date().toISOString().slice(0, 10);
    const { data: sit, error: sitError } = await owner.client
      .from('pet_sits')
      .insert({ created_by: owner.userId, pet_ids: [petId], sitter_name: sitterName, start_date: today, end_date: today })
      .select('id')
      .single();
    if (sitError) throw new Error(`could not create test sit: ${sitError.message}`);
    sitId = sit.id;
  });

  test.afterEach(async () => {
    if (petId) await owner.client.from('pets').delete().eq('id', petId);
    if (sitId) await owner.client.from('pet_sits').delete().eq('id', sitId);
  });

  async function openShareDialog(page) {
    await page.goto('/pet-sitter');
    const card = page.locator('div.rounded-xl', { hasText: sitterName });
    await card.getByTitle('Share with sitter').click();
    return page.getByRole('dialog');
  }

  test('lists an invited sitter on open; remove asks first, then removes (AC10)', async ({ page }) => {
    const { error } = await owner.client.from('pet_sitter_access').insert({
      pet_sit_id: sitId, owner_id: owner.userId, created_by: owner.userId, sitter_email: invitee,
    });
    if (error) throw new Error(`could not create invite: ${error.message}`);

    const dialog = await openShareDialog(page);
    await expect(dialog.getByText(invitee)).toBeVisible();

    const remove = dialog.getByRole('button', { name: `Remove ${invitee}` });
    const box = await remove.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await remove.click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText('Remove this sitter?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByText(invitee)).toBeVisible();

    await remove.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(dialog.getByText(invitee)).toHaveCount(0);
    await expect(dialog.getByText('No sitters invited to this sit yet.')).toBeVisible();

    const { data: rows } = await owner.client.from('pet_sitter_access').select('id').eq('pet_sit_id', sitId);
    expect(rows ?? []).toHaveLength(0);
  });

  test('a refused invite shows an error instead of hanging (AC11)', async ({ page }) => {
    // Stand in for the database refusing the insert (migration 0057) by
    // failing the request itself; the Edge Function is never reached.
    await page.route('**/rest/v1/pet_sitter_access*', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) })
        : route.continue(),
    );

    const dialog = await openShareDialog(page);
    await dialog.getByPlaceholder('sitter@email.com').fill(invitee);
    await dialog.getByRole('button', { name: 'Invite' }).click();

    await expect(dialog.getByText("Couldn't save this invite. Please try again.")).toBeVisible();
    await dialog.getByPlaceholder('sitter@email.com').fill(`again-${invitee}`);
    await expect(dialog.getByRole('button', { name: 'Invite' })).toBeEnabled();
  });
});
