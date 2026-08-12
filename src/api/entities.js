import { createEntityClient } from './entityClient';

// Entity keys now match the app's actual pet-tracking naming
// (Pet, PetFood, etc.), mapped to their underlying Supabase tables.

export const entities = {
  Profile: createEntityClient('profiles'),
  Pet: createEntityClient('pets'),
  PetFood: createEntityClient('pet_foods'),
  FoodLog: createEntityClient('food_logs'),
  Medication: createEntityClient('medications'),
  Vaccination: createEntityClient('vaccinations'),
  Bloodwork: createEntityClient('bloodwork'),
  SymptomLog: createEntityClient('symptom_logs'),
  PetSit: createEntityClient('pet_sits'),
  PetSitLog: createEntityClient('pet_sit_logs'),
  PetSitterAccess: createEntityClient('pet_sitter_access'),
  PetCoOwner: createEntityClient('pet_co_owners'),
  PetOnboarding: createEntityClient('pet_onboarding'),
  DailyCheckIn: createEntityClient('daily_check_ins'),
  ObservationType: createEntityClient('observation_types'),
  ObservationOption: createEntityClient('observation_options'),
  Observation: createEntityClient('observations'),
  PetBaseline: createEntityClient('pet_baselines'),
  WellnessScore: createEntityClient('wellness_scores'),
  Notification: createEntityClient('notifications'),
  // Admin-only reads/updates (spec 0053) — inserts happen via the public
  // beta-signup Edge Function, never through this client, so .create()'s
  // created_by-stamping behavior is never exercised for this entity.
  BetaSignup: createEntityClient('beta_signups'),
};

