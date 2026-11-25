import { entities } from '@/api/entities';
import { markGreatDay, markSkipped, markOffTough } from '@/lib/checkin/checkinClient';
import { addWeight } from '@/lib/weightClient';

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

// daysAgo() gives UTC calendar dates, so seeded weights are checked
// against today in UTC too (addWeight refuses a future date).
const SEED_TIMEZONE = 'UTC';

// Seeded weights used to be stored in grams on the old symptom logs; they
// now go to weight observations in lbs, rounded to one decimal
// (29500 g -> 65.0 lbs), as weightClient stores them.
export const GRAMS_PER_LB = 453.59237;
export function gramsToLbs(grams) {
  return Math.round((grams / GRAMS_PER_LB) * 10) / 10;
}

// ── Daily Check-In history backfill (for testing Trends charts) ──
// Reuses the same markGreatDay/markSkipped/markOffTough functions the real
// Daily Check-In UI calls, so seeded symptom counts are computed
// identically to a real user's data — no separate scoring logic here.
// Every non-normal/non-skip day is seeded as an "Off Day" — Vibe wording
// isn't meaningful to these charts, only the symptom counts are.
const HISTORY_DAYS = 30;

// planFor(i, total) returns 'normal' | 'skip' | a selections array
// (`{ code, values: [...] }[]`) for markOffTough. i counts down from
// `total - 1` (oldest day) to 0 (today).
async function seedCheckInHistory(pet, days, planFor) {
  // Oldest -> newest, one at a time: each day's symptom count is computed
  // from the history accumulated so far, same as it would be for a real
  // user checking in day by day. Do not parallelize this loop.
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgo(i);
    const plan = planFor(i, days);
    if (plan === 'skip') {
      await markSkipped(pet.id, date, 'app');
    } else if (plan === 'normal') {
      await markGreatDay(pet.id, date, 'app');
    } else {
      await markOffTough(pet.id, date, 'off', plan, 'app');
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
  if (i % 9 === 3) return [{ code: 'energy', values: ['slightly_lower'] }];
  return 'normal';
}

// Starts normal, symptom count climbs steadily toward today.
function decliningPlan(i, total) {
  if (isSkipDay(i)) return 'skip';
  const daysFromStart = total - 1 - i; // 0 = oldest, increases toward today
  if (daysFromStart < 8) return 'normal';
  if (daysFromStart < 16) return daysFromStart % 3 === 0 ? [{ code: 'appetite', values: ['ate_little_less'] }] : 'normal';
  if (daysFromStart < 23) return [{ code: 'appetite', values: ['ate_little_less'] }, { code: 'energy', values: ['slightly_lower'] }];
  return [{ code: 'appetite', values: ['ate_much_less'] }, { code: 'energy', values: ['much_lower'] }, { code: 'vomiting', values: ['once'] }];
}

// Starts rough, symptom count falls steadily toward today.
function improvingPlan(i, total) {
  if (isSkipDay(i)) return 'skip';
  const daysFromStart = total - 1 - i;
  if (daysFromStart < 8) return [{ code: 'appetite', values: ['ate_much_less'] }, { code: 'energy', values: ['much_lower'] }];
  if (daysFromStart < 16) return [{ code: 'appetite', values: ['ate_little_less'] }, { code: 'energy', values: ['slightly_lower'] }];
  if (daysFromStart < 23) return daysFromStart % 3 === 0 ? [{ code: 'energy', values: ['slightly_lower'] }] : 'normal';
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

  // The old meal-log row, now a current-diet entry (same day as before).
  await entities.PetFood.create({
    pet_id: pet.id,
    name: 'Adult Dog Formula',
    food_type: 'Dry food',
    start_date: daysAgo(1),
    active: true,
  });

  // Three Great Day check-ins (oldest first, as a real owner would check
  // in), each day with one weight. addWeight keeps one weight per pet per
  // day: a re-run on the same day updates that day's weight.
  for (let i = 2; i >= 0; i--) {
    const date = daysAgo(i);
    await markGreatDay(pet.id, date, 'app');
    await addWeight(pet.id, { date, lbs: gramsToLbs(29500) }, SEED_TIMEZONE);
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
    await markGreatDay(pet.id, daysAgo(0), 'app');
  }

  return [dog, cat, kitten];
}

// Demo account showcase: a senior cat trending down and a healthy dog
// staying stable, so the Home/Insights screens have something worth
// looking at, plus a few medication/current-diet/vaccination records for
// variety. Reuses the same seedCheckInHistory/plan helpers as the
// Insights Trends test scenario above — same scoring, same code path.
// Fixed, permanent images uploaded to a path outside any user's own
// storage folder (`shared/`), so reset-sandbox-account's per-user
// storage sweep never deletes them — every reseed points back at the
// same files.
// Stock demo photos (not real animals), copied into each environment's own
// uploads bucket under shared/, which every signed-in user may view
// (spec 0071, migration 0054).
const DEMO_CAT_PHOTO_PATH = 'shared/maple.jpg';
const DEMO_DOG_PHOTO_PATH = 'shared/cooper.jpg';

async function seedDemoShowcase() {
  // Independent of each other, so both pets are created in parallel.
  const [cat, dog] = await Promise.all([
    entities.Pet.create({
      species: 'Cat', name: 'Maple', breed: 'Domestic Shorthair',
      birth_date: daysAgo(365 * 9), birth_date_precision: 'YEAR',
      sex: 'Female', altered_status: 'Yes',
      conditions: ['CKD'],
      photo_path: DEMO_CAT_PHOTO_PATH,
      notes: `Seeded demo pet — senior cat, declining wellness trend (${HISTORY_DAYS} days).`,
    }),
    entities.Pet.create({
      species: 'Dog', name: 'Cooper', breed: 'Golden Retriever',
      birth_date: daysAgo(365 * 3), birth_date_precision: 'EXACT',
      sex: 'Male', altered_status: 'Yes',
      photo_path: DEMO_DOG_PHOTO_PATH,
      notes: `Seeded demo pet — healthy adult dog, stable wellness trend (${HISTORY_DAYS} days).`,
    }),
  ]);

  // Flavor records reference cat/dog ids but not each other, so these
  // and the check-in histories below all run as independent batches.
  await Promise.all([
    entities.Medication.create({
      pet_id: cat.id,
      name: 'Benazepril',
      med_type: 'General',
      prescribed: true,
      dosage: '2.5mg',
      frequency: 'Once daily',
      route: 'Oral',
      start_date: daysAgo(60),
      prescribing_vet: 'Dr. Alvarez, DVM',
      active: true,
    }),
    entities.Vaccination.create({
      pet_id: dog.id,
      vaccine_name: 'Rabies',
      date_given: daysAgo(120),
      next_due_date: daysAgo(-245),
      administered_by: 'Dr. Kim, DVM',
    }),
    ...[cat, dog].map((pet) => entities.PetFood.create({
      pet_id: pet.id,
      name: 'Adult Formula',
      food_type: 'Dry food',
      start_date: daysAgo(1),
      active: true,
    })),
  ]);

  // Independent pets, so their histories can seed in parallel; each
  // pet's own history is still written strictly oldest-to-newest.
  await Promise.all([
    seedCheckInHistory(cat, HISTORY_DAYS, decliningPlan),
    seedCheckInHistory(dog, HISTORY_DAYS, stablePlan),
  ]);

  return [cat, dog];
}

// `audience` scopes which account type(s) see a scenario in Settings'
// Seed Data picker (src/pages/Settings.jsx) — 'test'-flavored scenarios
// aren't meaningful on the demo account and vice versa.
export const SEED_SCENARIOS = [
  { key: 'empty', label: 'Empty Account', description: 'No pets — clears existing sample data only.', run: async () => [], audience: ['test', 'demo'] },
  { key: 'healthy_dog', label: 'Healthy Dog', description: 'One healthy adult dog with routine logs.', run: seedHealthyDog, audience: ['test'] },
  { key: 'multi_pet', label: 'Multi-Pet Household', description: 'A dog, an adult cat, and a kitten.', run: seedMultiPetHousehold, audience: ['test'] },
  {
    key: 'insights_trends',
    label: 'Insights Trends (Harper / Tribble / Auggie)',
    description: `${HISTORY_DAYS} days of Daily Check-In history across 3 pets with stable, declining, and improving wellness trends — for testing Insights charts.`,
    run: seedInsightsTrends,
    audience: ['test'],
  },
  {
    key: 'demo_showcase',
    label: 'Demo Showcase (Maple & Cooper)',
    description: `${HISTORY_DAYS} days of history across a senior cat (declining trend) and a healthy dog (stable trend), plus sample medication/food/vaccination records — for the Demo account.`,
    run: seedDemoShowcase,
    audience: ['demo'],
  },
];
