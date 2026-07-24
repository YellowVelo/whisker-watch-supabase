// Integration tests for the deployed delete-account Edge Function, run
// against wysker-watch-dev over HTTP (see _shared/testHelpers.ts for the
// required env vars).
//
// Two kinds of accounts are used here, deliberately:
//   - Throwaway scratch accounts (account_type='production') for the
//     happy-path deletion mechanics — these are meant to be destroyed by
//     the test, that's the point.
//   - The real, shared test2@wyskerwatch.com account, ONLY to prove the
//     account_type='test'/'demo' guard actually refuses the call and
//     leaves the account intact. This test must never let that account
//     actually get deleted — if the guard assertion ever starts failing,
//     stop and fix the guard before re-running against a real project.
//
// Run: deno test --allow-net --allow-env supabase/functions/delete-account/index.test.ts

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  adminClient,
  callFunction,
  createScratchUser,
  deleteScratchUser,
  requireEnv,
  signIn,
  type ScratchUser,
} from '../_shared/testHelpers.ts';

async function createPet(owner: ScratchUser, name: string): Promise<string> {
  const { data, error } = await owner.client.from('pets').insert({ name, created_by: owner.userId }).select('id').single();
  if (error || !data) throw new Error(`Failed to create pet: ${error?.message}`);
  return data.id as string;
}

async function linkCoOwner(owner: ScratchUser, coOwner: ScratchUser, petId: string): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('pet_co_owners').insert({
    pet_id: petId,
    owner_id: owner.userId,
    created_by: owner.userId,
    co_owner_email: coOwner.email,
    co_owner_user_id: coOwner.userId,
  });
  if (error) throw new Error(`Failed to link co-owner: ${error.message}`);
}

Deno.test('delete-account: guard refuses for the test2@ account and leaves it intact', async () => {
  const test2 = await signIn(requireEnv('TEST2_EMAIL'), requireEnv('TEST2_PASSWORD'));

  const { status, json } = await callFunction('delete-account', test2.accessToken);

  assertEquals(status, 403);
  assertExists(json.error);

  // Confirm the account genuinely still exists and can still log in —
  // this is the whole point of the guard.
  const admin = adminClient();
  const { data: stillThere, error } = await admin.auth.admin.getUserById(test2.userId);
  assertEquals(error, null);
  assertExists(stillThere?.user);

  const reSignIn = await signIn(requireEnv('TEST2_EMAIL'), requireEnv('TEST2_PASSWORD'));
  assertEquals(reSignIn.userId, test2.userId);
});

Deno.test('delete-account: sole owner delete removes account, pets, and cascaded data', async () => {
  const owner = await createScratchUser('delacct-sole');
  let cleaned = false;
  try {
    const petId = await createPet(owner, 'Scratch Delacct Pet');

    const { status, json } = await callFunction('delete-account', owner.accessToken);

    assertEquals(status, 200);
    assertEquals(json.success, true);
    cleaned = true;

    const admin = adminClient();
    const { data: userAfter, error: userError } = await admin.auth.admin.getUserById(owner.userId);
    assertEquals(userAfter?.user ?? null, null);
    assertExists(userError);

    const { data: petAfter } = await admin.from('pets').select('id').eq('id', petId).maybeSingle();
    assertEquals(petAfter, null);
  } finally {
    if (!cleaned) await deleteScratchUser(owner.userId);
  }
});

Deno.test('delete-account: primary owner with a linked co-owner transfers ownership on deletion', async () => {
  const owner = await createScratchUser('delacct-transfer-owner');
  const coOwner = await createScratchUser('delacct-transfer-coowner');
  let ownerCleaned = false;
  try {
    const petId = await createPet(owner, 'Scratch Delacct Transfer Pet');
    await linkCoOwner(owner, coOwner, petId);

    const { status, json } = await callFunction('delete-account', owner.accessToken);
    assertEquals(status, 200);
    assertEquals(json.success, true);
    ownerCleaned = true;

    const admin = adminClient();
    const { data: petAfter } = await admin.from('pets').select('created_by').eq('id', petId).single();
    assertEquals(petAfter?.created_by, coOwner.userId);

    const { data: notif } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', coOwner.userId)
      .eq('type', 'ownership_transfer')
      .limit(1)
      .maybeSingle();
    assertExists(notif);
  } finally {
    if (!ownerCleaned) await deleteScratchUser(owner.userId);
    await deleteScratchUser(coOwner.userId);
  }
});

Deno.test('delete-account: co-owner deleting their own account leaves the pet with its primary owner', async () => {
  const owner = await createScratchUser('delacct-leave-owner');
  const coOwner = await createScratchUser('delacct-leave-coowner');
  let coOwnerCleaned = false;
  try {
    const petId = await createPet(owner, 'Scratch Delacct Leave Pet');
    await linkCoOwner(owner, coOwner, petId);

    const { status, json } = await callFunction('delete-account', coOwner.accessToken);
    assertEquals(status, 200);
    assertEquals(json.success, true);
    coOwnerCleaned = true;

    const admin = adminClient();
    const { data: petAfter } = await admin.from('pets').select('created_by').eq('id', petId).single();
    assertEquals(petAfter?.created_by, owner.userId);

    const { data: coOwnerRow } = await admin
      .from('pet_co_owners')
      .select('id')
      .eq('pet_id', petId)
      .eq('co_owner_user_id', coOwner.userId)
      .maybeSingle();
    assertEquals(coOwnerRow, null);

    const { data: notif } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', owner.userId)
      .eq('type', 'co_owner_removed')
      .limit(1)
      .maybeSingle();
    assertExists(notif);
  } finally {
    await deleteScratchUser(owner.userId);
    if (!coOwnerCleaned) await deleteScratchUser(coOwner.userId);
  }
});
