// Expanded per spec 0029 FR-008. Species tags decide which conditions show
// per species (e.g. FLUTD is cats-only); categories drive ConditionsPicker's
// grouped display.
//
// 'Allergies' and 'Liver Disease' are carried over from the pre-expansion
// lists (not in the spec's suggested categories) so no existing pet's
// selected condition silently disappears from the picker.
export const CONDITION_CATEGORIES = {
  'Digestive': [
    { name: 'IBD (Inflammatory Bowel Disease)', species: ['Cat', 'Dog'] },
    { name: 'Pancreatitis', species: ['Cat', 'Dog'] },
    { name: 'Sensitive Stomach', species: ['Cat', 'Dog'] },
  ],
  'Kidney & Urinary': [
    { name: 'Chronic Kidney Disease (CKD)', species: ['Cat', 'Dog'] },
    { name: 'Acute Kidney Injury (AKI)', species: ['Cat', 'Dog'] },
    { name: 'FLUTD (Cats)', species: ['Cat'] },
  ],
  'Heart': [
    { name: 'Heart Disease', species: ['Cat', 'Dog'] },
    { name: 'Heart Murmur', species: ['Cat', 'Dog'] },
    { name: 'Congestive Heart Failure', species: ['Cat', 'Dog'] },
  ],
  'Endocrine': [
    { name: 'Diabetes Mellitus', species: ['Cat', 'Dog'] },
    { name: 'Hyperthyroidism', species: ['Cat', 'Dog'] },
    { name: 'Hypothyroidism', species: ['Cat', 'Dog'] },
    { name: "Addison's Disease", species: ['Cat', 'Dog'] },
    { name: "Cushing's Disease", species: ['Cat', 'Dog'] },
  ],
  'Neurological': [
    { name: 'Epilepsy', species: ['Cat', 'Dog'] },
    { name: 'Vestibular Disease', species: ['Cat', 'Dog'] },
    { name: 'Cognitive Dysfunction', species: ['Cat', 'Dog'] },
  ],
  'Orthopedic & Mobility': [
    { name: 'Arthritis', species: ['Cat', 'Dog'] },
    { name: 'Hip Dysplasia', species: ['Dog'] },
    { name: 'Luxating Patella', species: ['Cat', 'Dog'] },
    { name: 'CCL Injury', species: ['Dog'] },
    { name: 'IVDD', species: ['Dog'] },
    { name: 'Previous Orthopedic Injury', species: ['Cat', 'Dog'] },
  ],
  'Respiratory': [
    { name: 'Asthma', species: ['Cat', 'Dog'] },
    { name: 'Chronic Bronchitis', species: ['Cat', 'Dog'] },
    { name: 'Collapsing Trachea', species: ['Dog'] },
  ],
  'Cancer': [
    { name: 'Cancer', species: ['Cat', 'Dog'] },
    { name: 'Previous Cancer', species: ['Cat', 'Dog'] },
  ],
  'Vision & Hearing': [
    { name: 'Blindness', species: ['Cat', 'Dog'] },
    { name: 'Deafness', species: ['Cat', 'Dog'] },
  ],
  'Other': [
    { name: 'Anxiety', species: ['Cat', 'Dog'] },
    { name: 'Dental Disease', species: ['Cat', 'Dog'] },
    { name: 'Allergies', species: ['Cat', 'Dog'] },
    { name: 'Liver Disease', species: ['Cat', 'Dog'] },
  ],
};

export const getConditionCategories = (species) => {
  const tag = species === 'Dog' ? 'Dog' : 'Cat';
  const result = {};
  for (const [category, conditions] of Object.entries(CONDITION_CATEGORIES)) {
    const names = conditions.filter((c) => c.species.includes(tag)).map((c) => c.name);
    if (names.length) result[category] = names;
  }
  return result;
};

export const getPetLabel = (species) => species === 'Dog' ? 'Dog' : 'Cat';

export const CAT_VACCINES = ['Rabies', 'FVRCP (Distemper combo)', 'FeLV', 'Bordetella', 'FIP', 'FIV'];
export const DOG_VACCINES = ['Rabies', 'DHPP (Distemper combo)', 'Bordetella', 'Leptospirosis', 'Lyme', 'Canine Influenza', 'Rattlesnake'];
export const getVaccines = (species) => species === 'Dog' ? DOG_VACCINES : CAT_VACCINES;
