import { entities } from '@/api/entities';

// Test-account seed scenarios. Each function creates realistic sample
// data via the normal entity API (so it goes through the same RLS
// paths as a real user would), scoped to the currently signed-in
// test account. Starter set for V1 — more scenarios (Senior Cat w/
// CKD, Cat w/ IBD, Dog w/ Allergies, Pet w/ Medications, Pet w/
// Vaccines, Pet w/ Logs) can be added the same way later.

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function seedHealthyDog() {
  const pet = await entities.Pet.create({
    species: 'Dog',
    name: 'Buddy',
    breed: 'Labrador Retriever',
    birth_date: daysAgo(365 * 3),
    birth_date_precision: 'EXACT',
    sex: 'Male',
    altered_status: 'Yes',
    notes: 'Seeded test pet — Healthy Dog scenario.',
  });

  await entities.Vaccination.create({
    pet_id: pet.id,
    vaccine_name: 'Rabies',
    date_given: daysAgo(90),
    next_due_date: daysAgo(-275),
    administered_by: 'Dr. Sample, DVM',
  });

  await entities.FoodLog.create({
    pet_id: pet.id,
    date: daysAgo(1),
    food_name: 'Adult Dog Formula',
    food_type: 'Dry food',
    amount_eaten: 'All',
    reaction: 'Good',
  });

  for (let i = 0; i < 3; i++) {
    await entities.SymptomLog.create({
      pet_id: pet.id,
      date: daysAgo(i),
      appetite: 'Ate all',
      energy_level: 'Playful',
      stool_quality: 'Normal',
      water_intake: 'Normal',
      weight_grams: 29500,
    });
  }

  return [pet];
}

async function seedMultiPetHousehold() {
  const dog = await entities.Pet.create({
    species: 'Dog',
    name: 'Scout',
    breed: 'Border Collie',
    birth_date: daysAgo(365 * 4),
    birth_date_precision: 'EXACT',
    sex: 'Female',
    altered_status: 'Yes',
    notes: 'Seeded test pet — Multi-Pet Household scenario.',
  });

  const cat = await entities.Pet.create({
    species: 'Cat',
    name: 'Willow',
    breed: 'Domestic Shorthair',
    birth_date: daysAgo(365 * 6),
    birth_date_precision: 'YEAR',
    sex: 'Female',
    altered_status: 'Yes',
    notes: 'Seeded test pet — Multi-Pet Household scenario.',
  });

  const kitten = await entities.Pet.create({
    species: 'Cat',
    name: 'Pepper',
    breed: 'Tabby',
    birth_date: daysAgo(120),
    birth_date_precision: 'EXACT',
    sex: 'Male',
    altered_status: 'No',
    notes: 'Seeded test pet — Multi-Pet Household scenario.',
  });

  for (const pet of [dog, cat, kitten]) {
    await entities.SymptomLog.create({
      pet_id: pet.id,
      date: daysAgo(0),
      appetite: 'Ate all',
      energy_level: 'Normal',
      stool_quality: 'Normal',
      water_intake: 'Normal',
    });
  }

  return [dog, cat, kitten];
}

export const SEED_SCENARIOS = [
  { key: 'empty', label: 'Empty Account', description: 'No pets — clears existing test data only.', run: async () => [] },
  { key: 'healthy_dog', label: 'Healthy Dog', description: 'One healthy adult dog with routine logs.', run: seedHealthyDog },
  { key: 'multi_pet', label: 'Multi-Pet Household', description: 'A dog, an adult cat, and a kitten.', run: seedMultiPetHousehold },
];
