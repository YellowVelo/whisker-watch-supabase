// Server copies of the app's rule lists that ask-vet-assistant needs once it
// writes the AI instructions itself (spec 0080, Before You Approve item 3).
// Edge Functions can't read the app's files, so each list is copied here:
//   - EMERGENCY_KEYWORD_PATTERNS /
//     detectEmergencyKeywords() = src/lib/aiGuardrails.js
//   - BLOODWORK_FIELDS          = src/lib/bloodworkFields.js (key, label, unit)
//   - baseline option labels    = src/lib/onboardingConfig.js (used by the
//                                 port of src/lib/baselineContext.js)
//   - PET_SCREEN_NAMES          = src/lib/petScreenContext.js
// src/lib/aiServerParity.test.js fails if any of these drift apart.
//
// No imports on purpose, so Vitest (under Node) can load this file too.

// ---------------------------------------------------------------------------
// Emergency keyword hard stop (spec 0041). Sourced from the Terms of
// Service's "Emergency situations" list. Keep in step with the app's copy.
// ---------------------------------------------------------------------------
export interface EmergencyCategory {
  category: string;
  patterns: readonly RegExp[];
}

export const EMERGENCY_KEYWORD_PATTERNS: readonly EmergencyCategory[] = [
  {
    category: 'Difficulty breathing',
    patterns: [
      /\bcan'?t breathe\b/i,
      /\bcannot breathe\b/i,
      /\bdifficulty breathing\b/i,
      /\btrouble breathing\b/i,
      /\bstruggling to breathe\b/i,
      /\bnot breathing\b/i,
      /\bgasping\b/i,
      /\bchoking\b/i,
      /\bturning blue\b/i,
    ],
  },
  {
    category: 'Collapse',
    patterns: [
      /\bcollapsed\b/i,
      /\bpassed out\b/i,
      /\bunconscious\b/i,
      /\bwon'?t wake up\b/i,
      /\bnon-?responsive\b/i,
      /\bunresponsive\b/i,
    ],
  },
  {
    category: 'Seizure',
    patterns: [
      /\bseizure\b/i,
      /\bseizing\b/i,
      /\bconvulsion\b/i,
      /\bconvulsing\b/i,
    ],
  },
  {
    category: 'Suspected poisoning',
    patterns: [
      /\bpoison(ed|ing)?\b/i,
      /\btoxic\b/i,
      /\btoxin\b/i,
      /\bantifreeze\b/i,
      /\bswallowed (something|a)\b/i,
      /\bate (rat poison|a battery|chocolate)\b/i,
      /\bingested\b/i,
      /\boverdose[ds]?\b/i,
    ],
  },
  {
    category: 'Uncontrolled bleeding',
    patterns: [
      /\buncontrolled bleeding\b/i,
      /\bwon'?t stop bleeding\b/i,
      /\bbleeding (a lot|heavily|profusely|badly)\b/i,
      /\bhemorrhag(e|ing)\b/i,
    ],
  },
  {
    category: 'Inability to urinate',
    patterns: [
      /\bcan'?t (pee|urinate)\b/i,
      /\bunable to urinate\b/i,
      /\bnot urinating\b/i,
      /\bstraining to (pee|urinate)\b/i,
      /\bblocked bladder\b/i,
    ],
  },
  {
    category: 'Severe trauma',
    patterns: [
      /\bhit by a car\b/i,
      /\bhit by a vehicle\b/i,
      /\bsevere trauma\b/i,
      /\bbroken bone\b/i,
      /\bopen wound\b/i,
      /\bfell from\b/i,
      /\bdeep wound\b/i,
      /\bimpaled\b/i,
    ],
  },
];

// Curly apostrophes (iPhone Smart Punctuation, U+2019 / U+2018, and the
// look-alike U+02BC) are turned into a straight ' first, so "can’t breathe"
// matches the same as "can't breathe".
const CURLY_APOSTROPHES = /[\u2018\u2019\u02BC]/g;

