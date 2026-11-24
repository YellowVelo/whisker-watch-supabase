// Integration tests for spec 0071 (punch list PA-01): the private uploads
// bucket, its read rule (migration 0054), the pet_documents table, the
// bucket's size/type limits, and ask-vet-assistant's file checks. Run
// against wysker-watch-dev, which must already be on Phase 2 (0055): with
// the old public-read rule still in place, every "refused" check below
// would wrongly pass.
//
// Every test builds its own household of throwaway scratch users (owner,
// co-owner, sitter, stranger — see _shared/testHelpers.ts) and removes
// their files and accounts afterward, so tests don't depend on each other
// or on the shared test1@/test2@ identities.
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/private_uploads.test.ts

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  adminClient,
  callFunction,
  createScratchUser,
  deleteScratchUser,
  requireEnv,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

// A valid 1x1 PNG.
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);

interface Household {
  owner: ScratchUser;
  coOwner: ScratchUser;
  sitter: ScratchUser;
  stranger: ScratchUser;
  petId: string;
  photoPath: string;
  docPath: string;
}

async function upload(user: ScratchUser, name: string, bytes: Uint8Array, contentType: string) {
  const path = `${user.userId}/${name}`;
  const { error } = await user.client.storage.from('uploads').upload(path, bytes, { contentType });
  return { path, error };
}

async function buildHousehold(label: string): Promise<Household> {
  const [owner, coOwner, sitter, stranger] = await Promise.all([
    createScratchUser(`${label}-owner`),
    createScratchUser(`${label}-coowner`),
    createScratchUser(`${label}-sitter`),
    createScratchUser(`${label}-stranger`),
  ]);
  const admin = adminClient();

  const photo = await upload(owner, 'photo.png', PNG_BYTES, 'image/png');
  if (photo.error) throw new Error(`photo upload failed: ${photo.error.message}`);
  const doc = await upload(owner, 'scan.png', PNG_BYTES, 'image/png');
  if (doc.error) throw new Error(`scan upload failed: ${doc.error.message}`);

  const { data: pet, error: petError } = await owner.client
    .from('pets')
    .insert({ name: 'Scratch Storage Pet', created_by: owner.userId, photo_path: photo.path })
    .select('id')
    .single();
  if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);

  const { error: linkError } = await owner.client
    .from('pet_documents')
    .insert({ pet_id: pet.id, storage_path: doc.path, kind: 'vaccination' });
  if (linkError) throw new Error(`document link failed: ${linkError.message}`);

  const { error: coError } = await admin.from('pet_co_owners').insert({
    pet_id: pet.id,
    owner_id: owner.userId,
    created_by: owner.userId,
    co_owner_email: coOwner.email,
    co_owner_user_id: coOwner.userId,
  });
  if (coError) throw new Error(`co-owner link failed: ${coError.message}`);

  const today = new Date().toISOString().slice(0, 10);
  const { data: sit, error: sitError } = await admin
    .from('pet_sits')
    .insert({ created_by: owner.userId, pet_ids: [pet.id], start_date: today, end_date: today })
    .select('id')
    .single();
  if (sitError || !sit) throw new Error(`sit insert failed: ${sitError?.message}`);
  const { error: accessError } = await admin.from('pet_sitter_access').insert({
    pet_sit_id: sit.id,
    owner_id: owner.userId,
    created_by: owner.userId,
    sitter_email: sitter.email,
    sitter_user_id: sitter.userId,
  });
  if (accessError) throw new Error(`sitter access failed: ${accessError.message}`);

  return { owner, coOwner, sitter, stranger, petId: pet.id, photoPath: photo.path, docPath: doc.path };
}

async function cleanUp(h: Household | null, extraUsers: ScratchUser[] = []) {
  const admin = adminClient();
  const users = h ? [h.owner, h.coOwner, h.sitter, h.stranger] : [];
  for (const u of [...users, ...extraUsers]) {
    const { data: files } = await admin.storage.from('uploads').list(u.userId, { limit: 100 });
    if (files?.length) await admin.storage.from('uploads').remove(files.map((f: { name: string }) => `${u.userId}/${f.name}`));
  }
  if (h) await admin.from('pet_sits').delete().contains('pet_ids', [h.petId]);
  for (const u of [...users, ...extraUsers]) await deleteScratchUser(u.userId);
}

async function canOpen(user: ScratchUser, path: string): Promise<boolean> {
  const { data, error } = await user.client.storage.from('uploads').createSignedUrl(path, 60);
  return !error && !!data?.signedUrl;
}

