// Unit tests for supabase/functions/_shared/petPhoto.ts (spec 0080 FR12,
// PA-52: the temporary photo_url fallback is gone; spec 0083 FR3/AC3:
// pathsStillInUse and deletableFilePaths, with a stubbed admin client).
// Pure: no network, no logins, no file access.
//
// Run: deno test --node-modules-dir=none supabase/tests/pet_photo.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { deletableFilePaths, deletablePetPhotoPath, pathsStillInUse } from '../functions/_shared/petPhoto.ts';

Deno.test('returns the pet\'s own photo_path', () => {
  assertEquals(deletablePetPhotoPath({ photo_path: 'user-1/pet-photo.jpg' }), 'user-1/pet-photo.jpg');
});

Deno.test('never returns a shared/ demo photo path', () => {
  assertEquals(deletablePetPhotoPath({ photo_path: 'shared/demo-dog.jpg' }), null);
});

Deno.test('null, empty or missing photo_path means nothing to delete', () => {
  assertEquals(deletablePetPhotoPath({ photo_path: null }), null);
  assertEquals(deletablePetPhotoPath({ photo_path: '' }), null);
  assertEquals(deletablePetPhotoPath({}), null);
});

Deno.test('a stray photo_url property is ignored', () => {
  const legacy = {
    photo_path: null,
    photo_url: 'https://example.supabase.co/storage/v1/object/public/uploads/user-1/old.jpg',
  };
  assertEquals(deletablePetPhotoPath(legacy), null);
  assertEquals(
    deletablePetPhotoPath({ ...legacy, photo_path: 'user-1/new.jpg' }),
    'user-1/new.jpg',
  );
});

// ── pathsStillInUse / deletableFilePaths (spec 0083 FR3, AC3) ──────────

type Rows = Record<string, unknown>[];
type Result = { data: Rows | null; error: { message: string } | null };

