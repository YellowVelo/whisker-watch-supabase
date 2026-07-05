// Pets screen data layer. Follows the same precedent as checkinClient.js:
// entityClient's generic filter only supports equality, so batched reads
// and multi-step lookups the UI needs go here as a data-access module,
// never as direct Supabase calls inside Pets.jsx (Technical Standards
// §3: "Never call Supabase directly inside UI components").

import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';

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

// Pets the signed-in user has sitter access to (via PetSit/PetSitterAccess)
// but doesn't own. Not part of the Pets Feature Spec mockup — kept so
// existing pet-sitting access isn't lost from the screen (see Pets.jsx's
// "Shared with Me" section).
export async function getSharedPetsForUser(ownedPets) {
  const { data: userData } = await supabase.auth.getUser();
  const me = userData?.user;
  if (!me?.email) return [];

  const accesses = await entities.PetSitterAccess.filter({ sitter_email: me.email });
  if (accesses.length === 0) return [];

  const sitIds = [...new Set(accesses.map((a) => a.pet_sit_id).filter(Boolean))];
  const sits = sitIds.length
    ? await Promise.all(sitIds.map((id) => entities.PetSit.get(id).catch(() => null)))
    : [];
  const sharedPetIds = [...new Set(sits.filter(Boolean).flatMap((s) => s.pet_ids || []))];

  const ownIds = new Set(ownedPets.map((p) => p.id));
  const toFetch = sharedPetIds.filter((id) => !ownIds.has(id));
  if (toFetch.length === 0) return [];

  const shared = await Promise.all(toFetch.map((id) => entities.Pet.get(id).catch(() => null)));
  return shared.filter(Boolean);
}
