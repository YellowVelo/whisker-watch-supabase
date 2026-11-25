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

Deno.test('delete-pet: removes the photo and unshared scans; keeps a scan another pet uses (spec 0071/0075)', async () => {
  const owner = await createScratchUser('photo-owner');
  const admin = adminClient();
  // A valid 1x1 PNG.
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
    (c) => c.charCodeAt(0),
  );
  try {
    const photoPath = `${owner.userId}/photo.png`;
    const ownDocPath = `${owner.userId}/scan.png`;
    const sharedDocPath = `${owner.userId}/shared-scan.png`;
    for (const path of [photoPath, ownDocPath, sharedDocPath]) {
      const { error } = await owner.client.storage.from('uploads').upload(path, png, { contentType: 'image/png' });
      if (error) throw new Error(`upload failed: ${error.message}`);
    }
    const { data: pet, error: petError } = await owner.client
      .from('pets')
      .insert({ name: 'Scratch Photo Pet', created_by: owner.userId, photo_path: photoPath })
      .select('id')
      .single();
    if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);
    const otherPetId = await createPet(owner, 'Scratch Other Pet');
    const { error: linkError } = await owner.client.from('pet_documents').insert([
      { pet_id: pet.id, storage_path: ownDocPath, kind: 'bloodwork' },
      { pet_id: pet.id, storage_path: sharedDocPath, kind: 'vaccination' },
      { pet_id: otherPetId, storage_path: sharedDocPath, kind: 'vaccination' },
    ]);
    if (linkError) throw new Error(`document link failed: ${linkError.message}`);

    const { status, json } = await callFunction('delete-pet', owner.accessToken, { pet_id: pet.id });
    assertEquals(status, 200);
    assertEquals(json.mode, 'deleted');

    const { data: files } = await admin.storage.from('uploads').list(owner.userId);
    const names = (files ?? []).map((f: { name: string }) => f.name);
    assertEquals(names.includes('photo.png'), false, 'the pet photo file is removed with the pet');
    assertEquals(names.includes('scan.png'), false, 'a scan only this pet used is removed with it');
    assertEquals(names.includes('shared-scan.png'), true, 'a scan the other pet still uses is kept');

    const { data: links } = await admin.from('pet_documents').select('id').eq('pet_id', pet.id);
    assertEquals(links?.length ?? 0, 0, 'document links are removed with the pet');
    const { data: otherLinks } = await admin.from('pet_documents').select('id').eq('pet_id', otherPetId);
    assertEquals(otherLinks?.length ?? 0, 1, "the other pet's link to the shared scan stays");
  } finally {
    const { data: files } = await admin.storage.from('uploads').list(owner.userId);
    if (files?.length) await admin.storage.from('uploads').remove(files.map((f: { name: string }) => `${owner.userId}/${f.name}`));
    await deleteScratchUser(owner.userId);
  }
});

