// Life stage is derived at read time, never stored, so it can't go stale
// as a pet ages. Age-band cutoffs are a product default, not from spec:
// Cats: Kitten <1yr, Adult 1-10yr, Senior 11yr+
// Dogs: Puppy <1yr, Adult 1-7yr, Senior 8yr+
const BANDS = {
  Cat: { young: 'Kitten', juniorCutoff: 1, seniorCutoff: 11 },
  Dog: { young: 'Puppy', juniorCutoff: 1, seniorCutoff: 8 },
};

export function computeLifeStage(species, birthDate, birthDatePrecision) {
  if (!birthDate || birthDatePrecision === 'UNKNOWN' || !birthDatePrecision) return null;

  const band = BANDS[species] || BANDS.Cat;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let ageYears = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    ageYears -= 1;
  }

  if (ageYears < band.juniorCutoff) return band.young;
  if (ageYears >= band.seniorCutoff) return 'Senior';
  return 'Adult';
}

// Human-readable age for display (e.g. "3 yrs"), falling back to the life
// stage label when birth date precision is too coarse for an exact count.
export function computeAge(pet) {
  if (pet.birth_date && pet.birth_date_precision && pet.birth_date_precision !== 'UNKNOWN') {
    const birth = new Date(pet.birth_date);
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) years -= 1;
      if (years >= 1) return `${years} yr${years === 1 ? '' : 's'}`;
      return 'Under 1 yr';
    }
  }
  return computeLifeStage(pet.species, pet.birth_date, pet.birth_date_precision);
}
