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

// A valid 1x1 PNG.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);

async function upload(user: ScratchUser, name: string): Promise<string> {
  const path = `${user.userId}/${name}`;
  const { error } = await user.client.storage.from('uploads').upload(path, PNG, { contentType: 'image/png' });
  if (error) throw new Error(`upload ${name} failed: ${error.message}`);
  return path;
}

// One check-in and one vaccination entered by `user` on `petId`, through
// the user's own session (RLS applies, as in the app).
async function enterRecords(user: ScratchUser, petId: string, daysAgo: number): Promise<void> {
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  const { error: ciError } = await user.client.from('daily_check_ins')
    .insert({ pet_id: petId, check_in_date: date, status: 'great', created_by: user.userId });
  if (ciError) throw new Error(`check-in insert failed: ${ciError.message}`);
  const { error: vError } = await user.client.from('vaccinations')
    .insert({ pet_id: petId, vaccine_name: `Scratch Vaccine ${daysAgo}`, created_by: user.userId });
  if (vError) throw new Error(`vaccination insert failed: ${vError.message}`);
}

async function folderNames(userId: string): Promise<string[]> {
  const { data } = await adminClient().storage.from('uploads').list(userId, { limit: 1000 });
  return (data ?? []).map((f: { name: string }) => f.name);
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

Deno.test('delete-account: 3-person household keeps every record, every co-owner, the files and the sit (spec 0075)', async () => {
  const owner = await createScratchUser('delacct3-owner');
  const first = await createScratchUser('delacct3-first');
  const second = await createScratchUser('delacct3-second');
  const sitter = await createScratchUser('delacct3-sitter');
  const admin = adminClient();
  let ownerCleaned = false;
  try {
    const photoPath = await upload(owner, 'photo.png');
    const docPath = await upload(owner, 'scan.png');
    const { data: pet, error: petError } = await owner.client.from('pets')
      .insert({ name: 'Scratch Household Pet', created_by: owner.userId, photo_path: photoPath })
      .select('id').single();
    if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);
    const petId = pet.id as string;
    const { error: docError } = await owner.client.from('pet_documents')
      .insert({ pet_id: petId, storage_path: docPath, kind: 'vaccination' });
    if (docError) throw new Error(`document link failed: ${docError.message}`);

    await linkCoOwner(owner, first, petId);
    await linkCoOwner(owner, second, petId);
    await enterRecords(owner, petId, 1);
    await enterRecords(first, petId, 2);
    await enterRecords(second, petId, 3);

    const { data: sit, error: sitError } = await admin.from('pet_sits')
      .insert({ created_by: owner.userId, pet_ids: [petId], start_date: '2030-03-01', end_date: '2030-03-05' })
      .select('id').single();
    if (sitError || !sit) throw new Error(`sit insert failed: ${sitError?.message}`);
    const { error: psaError } = await admin.from('pet_sitter_access').insert({
      pet_sit_id: sit.id, owner_id: owner.userId, created_by: owner.userId,
      sitter_email: sitter.email, sitter_user_id: sitter.userId,
    });
    if (psaError) throw new Error(`sitter invite insert failed: ${psaError.message}`);

    // A previous attempt that got through the database step and then
    // failed: the retry must not transfer or notify twice (AC9).
    const { error: prepError } = await admin.rpc('prepare_account_deletion', {
      p_user_id: owner.userId, p_folder_paths: [],
    });
    if (prepError) throw new Error(`prepare_account_deletion failed: ${prepError.message}`);

    const { status, json } = await callFunction('delete-account', owner.accessToken);
    assertEquals(status, 200, JSON.stringify(json));
    ownerCleaned = true;

    const { data: petAfter } = await admin.from('pets').select('created_by').eq('id', petId).single();
    assertEquals(petAfter?.created_by, first.userId, 'the oldest co-owner becomes primary');

    const { data: checkIns } = await admin.from('daily_check_ins').select('created_by').eq('pet_id', petId);
    const { data: vaccines } = await admin.from('vaccinations').select('created_by').eq('pet_id', petId);
    assertEquals(checkIns?.length, 3, "every check-in survives, including the departed owner's");
    assertEquals(vaccines?.length, 3, "every vaccination survives, including the departed owner's");
    assertEquals(checkIns?.filter((r) => r.created_by === null).length, 1, "the departed owner's entry has no name");

    const { data: secondSees } = await second.client.from('pets').select('id').eq('id', petId);
    assertEquals(secondSees?.length, 1, 'the second co-owner keeps access');
    const { data: secondRecords } = await second.client.from('vaccinations').select('id').eq('pet_id', petId);
    assertEquals(secondRecords?.length, 3, 'the second co-owner sees all records');

    for (const viewer of [first, second]) {
      for (const path of [photoPath, docPath]) {
        const { data, error } = await viewer.client.storage.from('uploads').createSignedUrl(path, 60);
        assertEquals(error, null, `${viewer.email} can open ${path}`);
        assertExists(data?.signedUrl);
      }
    }

    const { data: sitAfter } = await admin.from('pet_sits').select('created_by').eq('id', sit.id).single();
    assertEquals(sitAfter?.created_by, first.userId, 'the sit passes to the new owner');
    const { data: psaAfter } = await admin.from('pet_sitter_access').select('owner_id').eq('pet_sit_id', sit.id);
    assertEquals(psaAfter?.[0]?.owner_id, first.userId, 'the sitter invite survives, under the new owner');

    const { data: transfers } = await admin.from('notifications').select('id')
      .eq('user_id', first.userId).eq('type', 'ownership_transfer');
    assertEquals(transfers?.length, 1, 'exactly one transfer notification, despite the retry');
  } finally {
    for (const u of [owner, first, second]) {
      const names = await folderNames(u.userId);
      if (names.length) await admin.storage.from('uploads').remove(names.map((n) => `${u.userId}/${n}`));
    }
    if (!ownerCleaned) await deleteScratchUser(owner.userId);
    await deleteScratchUser(first.userId);
    await deleteScratchUser(second.userId);
    await deleteScratchUser(sitter.userId);
  }
});