Deno.test("delete-pet: keeps a photo another pet still uses as its photo or a scan (spec 0083 AC3)", async () => {
  const owner = await createScratchUser('inuse-owner');
  const other = await createScratchUser('inuse-other');
  const admin = adminClient();
  // A valid 1x1 PNG.
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
    (c) => c.charCodeAt(0),
  );
  const sharedAsPhoto = `${owner.userId}/photo-shared-as-photo.png`;
  const sharedAsScan = `${owner.userId}/photo-shared-as-scan.png`;
  const unshared = `${owner.userId}/photo-unshared.png`;
  try {
    for (const path of [sharedAsPhoto, sharedAsScan, unshared]) {
      const { error } = await owner.client.storage.from('uploads').upload(path, png, { contentType: 'image/png' });
      if (error) throw new Error(`upload failed: ${error.message}`);
    }

    // The owner's three sole-owner pets, each with its own photo file.
    const ownerPet = async (name: string, photo_path: string): Promise<string> => {
      const { data, error } = await owner.client.from('pets')
        .insert({ name, created_by: owner.userId, photo_path }).select('id').single();
      if (error || !data) throw new Error(`pet insert failed: ${error?.message}`);
      return data.id as string;
    };
    const petA = await ownerPet('Scratch InUse Photo Pet', sharedAsPhoto);
    const petB = await ownerPet('Scratch InUse Scan Pet', sharedAsScan);
    const petC = await ownerPet('Scratch Unshared Pet', unshared);

    // Someone else's pets pointing at the owner's files. Seeded with the
    // admin client, because migration 0062 now refuses this as a user.
    const { data: otherPet, error: otherError } = await admin.from('pets')
      .insert({ name: 'Scratch Other Photo Pet', created_by: other.userId, photo_path: sharedAsPhoto })
      .select('id').single();
    if (otherError || !otherPet) throw new Error(`other pet insert failed: ${otherError?.message}`);
    const { data: otherDocPet, error: otherDocError } = await admin.from('pets')
      .insert({ name: 'Scratch Other Scan Pet', created_by: other.userId })
      .select('id').single();
    if (otherDocError || !otherDocPet) throw new Error(`other pet insert failed: ${otherDocError?.message}`);
    // petB's own scan row with the same path, so the check must exclude it.
    const { error: docError } = await admin.from('pet_documents').insert([
      { pet_id: otherDocPet.id, storage_path: sharedAsScan, kind: 'vaccination' },
      { pet_id: petB, storage_path: sharedAsScan, kind: 'vaccination' },
    ]);
    if (docError) throw new Error(`document link failed: ${docError.message}`);

    for (const petId of [petA, petB, petC]) {
      const { status, json } = await callFunction('delete-pet', owner.accessToken, { pet_id: petId });
      assertEquals(status, 200);
      assertEquals(json.mode, 'deleted');
      const { data: petAfter } = await admin.from('pets').select('id').eq('id', petId).maybeSingle();
      assertEquals(petAfter, null);
    }

    const { data: files } = await admin.storage.from('uploads').list(owner.userId);
    const names = (files ?? []).map((f: { name: string }) => f.name);
    assertEquals(names.includes('photo-shared-as-photo.png'), true, "a photo another pet uses as its photo is kept");
    assertEquals(names.includes('photo-shared-as-scan.png'), true, "a photo another pet's scan record uses is kept");
    assertEquals(names.includes('photo-unshared.png'), false, 'a photo nobody else uses is still deleted');
  } finally {
    const { data: files } = await admin.storage.from('uploads').list(owner.userId);
    if (files?.length) await admin.storage.from('uploads').remove(files.map((f: { name: string }) => `${owner.userId}/${f.name}`));
    await deleteScratchUser(owner.userId);
    await deleteScratchUser(other.userId);
  }
});

Deno.test('delete-pet: keeps a scan file another pet uses as its photo (spec 0083 FR3)', async () => {
  const owner = await createScratchUser('scan-photo-owner');
  const other = await createScratchUser('scan-photo-other');
  const admin = adminClient();
  // A valid 1x1 PNG.
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
    (c) => c.charCodeAt(0),
  );
  const scanUsedAsPhoto = `${owner.userId}/scan-used-as-photo.png`;
  const scanUnused = `${owner.userId}/scan-unused.png`;
  try {
    for (const path of [scanUsedAsPhoto, scanUnused]) {
      const { error } = await owner.client.storage.from('uploads').upload(path, png, { contentType: 'image/png' });
      if (error) throw new Error(`upload failed: ${error.message}`);
    }

    const petId = await createPet(owner, 'Scratch Scan Photo Pet');
    const { error: docError } = await admin.from('pet_documents').insert([
      { pet_id: petId, storage_path: scanUsedAsPhoto, kind: 'vaccination' },
      { pet_id: petId, storage_path: scanUnused, kind: 'vaccination' },
    ]);
    if (docError) throw new Error(`document link failed: ${docError.message}`);

    // Someone else's pet using the scan file as its photo. Seeded with the
    // admin client, because migration 0062 refuses this as a user.
    const { error: otherError } = await admin.from('pets')
      .insert({ name: 'Scratch Other Scan Photo Pet', created_by: other.userId, photo_path: scanUsedAsPhoto });
    if (otherError) throw new Error(`other pet insert failed: ${otherError.message}`);

    const { status, json } = await callFunction('delete-pet', owner.accessToken, { pet_id: petId });
    assertEquals(status, 200);
    assertEquals(json.mode, 'deleted');

    const { data: files } = await admin.storage.from('uploads').list(owner.userId);
    const names = (files ?? []).map((f: { name: string }) => f.name);
    assertEquals(names.includes('scan-used-as-photo.png'), true, 'a scan another pet uses as its photo is kept');
    assertEquals(names.includes('scan-unused.png'), false, 'a scan nobody else uses is deleted');
  } finally {
    const { data: files } = await admin.storage.from('uploads').list(owner.userId);
    if (files?.length) await admin.storage.from('uploads').remove(files.map((f: { name: string }) => `${owner.userId}/${f.name}`));
    await deleteScratchUser(owner.userId);
    await deleteScratchUser(other.userId);
  }
});

