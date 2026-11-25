// Shared by delete-pet and reset-sandbox-account (spec 0071, 0083).
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

// Paths per lookup, so the in(...) filter stays well under PostgREST's URL
// length limit however many files a folder holds.
const LOOKUP_BATCH = 50;

// Of `paths`, the ones still used by a pet NOT in `excludingPetIds`: as
// that pet's photo_path, or as a pet_documents.storage_path for that pet
// (spec 0083 FR3). Same rule as prepare_account_deletion() step (e) in
// migration 0058, with `excludingPetIds` playing the part of its doomed
// pets. Excluding the pets being deleted matters: otherwise a pet's own
// scan row would count as "in use" and its file would be kept forever.
//
// Batched: two in(...) lookups per LOOKUP_BATCH paths, not one per file.
//
// Fails safe: if any lookup errors, every path is treated as in use (so
// all are kept) and the error is reported.
export async function pathsStillInUse(
  admin: SupabaseClient,
  paths: string[],
  excludingPetIds: string[],
  report: PhotoLookupReporter = defaultReporter,
): Promise<Set<string>> {
  const unique = [...new Set(paths)];
  const excluded = new Set(excludingPetIds);
  const inUse = new Set<string>();

  for (let i = 0; i < unique.length; i += LOOKUP_BATCH) {
    const batch = unique.slice(i, i + LOOKUP_BATCH);
    const [pets, docs] = await Promise.all([
      admin.from('pets').select('id, photo_path').in('photo_path', batch),
      admin.from('pet_documents').select('pet_id, storage_path').in('storage_path', batch),
    ]);

    if (pets.error || docs.error) {
      const err = pets.error ?? docs.error;
      report(new Error(`pathsStillInUse lookup failed: ${err?.message ?? 'unknown error'}`), {
        function: 'petPhoto',
        step: 'photo_in_use_lookup',
      });
      return new Set(unique);
    }

    for (const p of (pets.data ?? []) as { id: string; photo_path: string }[]) {
      if (!excluded.has(p.id)) inUse.add(p.photo_path);
    }
    for (const d of (docs.data ?? []) as { pet_id: string; storage_path: string }[]) {
      if (!excluded.has(d.pet_id)) inUse.add(d.storage_path);
    }
  }
  return inUse;
}

// The files among `paths` that are safe to delete along with the pets in
// `excludingPetIds`: no empty paths, nothing in shared/ (the stock demo
// photos), nothing still in use per pathsStillInUse(), no duplicates.
// On a lookup error this returns [] (every file kept, error reported).
export async function deletableFilePaths(
  admin: SupabaseClient,
  paths: (string | null | undefined)[],
  excludingPetIds: string[],
  report: PhotoLookupReporter = defaultReporter,
): Promise<string[]> {
  const candidates = [...new Set(paths.filter((p): p is string => !!p && !p.startsWith('shared/')))];
  if (candidates.length === 0) return [];
  const inUse = await pathsStillInUse(admin, candidates, excludingPetIds, report);
  return candidates.filter((p) => !inUse.has(p));
}
