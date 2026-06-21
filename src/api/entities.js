import { createEntityClient } from './entityClient';

// NOTE: keys here intentionally still match the OLD Base44 entity names
// (Cat, CatFood, etc.) so this is a drop-in replacement for
// `base44.entities.X` calls throughout the existing codebase. Once this
// is working end-to-end, we'll do the Cat -> Pet rename pass across the
// app and rename these keys too (e.g. Cat -> Pet, mapped to the `pets`
// table either way).

export const entities = {
  Cat: createEntityClient('pets'),
  CatFood: createEntityClient('pet_foods'),
  FoodLog: createEntityClient('food_logs'),
  Medication: createEntityClient('medications'),
  Vaccination: createEntityClient('vaccinations'),
  Bloodwork: createEntityClient('bloodwork'),
  SymptomLog: createEntityClient('symptom_logs'),
  PetSit: createEntityClient('pet_sits'),
  PetSitLog: createEntityClient('pet_sit_logs'),
  PetSitterAccess: createEntityClient('pet_sitter_access'),
};