// Returns the matched category name, or null if nothing matches.
export function detectEmergencyKeywords(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = text.replace(CURLY_APOSTROPHES, "'");
  for (const { category, patterns } of EMERGENCY_KEYWORD_PATTERNS) {
    if (patterns.some((re) => re.test(normalized))) return category;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bloodwork numeric fields the bloodwork scan asks the AI for.
// ---------------------------------------------------------------------------
export interface BloodworkField {
  key: string;
  label: string;
  unit: string;
}

export const BLOODWORK_FIELDS: readonly BloodworkField[] = [
  { key: 'bun', label: 'BUN', unit: 'mg/dL' },
  { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL' },
  { key: 'sdma', label: 'SDMA', unit: 'µg/dL' },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg/dL' },
  { key: 'potassium', label: 'Potassium', unit: 'mEq/L' },
  { key: 'sodium', label: 'Sodium', unit: 'mEq/L' },
  { key: 'calcium', label: 'Calcium', unit: 'mg/dL' },
  { key: 'hematocrit', label: 'Hematocrit', unit: '%' },
  { key: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL' },
  { key: 'total_protein', label: 'Total Protein', unit: 'g/dL' },
  { key: 'albumin', label: 'Albumin', unit: 'g/dL' },
  { key: 'alt', label: 'ALT', unit: 'U/L' },
  { key: 'ast', label: 'AST', unit: 'U/L' },
  { key: 'alkaline_phosphatase', label: 'Alk Phos', unit: 'U/L' },
  { key: 'glucose', label: 'Glucose', unit: 'mg/dL' },
  { key: 't4', label: 'T4 Thyroid', unit: 'µg/dL' },
];

// ---------------------------------------------------------------------------
// Baseline option labels (pet_onboarding answers), for the server port of
// formatBaselineForAI.
// ---------------------------------------------------------------------------
export interface OptionLabel {
  value: string;
  label: string;
}

export const HEALTH_OPTIONS = (petName: string): OptionLabel[] => [
  { value: 'healthy', label: `${petName} is generally healthy` },
  { value: 'ongoing_conditions', label: `${petName} has one or more ongoing health conditions` },
  { value: 'unsure', label: "I'm not sure" },
];

export const APPETITE_OPTIONS: readonly OptionLabel[] = [
  { value: 'always_finishes', label: 'Always finishes meals' },
  { value: 'usually_finishes', label: 'Usually finishes meals' },
  { value: 'leaves_some', label: 'Leaves some food' },
  { value: 'free_feeds', label: 'Free feeds' },
];

export const WATER_OPTIONS: readonly OptionLabel[] = [
  { value: 'very_little', label: 'Very little' },
  { value: 'about_average', label: 'About average' },
  { value: 'more_than_most', label: 'More than most pets' },
];

export const ENERGY_OPTIONS: readonly OptionLabel[] = [
  { value: 'very_active', label: 'Very active' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'calm', label: 'Calm' },
];

const MOBILITY_OPTIONS_BY_SPECIES: Record<'Cat' | 'Dog', readonly OptionLabel[]> = {
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

export const getMobilityOptions = (species: string | null | undefined): readonly OptionLabel[] =>
  species === 'Dog' ? MOBILITY_OPTIONS_BY_SPECIES.Dog : MOBILITY_OPTIONS_BY_SPECIES.Cat;

const BATHROOM_OPTIONS_BY_SPECIES: Record<'Cat' | 'Dog', readonly OptionLabel[]> = {
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

export const getBathroomOptions = (species: string | null | undefined): readonly OptionLabel[] =>
  species === 'Dog' ? BATHROOM_OPTIONS_BY_SPECIES.Dog : BATHROOM_OPTIONS_BY_SPECIES.Cat;

// ---------------------------------------------------------------------------
// Screen names Ask Wysker may report the owner is looking at.
// ---------------------------------------------------------------------------
export const PET_SCREEN_NAMES: readonly string[] = [
  'Overview',
  'Trends',
  'Timeline',
  'Food',
  'Vet Export',
  'Profile',
];
