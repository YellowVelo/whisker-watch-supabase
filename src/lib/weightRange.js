// The weight value rule (spec 0081): 0.1–300 lbs, after rounding to one
// decimal. Kept in its own small module with no imports so both
// `weightClient.js` and `checkin/checkinClient.js` can use it without
// importing each other (weightClient already imports checkinClient for the
// observation catalog). `weightClient.js` re-exports these, so screens
// keep importing from there.

export const WEIGHT_MIN_LBS = 0.1;
export const WEIGHT_MAX_LBS = 300;

export const roundLbs = (n) => Math.round(Number(n) * 10) / 10;

// The value as it will be saved (rounded to one decimal), or a thrown Error
// with code 'weight_out_of_range' (wording B) if it's missing, not a number
// or outside the range.
export function checkWeightLbs(lbs) {
  const n = Number(lbs);
  if (lbs === null || lbs === undefined || lbs === '' || !Number.isFinite(n)
    || roundLbs(n) < WEIGHT_MIN_LBS || roundLbs(n) > WEIGHT_MAX_LBS) {
    throw Object.assign(new Error('weight out of range'), { code: 'weight_out_of_range' });
  }
  return roundLbs(n);
}

// True when `lbs` passes the same rule, for forms that check as the owner
// types (onboarding's starting weight, the check-in's Weight box).
export function isValidWeight(lbs) {
  try {
    checkWeightLbs(lbs);
    return true;
  } catch {
    return false;
  }
}
