import { entities } from '@/api/entities';

// Idempotent "get or create" for a pet's onboarding row. pet_id is unique,
// so two concurrent callers (a double-tap on "Complete {Pet}'s Profile",
// two tabs, or React StrictMode's double effect-invocation in dev) can
// both see "no row yet" and both attempt to create one — the loser's
// insert fails with a 23505 unique-violation. Rather than let that
// surface as an unhandled crash, treat it as "someone else already
// created it" and read back their row instead.
export async function getOrCreatePetOnboarding(petId) {
  const existing = await entities.PetOnboarding.filter({ pet_id: petId });
  if (existing.length > 0) return { row: existing[0], wasCreated: false };

  try {
    const created = await entities.PetOnboarding.create({ pet_id: petId, current_step: 'health' });
    return { row: created, wasCreated: true };
  } catch (err) {
    if (err?.code === '23505') {
      const [row] = await entities.PetOnboarding.filter({ pet_id: petId });
      if (row) return { row, wasCreated: false };
    }
    throw err;
  }
}
