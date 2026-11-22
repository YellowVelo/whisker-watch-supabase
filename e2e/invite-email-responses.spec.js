// Spec 0077 (punch list PA-10): what the invite dialogs say for the invite
// functions' replies, and that re-inviting someone who hasn't accepted yet
// resends instead of stopping at "Already a co-owner."
//
// Runs as test1@ (the suite's shared session, CI-safe). The invite functions
// are never actually called: page.route() answers the function request in
// the browser, so no email is sent and the real rate limit is never touched.
// Setup uses test1@'s own signed-in client (same calls the app makes). Each
// test makes and deletes its own pet (and sit).

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

// Answers the named Edge Function with a fixed reply and counts the calls.
async function stubFunction(page, name, status, body) {
  const calls = { count: 0, bodies: [] };
  await page.route(`**/functions/v1/${name}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, body: 'ok' });
    calls.count += 1;
    calls.bodies.push(route.request().postDataJSON());
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

const RATE_LIMITED = { error: "You've sent a lot of invites in the last hour. Try again later." };

test.describe('Invite dialogs: replies from the invite functions', () => {
  let owner;
  let petId;
  let sitId;
  const stamp = Date.now();
  const petName = `E2E Invite Reply Pet ${stamp}`;
  const sitterName = `E2E Invite Reply Sitter ${stamp}`;

  test.beforeEach(async () => {
    owner = await signedInClient(process.env.PLAYWRIGHT_TEST1_EMAIL, process.env.PLAYWRIGHT_TEST1_PASSWORD);
    const { data: pet, error } = await owner.client
      .from('pets')
      .insert({ name: petName, species: 'Cat', created_by: owner.userId })
      .select('id')
      .single();
    if (error) throw new Error(`could not create test pet: ${error.message}`);
    petId = pet.id;
    sitId = null;
  });

  // Sit first: only someone who owns every pet in a sit can delete it.
  test.afterEach(async () => {
    if (sitId) await owner.client.from('pet_sits').delete().eq('id', sitId);
    if (petId) await owner.client.from('pets').delete().eq('id', petId);
  });

  async function openCoOwnerDialog(page) {
    await page.goto(`/pet/${petId}/edit`);
    await page.getByRole('button', { name: 'Invite Co-Owner' }).click();
    return page.getByRole('dialog');
  }

  test('co-owner: a rate-limited reply shows the rate-limit message (AC12)', async ({ page }) => {
    const invitee = `e2e-co-rate-${stamp}@example.com`;
    const calls = await stubFunction(page, 'invite-co-owner', 429, RATE_LIMITED);
    const dialog = await openCoOwnerDialog(page);
    await dialog.getByPlaceholder('partner@email.com').fill(invitee);
    await dialog.getByRole('button', { name: 'Invite' }).click();

    await expect(dialog.getByText(
      `${invitee} added as co-owner, but you've sent a lot of invites in the last hour, so we couldn't email them yet. Try inviting them again in an hour.`,
    )).toBeVisible();
    expect(calls.count).toBe(1);
    expect(calls.bodies[0]).not.toHaveProperty('petName');
  });

  test('co-owner: re-inviting someone who has not accepted resends; it is listed once (AC13)', async ({ page }) => {
    const invitee = `e2e-co-resend-${stamp}@example.com`;
    const { error } = await owner.client
      .from('pet_co_owners')
      .insert({ pet_id: petId, owner_id: owner.userId, created_by: owner.userId, co_owner_email: invitee });
    if (error) throw new Error(`could not create invite: ${error.message}`);

    const calls = await stubFunction(page, 'invite-co-owner', 200, { sent: true });
    const dialog = await openCoOwnerDialog(page);
    await expect(dialog.getByText(invitee)).toBeVisible();
    await dialog.getByPlaceholder('partner@email.com').fill(invitee);
    await dialog.getByRole('button', { name: 'Invite' }).click();

    await expect(dialog.getByText(`Invite sent to ${invitee}!`)).toBeVisible();
    await expect(dialog.getByText('Already a co-owner.')).toHaveCount(0);
    expect(calls.count).toBe(1);
    const { data: rows } = await owner.client.from('pet_co_owners').select('id').eq('pet_id', petId);
    expect(rows).toHaveLength(1);
  });

  test('sitter: a rate-limited reply shows the rate-limit message (AC12)', async ({ page }) => {
    const invitee = `e2e-sit-rate-${stamp}@example.com`;
    const today = new Date().toISOString().slice(0, 10);
    const { data: sit, error } = await owner.client
      .from('pet_sits')
      .insert({ created_by: owner.userId, pet_ids: [petId], sitter_name: sitterName, start_date: today, end_date: today })
      .select('id')
      .single();
    if (error) throw new Error(`could not create test sit: ${error.message}`);
    sitId = sit.id;

    await stubFunction(page, 'invite-sitter', 429, RATE_LIMITED);
    await page.goto('/pet-sitter');
    await page.locator('div.rounded-xl', { hasText: sitterName }).getByTitle('Share with sitter').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('sitter@email.com').fill(invitee);
    await dialog.getByRole('button', { name: 'Invite' }).click();

    await expect(dialog.getByText(
      `${invitee} added as a sitter, but you've sent a lot of invites in the last hour, so we couldn't email them yet. Try inviting them again in an hour.`,
    )).toBeVisible();
  });
});
