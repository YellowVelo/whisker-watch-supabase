// Pet Onboarding ("Complete {PetName}'s Profile") — card copy, options, and
// step-order logic. Kept data-only and separate from the wizard engine
// (OnboardingWizard.jsx) so future cards can be inserted or reordered
// without touching component logic.

export const HEALTH_OPTIONS = (petName) => [
  { value: 'healthy', label: `${petName} is generally healthy` },
  { value: 'ongoing_conditions', label: `${petName} has one or more ongoing health conditions` },
  { value: 'unsure', label: "I'm not sure" },
];

export const MEDICATIONS_YES_NO_OPTIONS = [
  { value: 'none', label: 'No' },
  { value: 'has_medications', label: 'Yes' },
];

export const APPETITE_OPTIONS = [
  { value: 'always_finishes', label: 'Always finishes meals' },
  { value: 'usually_finishes', label: 'Usually finishes meals' },
  { value: 'leaves_some', label: 'Leaves some food' },
  { value: 'free_feeds', label: 'Free feeds' },
];

export const WATER_OPTIONS = [
  { value: 'very_little', label: 'Very little' },
  { value: 'about_average', label: 'About average' },
  { value: 'more_than_most', label: 'More than most pets' },
];

export const ENERGY_OPTIONS = [
  { value: 'very_active', label: 'Very active' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'calm', label: 'Calm' },
];

const MOBILITY_OPTIONS_BY_SPECIES = {
  Cat: [
    { value: 'jumps_everywhere', label: 'Jumps everywhere' },
    { value: 'moves_normally', label: 'Moves normally' },
    { value: 'doesnt_jump_much', label: "Doesn't jump very much" },
    { value: 'uses_ramps_stairs', label: 'Uses ramps or stairs' },
  ],
  Dog: [
    { value: 'loves_walks_running', label: 'Loves walks and running' },
    { value: 'active_but_moderate', label: 'Active but moderate' },
    { value: 'tires_easily', label: 'Tires easily' },
    { value: 'uses_ramps_stairs', label: 'Uses ramps or stairs' },
  ],
};
export const getMobilityOptions = (species) => MOBILITY_OPTIONS_BY_SPECIES[species] || MOBILITY_OPTIONS_BY_SPECIES.Cat;

const BATHROOM_OPTIONS_BY_SPECIES = {
  Cat: [
    { value: 'litter_1_2x', label: 'Uses the litter box 1–2 times a day' },
    { value: 'litter_3_4x', label: 'Uses the litter box 3–4 times a day' },
    { value: 'litter_5plus', label: 'Uses the litter box 5+ times a day' },
    { value: 'varies', label: 'Varies day to day' },
  ],
  Dog: [
    { value: 'walks_1_2x', label: '1–2 walks/bathroom breaks a day' },
    { value: 'walks_3_4x', label: '3–4 walks/bathroom breaks a day' },
    { value: 'walks_5plus', label: '5+ walks/bathroom breaks a day' },
    { value: 'varies', label: 'Varies day to day' },
  ],
};
export const getBathroomOptions = (species) => BATHROOM_OPTIONS_BY_SPECIES[species] || BATHROOM_OPTIONS_BY_SPECIES.Cat;

export const FREQUENCY_OPTIONS = ['Once daily', 'Twice daily', 'Every other day', 'Weekly', 'Monthly', 'As needed', 'Other'];

// Given the current onboarding row, determine which step comes after `step`.
// This is the single source of truth for conditional navigation (skip
// Conditions for healthy pets, skip Medication Entry when there are none).
export function getNextStep(step, row) {
  switch (step) {
    case 'health':
      return row.health_status === 'ongoing_conditions' ? 'conditions' : 'medications';
    case 'conditions':
      return 'medications';
    case 'medications':
      return row.medications_status === 'has_medications' ? 'medication_entry' : 'transition';
    case 'medication_entry':
      return 'transition';
    case 'transition':
      return 'appetite';
    case 'appetite':
      return 'water';
    case 'water':
      return 'energy';
    case 'energy':
      return 'mobility';
    case 'mobility':
      return 'bathroom';
    case 'bathroom':
      return 'completed';
    default:
      return 'completed';
  }
}

// Ordered list of steps that will actually be shown for the current
// answers, used to render "Step X of Y" progress.
export function getVisibleSteps(row) {
  const steps = ['health'];
  if (row.health_status === 'ongoing_conditions') steps.push('conditions');
  steps.push('medications');
  if (row.medications_status === 'has_medications') steps.push('medication_entry');
  steps.push('transition', 'appetite', 'water', 'energy', 'mobility', 'bathroom');
  return steps;
}
