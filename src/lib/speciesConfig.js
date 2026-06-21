export const CAT_CONDITIONS = ['IBD', 'CKD', 'Diabetes', 'Hyperthyroidism', 'Pancreatitis', 'Liver Disease', 'Other'];
export const DOG_CONDITIONS = ['Hip Dysplasia', 'Allergies', 'Epilepsy', "Cushing's Disease", 'Hypothyroidism', 'Arthritis', 'Cancer', 'Other'];

export const getConditions = (species) => species === 'Dog' ? DOG_CONDITIONS : CAT_CONDITIONS;
export const getPetEmoji = (species) => species === 'Dog' ? '🐶' : '🐱';
export const getPetLabel = (species) => species === 'Dog' ? 'Dog' : 'Cat';

export const CAT_VACCINES = ['Rabies', 'FVRCP (Distemper combo)', 'FeLV', 'Bordetella', 'FIP', 'FIV'];
export const DOG_VACCINES = ['Rabies', 'DHPP (Distemper combo)', 'Bordetella', 'Leptospirosis', 'Lyme', 'Canine Influenza', 'Rattlesnake'];
export const getVaccines = (species) => species === 'Dog' ? DOG_VACCINES : CAT_VACCINES;