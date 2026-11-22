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
  try {
    h = await buildHousehold('ai');
    const prompt = 'Test prompt that must never reach the AI.';

    const outside = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      prompt,
      file_url: 'https://example.com/invoice.png',
    });
    assertEquals(outside.status, 400);
    assertEquals(outside.json.code, 'invalid_file');

    const traversal = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      prompt,
      file_path: `${h.stranger.userId}/../${h.docPath}`,
    });
    assertEquals(traversal.status, 400);

    const someoneElses = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      prompt,
      file_path: h.docPath,
    });
    assertEquals(someoneElses.status, 403);
    assertEquals(someoneElses.json.code, 'forbidden_file');

    // Sitters can see the pet but not its documents, so not via the AI either.
    const sitter = await callFunction('ask-vet-assistant', h.sitter.accessToken, { prompt, file_path: h.docPath });
    assertEquals(sitter.status, 403);

    // Phase 1 compatibility path: a public-style link into someone else's
    // folder is converted to a path and refused the same way.
    const compat = await callFunction('ask-vet-assistant', h.stranger.accessToken, {
      prompt,
      file_url: `${requireEnv('SUPABASE_URL')}/storage/v1/object/public/uploads/${h.docPath}`,
    });
    assertEquals(compat.status, 403);
  } finally {
    await cleanUp(h);
  }
});
