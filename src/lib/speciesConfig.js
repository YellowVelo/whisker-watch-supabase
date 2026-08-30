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

// Alternate wordings the AI (or an owner) might use for each canonical vaccine
// on the known list above. Used only to anchor fuzzy matching to vaccines the
// app already recognizes by name — see FR-002 of spec 0064.
const VACCINE_ALIASES = {
  'Rabies': ['rabies'],
  'FVRCP (Distemper combo)': ['fvrcp', 'distemper'],
  'DHPP (Distemper combo)': ['dhpp', 'dhlpp', 'da2pp', 'distemper'],
  'FeLV': ['felv', 'feline leukemia'],
  'Bordetella': ['bordetella', 'kennel cough'],
  'FIP': ['fip'],
  'FIV': ['fiv'],
  'Leptospirosis': ['leptospirosis', 'lepto'],
  'Lyme': ['lyme'],
  'Canine Influenza': ['canine influenza', 'dog flu', 'civ'],
  'Rattlesnake': ['rattlesnake'],
};

// Resolves a raw vaccine name string to one of this species' canonical
// vaccine names, or null if it doesn't clearly match any of them.
const resolveCanonicalVaccine = (name, species) => {
  const normalized = name?.toLowerCase().trim();
  if (!normalized) return null;
  const canonicalList = getVaccines(species);
  for (const canonical of canonicalList) {
    const aliases = VACCINE_ALIASES[canonical] || [];
    if (aliases.some((alias) => normalized.includes(alias))) {
      return canonical;
    }
  }
  return null;
};

// Compares two raw vaccine name strings for "same vaccine" purposes (spec
// 0064). If both resolve to the same canonical vaccine on this species'
// known list, they're a match even if worded differently. Otherwise, falls
// back to an exact (case-insensitive, trimmed) comparison — never guesses at
// unfamiliar names.
export const vaccineNamesMatch = (nameA, nameB, species) => {
  const canonicalA = resolveCanonicalVaccine(nameA, species);
  const canonicalB = resolveCanonicalVaccine(nameB, species);
  if (canonicalA && canonicalB) return canonicalA === canonicalB;
  return (nameA || '').toLowerCase().trim() === (nameB || '').toLowerCase().trim();
};
