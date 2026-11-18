// Shared by delete-pet and reset-sandbox-account (spec 0071).
//
// Returns the storage path of a pet's own photo file that is safe to
// delete along with the pet, or null if there's nothing to delete.
//
// - Prefers pets.photo_path (spec 0071).
// - TEMPORARY, Phase 1 only: falls back to parsing the old public
//   pets.photo_url, for photos the currently-live frontend uploaded before
//   its new build was promoted. Delete the fallback in Phase 2, when
//   photo_url is dropped.
// - Never returns a path in the shared/ folder: those are the stock demo
//   photos every demo pet points at, and deleting one would blank it for
//   everyone.
export function deletablePetPhotoPath(pet: { photo_path?: string | null; photo_url?: string | null }): string | null {
  let path = pet.photo_path ?? null;
  if (!path && pet.photo_url) {
    const marker = '/object/public/uploads/';
    const idx = pet.photo_url.indexOf(marker);
    if (idx !== -1) path = pet.photo_url.slice(idx + marker.length);
  }
  if (!path || path.startsWith('shared/')) return null;
  return path;
}
