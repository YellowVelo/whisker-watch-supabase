// Daily Check-In V1 — category list, question copy, and answer options.
// Data-only and separate from the flow component (DailyCheckInSheet.jsx)
// so new observation categories can be added later without touching the
// UI logic. Option `value`s must match `observation_options.value` in
// migration 0014 so severity scoring (src/lib/checkin/scoring.js) lines up.

import {
  UtensilsCrossed, Droplets, Home as HomeIcon, Waves, Loader2 as VomitIcon,
  Zap, Footprints, Wind, Sparkles, Heart, Pill, Scale, MoreHorizontal,
} from 'lucide-react';

// species: 'both' | 'cat' | 'dog' — options tagged with a species are only
// shown when the pet matches; untagged options show for every species.
export const CATEGORIES = [
  {
    code: 'appetite',
    label: 'Appetite',
    icon: UtensilsCrossed,
    question: (name, species, dayWord = 'today') => `How did ${name} eat ${dayWord}?`,
    answerType: 'enum',
    hasNote: true,
    hasPhoto: true,
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'ate_little_less', label: 'Ate a little less' },
      { value: 'ate_much_less', label: 'Ate much less' },
      { value: 'did_not_eat', label: 'Did not eat' },
      { value: 'ate_more', label: 'Ate more than usual' },
    ],
  },
  {
    code: 'water_intake',
    label: 'Water',
    icon: Droplets,
    question: (name, species, dayWord = 'today') => `Did ${name} drink differently ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'less_than_usual', label: 'Less than usual' },
      { value: 'more_than_usual', label: 'More than usual' },
      { value: 'much_more_than_usual', label: 'Much more than usual' },
    ],
  },
  {
    code: 'bathroom',
    label: 'Bathroom',
    icon: HomeIcon,
    question: (name, species, dayWord = 'today') => species === 'Dog'
      ? `Was ${name}'s urination different ${dayWord}?`
      : `Was ${name}'s litter box use different ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'more_frequent', label: 'More frequent', species: 'cat' },
      { value: 'less_frequent', label: 'Less frequent', species: 'cat' },
      { value: 'asked_to_go_out_more', label: 'Asked to go out more', species: 'dog' },
      { value: 'accident_indoors', label: 'Accident indoors', species: 'dog' },
      { value: 'straining', label: 'Straining' },
      { value: 'outside_litter_box', label: 'Outside the litter box', species: 'cat' },
      { value: 'blood_noticed', label: 'Blood noticed' },
    ],
  },
  {
    code: 'stool',
    label: 'Stool',
    icon: Waves,
    question: (name, species, dayWord = 'today') => `Was ${name}'s stool different ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'softer_than_usual', label: 'Softer than usual' },
      { value: 'diarrhea', label: 'Diarrhea' },
      { value: 'constipated', label: 'Constipated / no stool' },
      { value: 'blood_noticed', label: 'Blood noticed' },
    ],
  },
  {
    code: 'vomiting',
    label: 'Vomiting',
    icon: VomitIcon,
    question: (name, species, dayWord = 'today') => `Did ${name} vomit ${dayWord}?`,
    answerType: 'enum',
    hasPhoto: true,
    options: [
      { value: 'none', label: 'No' },
      { value: 'once', label: 'Once' },
      { value: 'more_than_once', label: 'More than once' },
      { value: 'hairball_only', label: 'Hairball only' },
    ],
  },
  {
    code: 'energy',
    label: 'Energy',
    icon: Zap,
    question: (name, species, dayWord = 'today') => `Was ${name}'s energy different ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'slightly_lower', label: 'Slightly lower' },
      { value: 'much_lower', label: 'Much lower' },
      { value: 'higher_than_usual', label: 'Higher than usual' },
    ],
  },
  {
    code: 'mobility',
    label: 'Mobility',
    icon: Footprints,
    question: (name, species, dayWord = 'today') => `Did ${name} move differently ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'hesitated_before_jumping', label: 'Hesitated before jumping', species: 'cat' },
      { value: 'jumped_less', label: 'Jumped less than usual', species: 'cat' },
      { value: 'could_not_reach_places', label: 'Could not reach usual places', species: 'cat' },
      { value: 'walked_less', label: 'Walked less', species: 'dog' },
      { value: 'limping', label: 'Limping', species: 'dog' },
      { value: 'difficulty_standing', label: 'Difficulty standing', species: 'dog' },
      { value: 'difficulty_stairs', label: 'Difficulty with stairs', species: 'dog' },
      { value: 'difficulty_car_furniture', label: 'Difficulty getting into car/furniture', species: 'dog' },
      { value: 'stairs_ramps_different', label: 'Used stairs/ramps differently' },
      { value: 'seemed_stiff', label: 'Seemed stiff', species: 'cat' },
      { value: 'stiff_after_resting', label: 'Seemed stiff after resting', species: 'dog' },
    ],
  },
  {
    code: 'breathing',
    label: 'Breathing',
    icon: Wind,
    question: (name, species, dayWord = 'today') => `Was ${name}'s breathing different ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'coughing', label: 'Coughing' },
      { value: 'panting_at_rest', label: 'Panting at rest' },
      { value: 'breathing_harder', label: 'Breathing harder than usual' },
      { value: 'sneezing_discharge', label: 'Sneezing / nasal discharge' },
    ],
  },
  {
    code: 'itching',
    label: 'Skin / Itching',
    icon: Sparkles,
    question: (name, species, dayWord = 'today') => `Did ${name} scratch, lick, or chew more ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'scratching_more', label: 'Scratching more' },
      { value: 'licking_paws_body', label: 'Licking paws/body' },
      { value: 'chewing_skin', label: 'Chewing skin' },
      { value: 'new_hair_loss_irritation', label: 'New hair loss or irritated area' },
    ],
  },
  {
    code: 'behavior',
    label: 'Mood / Behavior',
    icon: Heart,
    question: (name, species, dayWord = 'today') => `Was ${name}'s behavior different ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'hiding_more', label: 'Hiding more' },
      { value: 'restless', label: 'Restless' },
      { value: 'clingier', label: 'Clingier than usual' },
      { value: 'less_interested', label: 'Less interested in people/play' },
      { value: 'aggressive_reactive', label: 'Aggressive or unusually reactive' },
      { value: 'confused_pacing', label: 'Confused / pacing' },
    ],
  },
  {
    code: 'medication_exception',
    label: 'Medication',
    icon: Pill,
    question: (name, species, dayWord = 'today') => `Was anything different with ${name}'s medication ${dayWord}?`,
    answerType: 'enum',
    options: [
      { value: 'no_change', label: 'No change' },
      { value: 'missed_dose', label: 'Missed dose' },
      { value: 'dose_changed', label: 'Dose changed' },
      { value: 'new_medication', label: 'New medication' },
      { value: 'side_effect_noticed', label: 'Side effect noticed' },
      { value: 'stopped_medication', label: 'Stopped medication' },
    ],
  },
  {
    code: 'weight',
    label: 'Weight',
    icon: Scale,
    question: (name, species, dayWord = 'today') => `Was ${name}'s weight updated ${dayWord}?`,
    answerType: 'number',
  },
  {
    code: 'other',
    label: 'Other',
    icon: MoreHorizontal,
    question: () => 'Anything else you noticed?',
    answerType: 'text',
    hasPhoto: true,
  },
];

export function getCategory(code) {
  return CATEGORIES.find((c) => c.code === code);
}

// Options relevant to this pet's species: untagged options always show;
// species-tagged options only show for a matching species.
export function getOptionsForSpecies(category, species) {
  const targetSpecies = species === 'Dog' ? 'dog' : 'cat';
  return category.options.filter((o) => !o.species || o.species === targetSpecies);
}
