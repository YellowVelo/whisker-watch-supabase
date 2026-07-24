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

// Ids of pets the signed-in user has sitter access to (via PetSit/
// PetSitterAccess), regardless of whether they also own or co-own any of
// them. Pet.list() already returns full rows for these pets (RLS grants
// sitters read access — see migration 0031_pets_select_sitter.sql), so
// this is purely about telling apart *why* a pet showed up in that list:
// owner/co-owner (full access, belongs in "My Pets") vs. sitter-only
// (belongs in "Pets I Sit" instead). Without this check, Pets.jsx would
// have no way to distinguish the two and would show a sitter the full
// owner-level management card, which they don't actually have rights to.
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
  return new Set(sits.filter(Boolean).flatMap((s) => s.pet_ids || []));
}
