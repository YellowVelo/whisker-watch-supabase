// Integration tests for the deployed delete-pet Edge Function, run
// against wysker-watch-dev over HTTP (see _shared/testHelpers.ts for the
// required env vars and why this calls the deployed function instead of
// importing the handler in-process).
//
// Every test creates its own throwaway auth users via the service-role
// admin client and cleans them up afterward — nothing here touches the
// shared test1@/test2@/demo1@ identities (see account-guard tests in
// delete-account/index.test.ts for those).
//
// Run: deno test --allow-net --allow-env supabase/functions/delete-pet/index.test.ts

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  adminClient,
  callFunction,
  createScratchUser,
  deleteScratchUser,
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

Deno.test('delete-pet: sole owner delete permanently removes the pet', async () => {
  const owner = await createScratchUser('sole-owner');
  try {
    const petId = await createPet(owner, 'Scratch Sole Pet');

    const { status, json } = await callFunction('delete-pet', owner.accessToken, { pet_id: petId });

    assertEquals(status, 200);
    assertEquals(json.success, true);
    assertEquals(json.mode, 'deleted');

    const admin = adminClient();
    const { data: petAfter } = await admin.from('pets').select('id').eq('id', petId).maybeSingle();
    assertEquals(petAfter, null);
  } finally {
    await deleteScratchUser(owner.userId);
  }
});

Deno.test('delete-pet: caller with no relationship to the pet gets 403', async () => {
  const owner = await createScratchUser('no-access-owner');
  const stranger = await createScratchUser('no-access-stranger');
  try {
    const petId = await createPet(owner, 'Scratch Guarded Pet');

    const { status, json } = await callFunction('delete-pet', stranger.accessToken, { pet_id: petId });

    assertEquals(status, 403);
    assertExists(json.error);

    const admin = adminClient();
    const { data: petAfter } = await admin.from('pets').select('id').eq('id', petId).maybeSingle();
    assertExists(petAfter);
  } finally {
    await deleteScratchUser(owner.userId);
    await deleteScratchUser(stranger.userId);
  }
});

Deno.test('delete-pet: primary owner with a linked co-owner transfers ownership', async () => {
  const owner = await createScratchUser('transfer-owner');
  const coOwner = await createScratchUser('transfer-coowner');
  try {
    const petId = await createPet(owner, 'Scratch Transfer Pet');
    await linkCoOwner(owner, coOwner, petId);

    const { status, json } = await callFunction('delete-pet', owner.accessToken, { pet_id: petId });

    assertEquals(status, 200);
    assertEquals(json.mode, 'transferred');

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
    // Owner no longer owns the pet, so deleting them first is safe;
    // deleting coOwner cleans up the pet via cascade.
    await deleteScratchUser(owner.userId);
    await deleteScratchUser(coOwner.userId);
  }
});

Deno.test('delete-pet: non-primary co-owner leaving removes only their access', async () => {
  const owner = await createScratchUser('leave-owner');
  const coOwner = await createScratchUser('leave-coowner');
  try {
    const petId = await createPet(owner, 'Scratch Leave Pet');
    await linkCoOwner(owner, coOwner, petId);

    const { status, json } = await callFunction('delete-pet', coOwner.accessToken, { pet_id: petId });

    assertEquals(status, 200);
    assertEquals(json.mode, 'left');

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
  } finally {
    await deleteScratchUser(owner.userId);
    await deleteScratchUser(coOwner.userId);
  }
});
