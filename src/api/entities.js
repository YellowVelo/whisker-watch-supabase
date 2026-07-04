import { createEntityClient } from './entityClient';

// Entity keys now match the app's actual pet-tracking naming
// (Pet, PetFood, etc.), mapped to their underlying Supabase tables.

export const entities = {
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
};