Deno.test('delete-pet: transfer keeps every other co-owner and passes the pet sit on (spec 0075)', async () => {
  const owner = await createScratchUser('transfer3-owner');
  const first = await createScratchUser('transfer3-first');
  const second = await createScratchUser('transfer3-second');
  const admin = adminClient();
  try {
    const petId = await createPet(owner, 'Scratch Transfer3 Pet');
    const keptPetId = await createPet(owner, 'Scratch Kept Pet');
    await linkCoOwner(owner, first, petId);
    await linkCoOwner(owner, second, petId);

    const { data: soloSit, error: sitError } = await admin.from('pet_sits')
      .insert({ created_by: owner.userId, pet_ids: [petId], start_date: '2030-01-01', end_date: '2030-01-05' })
      .select('id').single();
    if (sitError || !soloSit) throw new Error(`sit insert failed: ${sitError?.message}`);
    const { data: mixedSit, error: mixedError } = await admin.from('pet_sits')
      .insert({ created_by: owner.userId, pet_ids: [petId, keptPetId], start_date: '2030-02-01', end_date: '2030-02-05' })
      .select('id').single();
    if (mixedError || !mixedSit) throw new Error(`sit insert failed: ${mixedError?.message}`);

    const { status, json } = await callFunction('delete-pet', owner.accessToken, { pet_id: petId });
    assertEquals(status, 200);
    assertEquals(json.mode, 'transferred');

    const { data: petAfter } = await admin.from('pets').select('created_by').eq('id', petId).single();
    assertEquals(petAfter?.created_by, first.userId, 'the oldest co-owner becomes primary');

    const { data: secondRow } = await admin.from('pet_co_owners').select('owner_id')
      .eq('pet_id', petId).eq('co_owner_user_id', second.userId).maybeSingle();
    assertEquals(secondRow?.owner_id, first.userId, 'the other co-owner keeps access, under the new owner');
    const { data: secondSees } = await second.client.from('pets').select('id').eq('id', petId);
    assertEquals(secondSees?.length, 1, 'the other co-owner can still open the pet');

    const { data: soloAfter } = await admin.from('pet_sits').select('created_by').eq('id', soloSit.id).single();
    assertEquals(soloAfter?.created_by, first.userId, "a sit for only this pet passes to the new owner");
    const { data: mixedAfter } = await admin.from('pet_sits').select('created_by, pet_ids').eq('id', mixedSit.id).single();
    assertEquals(mixedAfter?.created_by, owner.userId, 'a sit that also covers a kept pet stays put');
    assertEquals(mixedAfter?.pet_ids, [keptPetId], '...with only the kept pet left in it');
  } finally {
    await deleteScratchUser(owner.userId);
    await deleteScratchUser(first.userId);
    await deleteScratchUser(second.userId);
  }
});
