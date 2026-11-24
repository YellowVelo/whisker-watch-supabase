// Unit tests for supabase/functions/_shared/petPhoto.ts (spec 0080 FR12,
// PA-52: the temporary photo_url fallback is gone). Pure: no network, no
// logins, no file access.
//
// Run: deno test --node-modules-dir=none supabase/tests/pet_photo.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deletablePetPhotoPath } from '../functions/_shared/petPhoto.ts';

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
