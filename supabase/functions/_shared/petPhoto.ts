// Shared by delete-pet and reset-sandbox-account (spec 0071).
//
// Returns the storage path of a pet's own photo file that is safe to
// delete along with the pet, or null if there's nothing to delete.
//
// - Reads pets.photo_path only. Spec 0071's temporary fallback to the old
//   public pets.photo_url link was removed in spec 0080 (PA-52), since
//   migration 0055 dropped that column on every project.
// - Never returns a path in the shared/ folder: those are the stock demo
//   photos every demo pet points at, and deleting one would blank it for
//   everyone.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';

export function deletablePetPhotoPath(pet: { photo_path?: string | null }): string | null {
  const path = pet.photo_path ?? null;
  if (!path || path.startsWith('shared/')) return null;
  return path;
}

export type PhotoLookupReporter = (err: unknown, tags: Record<string, string>) => void;

// errorReporting.ts reads Sentry's env vars when it loads, so it's only
// loaded when there's actually an error to report. That keeps this file
// importable by the pure unit tests (supabase/tests/pet_photo.test.ts),
// which run without env permission.
const defaultReporter: PhotoLookupReporter = (err, tags) => {
  import('./errorReporting.ts')
    .then(({ reportError }) => reportError(err, tags))
    .catch(() => {});
};

// True if a file is still used by a pet NOT in `excludingPetIds`: as that
// pet's photo_path, or as a pet_documents.storage_path for that pet
// (spec 0083 FR3). Same rule as prepare_account_deletion() step (e) in
// migration 0058, with `excludingPetIds` playing the part of its doomed
// pets. Excluding the pets being deleted matters: otherwise a pet's own
// scan row would count as "in use" and its file would be kept forever.
//
// Fails safe: if either lookup errors, the file is treated as in use (so
// it's kept) and the error is reported.
export async function photoPathStillInUse(
  admin: SupabaseClient,
  path: string,
  excludingPetIds: string[],
  report: PhotoLookupReporter = defaultReporter,
): Promise<boolean> {
  const excluded = new Set(excludingPetIds);

  const [pets, docs] = await Promise.all([
    admin.from('pets').select('id').eq('photo_path', path),
    admin.from('pet_documents').select('pet_id').eq('storage_path', path),
  ]);

  if (pets.error || docs.error) {
    const err = pets.error ?? docs.error;
    report(new Error(`photoPathStillInUse lookup failed: ${err?.message ?? 'unknown error'}`), {
      function: 'petPhoto',
      step: 'photo_in_use_lookup',
    });
    return true;
  }

  const otherPet = (pets.data ?? []).some((p: { id: string }) => !excluded.has(p.id));
  const otherDoc = (docs.data ?? []).some((d: { pet_id: string }) => !excluded.has(d.pet_id));
  return otherPet || otherDoc;
}
