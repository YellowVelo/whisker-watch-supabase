// Unit tests for supabase/functions/_shared/petPhoto.ts (spec 0080 FR12,
// PA-52: the temporary photo_url fallback is gone; spec 0083 FR3:
// photoPathStillInUse, with a stubbed admin client). Pure: no network, no
// logins, no file access.
//
// Run: deno test --node-modules-dir=none supabase/tests/pet_photo.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { deletablePetPhotoPath, photoPathStillInUse } from '../functions/_shared/petPhoto.ts';

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

// ── photoPathStillInUse (spec 0083 FR3, AC3) ───────────────────────────

type Rows = Record<string, unknown>[];
type Result = { data: Rows | null; error: { message: string } | null };

// A stand-in admin client: from(table).select(col).eq(col, value) resolves
// to the rows in `tables[table]` whose `col` equals `value`, or to the
// table's configured error.
function stubAdmin(
  tables: { pets?: Rows; pet_documents?: Rows },
  errors: { pets?: string; pet_documents?: string } = {},
): SupabaseClient {
  return {
    from(table: 'pets' | 'pet_documents') {
      return {
        select(_cols: string) {
          return {
            eq(col: string, value: unknown): Promise<Result> {
              const message = errors[table];
              if (message) return Promise.resolve({ data: null, error: { message } });
              const rows = (tables[table] ?? []).filter((r) => r[col] === value);
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const noReport = () => {};

Deno.test('photoPathStillInUse: a path no other pet uses is not in use', async () => {
  const admin = stubAdmin({
    pets: [{ id: 'pet-a', photo_path: 'u1/a.jpg' }, { id: 'pet-b', photo_path: 'u1/b.jpg' }],
    pet_documents: [{ pet_id: 'pet-b', storage_path: 'u1/scan.pdf' }],
  });
  assertEquals(await photoPathStillInUse(admin, 'u1/a.jpg', ['pet-a'], noReport), false);
});

Deno.test("photoPathStillInUse: another pet's photo_path keeps the file", async () => {
  const admin = stubAdmin({
    pets: [{ id: 'pet-a', photo_path: 'u1/a.jpg' }, { id: 'pet-x', photo_path: 'u1/a.jpg' }],
  });
  assertEquals(await photoPathStillInUse(admin, 'u1/a.jpg', ['pet-a'], noReport), true);
});

Deno.test("photoPathStillInUse: another pet's pet_documents.storage_path keeps the file", async () => {
  const admin = stubAdmin({
    pets: [{ id: 'pet-a', photo_path: 'u1/a.jpg' }],
    pet_documents: [{ pet_id: 'pet-x', storage_path: 'u1/a.jpg' }],
  });
  assertEquals(await photoPathStillInUse(admin, 'u1/a.jpg', ['pet-a'], noReport), true);
});

Deno.test("photoPathStillInUse: the excluded pets' own photo and scan rows don't count", async () => {
  // reset-sandbox-account excludes every pet it wipes: two wiped pets
  // sharing a photo, plus a wiped pet's own scan row, are not "in use".
  const admin = stubAdmin({
    pets: [{ id: 'pet-a', photo_path: 'u1/a.jpg' }, { id: 'pet-b', photo_path: 'u1/a.jpg' }],
    pet_documents: [{ pet_id: 'pet-a', storage_path: 'u1/a.jpg' }],
  });
  assertEquals(await photoPathStillInUse(admin, 'u1/a.jpg', ['pet-a', 'pet-b'], noReport), false);
  // ...but leaving one of them out of the exclusion list makes it count.
  assertEquals(await photoPathStillInUse(admin, 'u1/a.jpg', ['pet-a'], noReport), true);
});

for (const table of ['pets', 'pet_documents'] as const) {
  Deno.test(`photoPathStillInUse: a ${table} lookup error keeps the file and reports it`, async () => {
    const admin = stubAdmin({}, { [table]: 'boom' });
    const reports: { err: unknown; tags: Record<string, string> }[] = [];
    const inUse = await photoPathStillInUse(admin, 'u1/a.jpg', ['pet-a'], (err, tags) => reports.push({ err, tags }));
    assertEquals(inUse, true);
    assertEquals(reports.length, 1);
    assertEquals((reports[0].err as Error).message.includes('boom'), true);
  });
}
