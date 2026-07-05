import { entities } from '@/api/entities';
import { markNormal, markSkipped, saveChangedCheckIn } from '@/lib/checkin/checkinClient';

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

// ── Daily Check-In history backfill (for testing Insights trend charts) ──
// Reuses the same markNormal/markSkipped/saveChangedCheckIn functions the
// real Daily Check-In UI calls, so seeded wellness_scores/trends are scored
// identically to a real user's data — no separate scoring logic here.
const HISTORY_DAYS = 30;

// planFor(i, total) returns 'normal' | 'skip' | a selections array for
// saveChangedCheckIn (see src/lib/checkin/checkinClient.js). i counts down
// from `total - 1` (oldest day) to 0 (today).
async function seedCheckInHistory(pet, days, planFor) {
  // Oldest -> newest, one at a time: each day's wellness score/trend is
  // computed from the history accumulated so far, same as it would be for
  // a real user checking in day by day. Do not parallelize this loop.
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgo(i);
    const plan = planFor(i, days);
    if (plan === 'skip') {
      await markSkipped(pet.id, date, 'app');
    } else if (plan === 'normal') {
      await markNormal(pet.id, date, 'app');
    } else {
      await saveChangedCheckIn(pet.id, date, plan, 'app');
    }
  }
}

// A handful of skipped days for every pet, so charts also exercise the
// "missing data is meaningful" gap case, not just three smooth lines.
function isSkipDay(i) {
  return i % 13 === 6;
}

// Mostly normal, with an occasional mild dip — trend should read "Stable".
function stablePlan(i) {
  if (isSkipDay(i)) return 'skip';
  if (i % 9 === 3) return [{ code: 'energy', value: 'slightly_lower' }];
  return 'normal';
}

// Starts normal, worsens steadily toward today — trend should read
// "Declining" by the end of the window.
function decliningPlan(i, total) {
  if (isSkipDay(i)) return 'skip';
  const daysFromStart = total - 1 - i; // 0 = oldest, increases toward today
  if (daysFromStart < 8) return 'normal';
  if (daysFromStart < 16) return daysFromStart % 3 === 0 ? [{ code: 'appetite', value: 'ate_little_less' }] : 'normal';
  if (daysFromStart < 23) return [{ code: 'appetite', value: 'ate_little_less' }, { code: 'energy', value: 'slightly_lower' }];
  return [{ code: 'appetite', value: 'ate_much_less' }, { code: 'energy', value: 'much_lower' }, { code: 'vomiting', value: 'once' }];
}

// Starts rough, steadily improves toward today — trend should read
// "Improving" by the end of the window.
function improvingPlan(i, total) {
  if (isSkipDay(i)) return 'skip';
  const daysFromStart = total - 1 - i;
  if (daysFromStart < 8) return [{ code: 'appetite', value: 'ate_much_less' }, { code: 'energy', value: 'much_lower' }];
  if (daysFromStart < 16) return [{ code: 'appetite', value: 'ate_little_less' }, { code: 'energy', value: 'slightly_lower' }];
  if (daysFromStart < 23) return daysFromStart % 3 === 0 ? [{ code: 'energy', value: 'slightly_lower' }] : 'normal';
  return 'normal';
}

async function seedInsightsTrends() {
  // Same names as the Insights mockup (Harper/Tribble/Auggie) so seeded
  // data is easy to recognize against the reference screenshots.
  const stable = await entities.Pet.create({
    species: 'Cat', name: 'Harper', breed: 'Tabby',
    birth_date: daysAgo(365 * 4), birth_date_precision: 'EXACT',
    sex: 'Female', altered_status: 'Yes',
    notes: `Seeded test pet — Insights Trends scenario (stable, ${HISTORY_DAYS} days).`,
  });
  const declining = await entities.Pet.create({
    species: 'Cat', name: 'Tribble', breed: 'Domestic Shorthair',
    birth_date: daysAgo(365 * 7), birth_date_precision: 'EXACT',
    sex: 'Male', altered_status: 'Yes',
    conditions: ['CKD'],
    notes: `Seeded test pet — Insights Trends scenario (declining, ${HISTORY_DAYS} days).`,
  });
  const improving = await entities.Pet.create({
    species: 'Dog', name: 'Auggie', breed: 'Beagle',
    birth_date: daysAgo(365 * 2), birth_date_precision: 'EXACT',
    sex: 'Male', altered_status: 'Yes',
    notes: `Seeded test pet — Insights Trends scenario (improving, ${HISTORY_DAYS} days).`,
  });

  // Independent across pets, so these three run in parallel; each pet's
  // own history is still written strictly oldest-to-newest internally.
  await Promise.all([
    seedCheckInHistory(stable, HISTORY_DAYS, stablePlan),
    seedCheckInHistory(declining, HISTORY_DAYS, decliningPlan),
    seedCheckInHistory(improving, HISTORY_DAYS, improvingPlan),
  ]);

  return [stable, declining, improving];
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
  {
    key: 'insights_trends',
    label: 'Insights Trends (Harper / Tribble / Auggie)',
    description: `${HISTORY_DAYS} days of Daily Check-In history across 3 pets with stable, declining, and improving wellness trends — for testing Insights charts.`,
    run: seedInsightsTrends,
  },
];