Deno.test("delete-account: a departing co-owner's records stay with the pet (spec 0075)", async () => {
  const owner = await createScratchUser('delacct-rec-owner');
  const coOwner = await createScratchUser('delacct-rec-coowner');
  const admin = adminClient();
  let coOwnerCleaned = false;
  try {
    const petId = await createPet(owner, 'Scratch Records Pet');
    await linkCoOwner(owner, coOwner, petId);
    await enterRecords(coOwner, petId, 1);

    const { status } = await callFunction('delete-account', coOwner.accessToken);
    assertEquals(status, 200);
    coOwnerCleaned = true;

    const { data: vaccines } = await admin.from('vaccinations').select('created_by').eq('pet_id', petId);
    assertEquals(vaccines?.length, 1, "the co-owner's vaccination survives");
    assertEquals(vaccines?.[0]?.created_by, null);
    const { data: checkIns } = await owner.client.from('daily_check_ins').select('id').eq('pet_id', petId);
    assertEquals(checkIns?.length, 1, "the owner still sees the co-owner's check-in");
  } finally {
    await deleteScratchUser(owner.userId);
    if (!coOwnerCleaned) await deleteScratchUser(coOwner.userId);
  }
});

Deno.test('delete-account: deletes a solo pet\'s files and every file in the folder, past 100 (spec 0075)', async () => {
  const owner = await createScratchUser('delacct-files');
  const admin = adminClient();
  let cleaned = false;
  try {
    const photoPath = await upload(owner, 'photo.png');
    const docPath = await upload(owner, 'scan.png');
    for (let i = 0; i < 101; i++) await upload(owner, `extra-${String(i).padStart(3, '0')}.png`);
    const { data: pet, error: petError } = await owner.client.from('pets')
      .insert({ name: 'Scratch Files Pet', created_by: owner.userId, photo_path: photoPath })
      .select('id').single();
    if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);
    await owner.client.from('pet_documents').insert({ pet_id: pet.id, storage_path: docPath, kind: 'bloodwork' });
    assertEquals((await folderNames(owner.userId)).length, 103);

    const { status } = await callFunction('delete-account', owner.accessToken);
    assertEquals(status, 200);
    cleaned = true;

    assertEquals(await folderNames(owner.userId), [], 'every file is gone');
    const { data: petAfter } = await admin.from('pets').select('id').eq('id', pet.id).maybeSingle();
    assertEquals(petAfter, null);
  } finally {
    const names = await folderNames(owner.userId);
    if (names.length) await admin.storage.from('uploads').remove(names.map((n) => `${owner.userId}/${n}`));
    if (!cleaned) await deleteScratchUser(owner.userId);
  }
});

Deno.test('delete-account: a sitter deleting their account removes their invite (spec 0075)', async () => {
  const owner = await createScratchUser('delacct-sit-owner');
  const sitter = await createScratchUser('delacct-sit-sitter');
  const admin = adminClient();
  let sitterCleaned = false;
  try {
    const petId = await createPet(owner, 'Scratch Sitter Pet');
    const { data: sit } = await admin.from('pet_sits')
      .insert({ created_by: owner.userId, pet_ids: [petId], start_date: '2030-04-01', end_date: '2030-04-02' })
      .select('id').single();
    await admin.from('pet_sitter_access').insert({
      pet_sit_id: sit!.id, owner_id: owner.userId, created_by: owner.userId,
      sitter_email: sitter.email, sitter_user_id: sitter.userId,
    });

    const { status } = await callFunction('delete-account', sitter.accessToken);
    assertEquals(status, 200);
    sitterCleaned = true;

    const { data: invites } = await admin.from('pet_sitter_access').select('id').eq('pet_sit_id', sit!.id);
    assertEquals(invites?.length, 0, 'the invite row is removed, not just unlinked');
  } finally {
    await deleteScratchUser(owner.userId);
    if (!sitterCleaned) await deleteScratchUser(sitter.userId);
  }
});
