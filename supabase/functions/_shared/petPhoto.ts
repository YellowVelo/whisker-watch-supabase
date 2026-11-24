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
export function deletablePetPhotoPath(pet: { photo_path?: string | null }): string | null {
  const path = pet.photo_path ?? null;
  if (!path || path.startsWith('shared/')) return null;
  return path;
}
