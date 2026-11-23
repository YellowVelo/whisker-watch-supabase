// Pets screen data layer. Follows the same precedent as checkinClient.js:
// entityClient's generic filter only supports equality, so batched reads
// and multi-step lookups the UI needs go here as a data-access module,
// never as direct Supabase calls inside Pets.jsx (Technical Standards
// §3: "Never call Supabase directly inside UI components").

import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { reportClientError } from '@/lib/errorMonitoring';

export async function getActiveMedicationCountsForPets(petIds) {
  if (!petIds.length) return {};
  const { data, error } = await supabase
    .from('medications')
    .select('pet_id')
    .in('pet_id', petIds)
    .eq('active', true);
  if (error) throw error;

  const counts = {};
  for (const row of data) {
    counts[row.pet_id] = (counts[row.pet_id] || 0) + 1;
  }
  return counts;
}

// Ids of pets the signed-in user can see *only* because they sit for
// them (via PetSit/PetSitterAccess). Pet.list() already returns full rows
// for these pets (RLS grants sitters read access — see migration
// 0031_pets_select_sitter.sql), so this is purely about telling apart
// *why* a pet showed up in that list: owner/co-owner (full access,
// belongs in "My Pets") vs. sitter-only (belongs in "Pets I Sit"
// instead, and kept out of owner-only screens like Edit Pet, Vet Report
// and Scan Record's pet matching — spec 0076, PA-28).
//
// A pet the user owns or co-owns is never sitter-only, even if they're
// also listed as its sitter (spec 0076 fix: before, any pet in one of
// the user's sits counted, which would have locked an owner out of Edit
// Pet for their own pet).
export async function getSitterOnlyPetIds() {
  const { data: userData } = await supabase.auth.getUser();
  const me = userData?.user;
  if (!me?.email) return new Set();

  const accesses = await entities.PetSitterAccess.filter({ sitter_email: me.email });
  if (accesses.length === 0) return new Set();

  const sitIds = [...new Set(accesses.map((a) => a.pet_sit_id).filter(Boolean))];
  const sits = sitIds.length
    ? await Promise.all(sitIds.map((id) => entities.PetSit.get(id).catch(() => null)))
    : [];
  const sitPetIds = new Set(sits.filter(Boolean).flatMap((s) => s.pet_ids || []));
  if (sitPetIds.size === 0) return sitPetIds;

  const [ownedR, coOwnedRows] = await Promise.all([
    supabase.from('pets').select('id').in('id', [...sitPetIds]).eq('created_by', me.id),
    entities.PetCoOwner.filter({ co_owner_user_id: me.id }),
  ]);
  if (ownedR.error) throw ownedR.error;
  const ownedIds = new Set([
    ...(ownedR.data || []).map((p) => p.id),
    ...coOwnedRows.map((r) => r.pet_id),
  ]);
  return new Set([...sitPetIds].filter((id) => !ownedIds.has(id)));
}

// Pets the signed-in user owns or co-owns: Pet.list() minus sitter-only
// pets. Use this, not Pet.list(), for any owner-only flow (spec 0076).
export async function listOwnedPets(order = undefined) {
  const [pets, sitterOnlyIds] = await Promise.all([
    entities.Pet.list(order),
    getSitterOnlyPetIds(),
  ]);
  return pets.filter((p) => !sitterOnlyIds.has(p.id));
}

// Home and Ask Wysker's general chat (spec 0079, PA-61): the person's
// owned and co-owned pets, plus how many pets they only sit for (Home
// uses that to show the Pet Sitter card on its welcome screen).
//
// The pet list and the sitter lookup run together. If Pet.list() fails,
// that error passes up as before. If only the sitter lookup fails, the
// failure is reported and every pet is returned, as these screens did
// before spec 0079 (the database, not this screen, decides what can be
// saved).
export async function loadOwnedPets(order, feature) {
  const [pets, sitterR] = await Promise.all([
    entities.Pet.list(order),
    getSitterOnlyPetIds().then(
      (ids) => ({ ids, err: null }),
      (err) => ({ ids: null, err }),
    ),
  ]);
  if (sitterR.ids === null) {
    reportClientError(sitterR.err, { feature, note: 'sitter-only pet lookup failed; showing all pets' });
    return { pets, sitterOnlyCount: 0 };
  }
  const owned = pets.filter((p) => !sitterR.ids.has(p.id));
  return { pets: owned, sitterOnlyCount: pets.length - owned.length };
}