Deno.test('private uploads: each role sees exactly what spec 0071 allows', async () => {
  let h: Household | null = null;
  try {
    h = await buildHousehold('roles');

    assert(await canOpen(h.owner, h.photoPath), 'owner can open the pet photo');
    assert(await canOpen(h.owner, h.docPath), 'owner can open the scanned document');
    assert(await canOpen(h.coOwner, h.photoPath), 'co-owner can open the pet photo');
    assert(await canOpen(h.coOwner, h.docPath), 'co-owner can open the scanned document');
    assert(await canOpen(h.sitter, h.photoPath), 'sitter can open the pet photo');
    assert(!(await canOpen(h.sitter, h.docPath)), 'sitter must NOT open the scanned document');
    assert(!(await canOpen(h.stranger, h.photoPath)), 'stranger must NOT open the pet photo');
    assert(!(await canOpen(h.stranger, h.docPath)), 'stranger must NOT open the scanned document');

    const { data: listed } = await h.stranger.client.storage.from('uploads').list(h.owner.userId);
    assertEquals(listed?.length ?? 0, 0, "stranger must not be able to list the owner's folder");

    // The stock demo photos stay viewable to any signed-in user.
    assert(await canOpen(h.stranger, 'shared/maple.jpg'), 'shared demo photo is viewable');
  } finally {
    await cleanUp(h);
  }
});

Deno.test('private uploads: signed-out visitors get nothing, including old public links', async () => {
  let h: Household | null = null;
  try {
    h = await buildHousehold('anon');
    const anon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));

    const { error: signError } = await anon.storage.from('uploads').createSignedUrl(h.photoPath, 60);
    assertExists(signError, 'signed-out visitor must not get a signed link');

    const { data: listed } = await anon.storage.from('uploads').list(h.owner.userId);
    assertEquals(listed?.length ?? 0, 0, 'signed-out visitor must not list files');

    const publicUrl = `${requireEnv('SUPABASE_URL')}/storage/v1/object/public/uploads/${h.photoPath}`;
    const resp = await fetch(publicUrl);
    await resp.body?.cancel();
    assert(!resp.ok, `old public link must not serve the file (got ${resp.status})`);
  } finally {
    await cleanUp(h);
  }
});

Deno.test('private uploads: document links can only be made by an owner, for their own file', async () => {
  let h: Household | null = null;
  try {
    h = await buildHousehold('links');

    // A stranger can't attach their own file to someone else's pet.
    const strangerFile = await upload(h.stranger, 'mine.png', PNG_BYTES, 'image/png');
    assertEquals(strangerFile.error, null);
    const { error: strangerLink } = await h.stranger.client
      .from('pet_documents')
      .insert({ pet_id: h.petId, storage_path: strangerFile.path, kind: 'bloodwork' });
    assertExists(strangerLink, 'stranger must not link a document to a pet they do not own');

    // An owner can't claim a file that lives in someone else's folder.
    const { error: foreignPath } = await h.owner.client
      .from('pet_documents')
      .insert({ pet_id: h.petId, storage_path: strangerFile.path, kind: 'bloodwork' });
    assertExists(foreignPath, "owner must not link a file from another user's folder");

    // Sitters can't even see that a document exists.
    const { data: sitterRows } = await h.sitter.client.from('pet_documents').select('id').eq('pet_id', h.petId);
    assertEquals(sitterRows?.length ?? 0, 0, 'sitter must not see document links');
  } finally {
    await cleanUp(h);
  }
});

Deno.test('private uploads: the bucket refuses oversized and non-photo/PDF files', async () => {
  const user = await createScratchUser('limits');
  try {
    const big = await upload(user, 'big.pdf', new Uint8Array(10 * 1024 * 1024 + 1), 'application/pdf');
    assertExists(big.error, 'a file over 10 MB must be refused');

    const text = await upload(user, 'notes.txt', new TextEncoder().encode('hello'), 'text/plain');
    assertExists(text.error, 'a text file must be refused');

    const csv = await upload(user, 'labs.csv', new TextEncoder().encode('bun,12'), 'text/csv');
    assertExists(csv.error, 'a CSV must be refused (spreadsheet import is PA-51)');
  } finally {
    await cleanUp(null, [user]);
  }
});