// A stand-in admin client: from(table).select(cols).in(col, values)
// resolves to the rows in `tables[table]` whose `col` is one of `values`,
// or to the table's configured error. Every in(...) call is recorded in
// `calls`, so tests can check the lookups are batched.
function stubAdmin(
  tables: { pets?: Rows; pet_documents?: Rows },
  errors: { pets?: string; pet_documents?: string } = {},
): { admin: SupabaseClient; calls: { table: string; values: unknown[] }[] } {
  const calls: { table: string; values: unknown[] }[] = [];
  const admin = {
    from(table: 'pets' | 'pet_documents') {
      return {
        select(_cols: string) {
          return {
            in(col: string, values: unknown[]): Promise<Result> {
              calls.push({ table, values });
              const message = errors[table];
              if (message) return Promise.resolve({ data: null, error: { message } });
              const rows = (tables[table] ?? []).filter((r) => values.includes(r[col]));
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

const noReport = () => {};
const sorted = (paths: Iterable<string>) => [...paths].sort();

Deno.test('pathsStillInUse: a path no other pet uses is not in use', async () => {
  const { admin } = stubAdmin({
    pets: [{ id: 'pet-a', photo_path: 'u1/a.jpg' }, { id: 'pet-b', photo_path: 'u1/b.jpg' }],
    pet_documents: [{ pet_id: 'pet-b', storage_path: 'u1/scan.pdf' }],
  });
  assertEquals(sorted(await pathsStillInUse(admin, ['u1/a.jpg'], ['pet-a'], noReport)), []);
});

Deno.test("pathsStillInUse: another pet's photo_path or pet_documents row marks the path in use", async () => {
  const { admin } = stubAdmin({
    pets: [{ id: 'pet-a', photo_path: 'u1/a.jpg' }, { id: 'pet-x', photo_path: 'u1/a.jpg' }],
    pet_documents: [{ pet_id: 'pet-y', storage_path: 'u1/scan.pdf' }],
  });
  assertEquals(
    sorted(await pathsStillInUse(admin, ['u1/a.jpg', 'u1/scan.pdf', 'u1/free.jpg'], ['pet-a'], noReport)),
    ['u1/a.jpg', 'u1/scan.pdf'],
  );
});

Deno.test("pathsStillInUse: the excluded pets' own photo and scan rows don't count", async () => {
  // reset-sandbox-account excludes every pet it wipes: two wiped pets
  // sharing a photo, plus a wiped pet's own scan row, are not "in use".
  const { admin } = stubAdmin({
    pets: [{ id: 'pet-a', photo_path: 'u1/a.jpg' }, { id: 'pet-b', photo_path: 'u1/a.jpg' }],
    pet_documents: [{ pet_id: 'pet-a', storage_path: 'u1/a.jpg' }],
  });
  assertEquals(sorted(await pathsStillInUse(admin, ['u1/a.jpg'], ['pet-a', 'pet-b'], noReport)), []);
  // ...but leaving one of them out of the exclusion list makes it count.
  assertEquals(sorted(await pathsStillInUse(admin, ['u1/a.jpg'], ['pet-a'], noReport)), ['u1/a.jpg']);
});

Deno.test('pathsStillInUse: looks paths up in batches, not one query per file', async () => {
  const paths = Array.from({ length: 120 }, (_, i) => `u1/f${i}.jpg`);
  const { admin, calls } = stubAdmin({
    pets: [{ id: 'pet-x', photo_path: 'u1/f7.jpg' }],
    pet_documents: [{ pet_id: 'pet-y', storage_path: 'u1/f110.jpg' }],
  });
  // A duplicate path is looked up once.
  const inUse = await pathsStillInUse(admin, [...paths, 'u1/f7.jpg'], [], noReport);
  assertEquals(sorted(inUse), ['u1/f110.jpg', 'u1/f7.jpg']);
  // 120 unique paths at 50 per batch: 3 batches, each one pets lookup and
  // one pet_documents lookup.
  assertEquals(calls.filter((c) => c.table === 'pets').length, 3);
  assertEquals(calls.filter((c) => c.table === 'pet_documents').length, 3);
  assertEquals(calls.every((c) => c.values.length <= 50), true);
});

Deno.test('pathsStillInUse: no paths means no lookups', async () => {
  const { admin, calls } = stubAdmin({});
  assertEquals(sorted(await pathsStillInUse(admin, [], ['pet-a'], noReport)), []);
  assertEquals(calls.length, 0);
});

for (const table of ['pets', 'pet_documents'] as const) {
  Deno.test(`pathsStillInUse: a ${table} lookup error keeps every file and reports it`, async () => {
    const { admin } = stubAdmin({}, { [table]: 'boom' });
    const reports: { err: unknown; tags: Record<string, string> }[] = [];
    const inUse = await pathsStillInUse(
      admin,
      ['u1/a.jpg', 'u1/b.jpg'],
      ['pet-a'],
      (err, tags) => reports.push({ err, tags }),
    );
    assertEquals(sorted(inUse), ['u1/a.jpg', 'u1/b.jpg']);
    assertEquals(reports.length, 1);
    assertEquals((reports[0].err as Error).message.includes('boom'), true);
  });
}

// reset-sandbox-account's final wipe: the wiped pets' photo paths plus
// every file in the caller's folder go through deletableFilePaths().
Deno.test('deletableFilePaths: a folder file an outside pet uses is kept, an unused one is removed', async () => {
  const { admin } = stubAdmin({
    pets: [
      { id: 'wiped-1', photo_path: 'demo/own.jpg' },
      // Another user's pet the demo account co-owns; it uploaded the photo.
      { id: 'outside-pet', photo_path: 'demo/coowned-photo.jpg' },
    ],
    pet_documents: [
      { pet_id: 'outside-pet', storage_path: 'demo/coowned-scan.pdf' },
      { pet_id: 'wiped-1', storage_path: 'demo/own-scan.pdf' },
    ],
  });
  const folder = [
    'demo/own.jpg',
    'demo/coowned-photo.jpg',
    'demo/coowned-scan.pdf',
    'demo/own-scan.pdf',
    'demo/stray.jpg',
  ];
  const deletable = await deletableFilePaths(
    admin,
    ['demo/own.jpg', null, 'shared/demo-dog.jpg', ...folder],
    ['wiped-1'],
    noReport,
  );
  assertEquals(deletable.sort(), ['demo/own-scan.pdf', 'demo/own.jpg', 'demo/stray.jpg']);
});

Deno.test('deletableFilePaths: never returns shared/ or empty paths, and skips the lookup if none are left', async () => {
  const { admin, calls } = stubAdmin({});
  assertEquals(await deletableFilePaths(admin, ['shared/demo-cat.jpg', null, undefined, ''], [], noReport), []);
  assertEquals(calls.length, 0);
});

Deno.test('deletableFilePaths: a lookup error keeps every file and reports it', async () => {
  const { admin } = stubAdmin({}, { pet_documents: 'boom' });
  const reports: unknown[] = [];
  assertEquals(await deletableFilePaths(admin, ['u1/a.jpg', 'u1/b.jpg'], [], (err) => reports.push(err)), []);
  assertEquals(reports.length, 1);
});