Deno.test('ask-vet-assistant: refuses outside links and files the caller may not open', async () => {
  let h: Household | null = null;
  let removed: ScratchUser | null = null;
  try {
    h = await buildHousehold('ai');
    removed = await createScratchUser('ai-removed');
    // Spec 0080: requests name a task; every check below is refused before
    // the rate check and the AI call (bad fields when the request is parsed,
    // file access as the caller right after), so none of them counts
    // against any limit. The file is only downloaded after the rate check.
    const scan = (filePath: string) => ({ task: 'scan_vaccines', pet_id: h!.petId, file_path: filePath });

    // Spec 0080 AC8: the old file_url field is refused outright, whatever
    // it points at (spec 0071's Phase 1 link support is gone).
    const outside = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      task: 'scan_vaccine_single',
      file_url: 'https://example.com/invoice.png',
    });
    assertEquals(outside.status, 400);
    assertEquals(outside.json.code, 'invalid_file');

    const traversal = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      task: 'scan_vaccine_single',
      file_path: `${h.stranger.userId}/../${h.docPath}`,
    });
    assertEquals(traversal.status, 400);
    assertEquals(traversal.json.code, 'invalid_file');

    // Spec 0082 AC1: disguised traversal, odd segments and extra folders are
    // refused before any lookup or download. Each starts in the stranger's
    // own folder, so the old own-folder check would have let them through.
    // Refused before the rate check, so none counts against the limit.
    const badPaths = [
      `${h.stranger.userId}/%2e%2e/${h.docPath}`,
      `${h.stranger.userId}/..\\${h.docPath}`,
      `${h.stranger.userId}/./x.pdf`,
      `${h.stranger.userId}/%252e%252e/${h.docPath}`,
      `${h.stranger.userId}/a/b.pdf`,
      `${h.stranger.userId}/x.pdf/`,
      `/${h.docPath}`,
      `${h.stranger.userId}/x%20y.pdf`,
      `${h.stranger.userId}/x.pdf?y`,
      `${h.stranger.userId}/x.pdf#y`,
      `${h.stranger.userId}/x.a\\b`,
    ];
    for (const badPath of badPaths) {
      const res = await callFunction('ask-vet-assistant', h.stranger.accessToken, scan(badPath));
      assertEquals(res.status, 400, `expected 400 for ${badPath}`);
      assertEquals(res.json.code, 'invalid_file', `expected invalid_file for ${badPath}`);
    }

    // The uploader keeps whatever followed the last dot in the person's file
    // name as the extension, so real paths can have spaces, dashes or
    // accented letters there. These must pass the shape check. They sit in
    // the owner's folder, so the stranger gets 403 forbidden_file (not 400
    // invalid_file), which proves the shape was accepted without calling the
    // AI or using up the rate limit.
    const awkwardPaths = [
      `${h.owner.userId}/1700000000000-abc123.rabies cert`,
      `${h.owner.userId}/1700000000000-abc123.jpg-large`,
      `${h.owner.userId}/1700000000000-abc123.résumé`,
    ];
    for (const awkwardPath of awkwardPaths) {
      const res = await callFunction('ask-vet-assistant', h.stranger.accessToken, scan(awkwardPath));
      assertEquals(res.status, 403, `expected 403 for ${awkwardPath}`);
      assertEquals(res.json.code, 'forbidden_file', `expected forbidden_file for ${awkwardPath}`);
    }

    const someoneElses = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      task: 'scan_vaccine_single',
      file_path: h.docPath,
    });
    assertEquals(someoneElses.status, 403);
    assertEquals(someoneElses.json.code, 'forbidden_file');

    // Sitters can see the pet but not its documents, so not via the AI either.
    const sitter = await callFunction('ask-vet-assistant', h.sitter.accessToken, scan(h.docPath));
    assertEquals(sitter.status, 403);
    assertEquals(sitter.json.code, 'forbidden_file');

    // Spec 0082 AC2: a co-owner who was invited, claimed the invite, and was
    // then removed knows the real path but is refused like a stranger
    // (by the pet_documents lookup, before the rate check).
    const { data: invite, error: inviteError } = await h.owner.client
      .from('pet_co_owners')
      .insert({ pet_id: h.petId, owner_id: h.owner.userId, created_by: h.owner.userId, co_owner_email: removed.email })
      .select('id')
      .single();
    if (inviteError || !invite) throw new Error(`co-owner invite failed: ${inviteError?.message}`);
    const { error: claimError } = await removed.client.rpc('claim_pending_co_owner_invites');
    if (claimError) throw new Error(`co-owner claim failed: ${claimError.message}`);
    assert(await canOpen(removed, h.docPath), 'while a co-owner, they can open the document');
    const { error: removeError } = await h.owner.client.from('pet_co_owners').delete().eq('id', invite.id);
    if (removeError) throw new Error(`co-owner removal failed: ${removeError.message}`);
    const removedCall = await callFunction('ask-vet-assistant', removed.accessToken, scan(h.docPath));
    assertEquals(removedCall.status, 403);
    assertEquals(removedCall.json.code, 'forbidden_file');

    // A public-style link into someone else's folder, sent as file_url, is
    // refused before any path conversion (Phase 1 compatibility removed).
    const compat = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      task: 'scan_vaccines',
      pet_id: h.petId,
      file_url: `${requireEnv('SUPABASE_URL')}/storage/v1/object/public/uploads/${h.docPath}`,
    });
    assertEquals(compat.status, 400);
    assertEquals(compat.json.code, 'invalid_file');
  } finally {
    await cleanUp(h, removed ? [removed] : []);
  }
});
