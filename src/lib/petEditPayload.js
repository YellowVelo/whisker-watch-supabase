import { resolveDate } from '@/components/onboarding/fields/DateInfoFields';

// The `pets` update Edit Pet sends on Save (spec 0036). `loadedPhotoPath`
// is the form's photo_path as it was loaded. photo_path is only sent when
// the person changed the photo in this form (spec 0083 FR1): if a
// co-owner's form re-sent a path the primary owner has since replaced,
// migration 0062's protect_pet_photo_path() would refuse the whole save
// and lose their other edits.
export function buildPetUpdatePayload(form, pet, loadedPhotoPath) {
  const isDog = pet.species === 'Dog';
  const birthParts = { exact: form.birthDate, monthYear: form.birthMonthYear, year: form.birthYear };
  const gotchaParts = { exact: form.gotchaDate, monthYear: form.gotchaMonthYear, year: form.gotchaYear };

  const payload = {
    name: form.name.trim(),
    breed: form.breed.trim() || null,
    color_markings: form.color_markings.trim() || null,
    sex: form.sex || null,
    altered_status: form.altered_status || null,
    birth_date: form.birthPrecision ? resolveDate(form.birthPrecision, birthParts) : null,
    birth_date_precision: form.birthPrecision || 'UNKNOWN',
    gotcha_date: form.gotchaPrecision ? resolveDate(form.gotchaPrecision, gotchaParts) : null,
    gotcha_date_precision: form.gotchaPrecision || null,
    microchip_number: form.microchip_number.trim() || null,
    akc_registered: isDog ? form.akc_registered : false,
    akc_registered_name: isDog && form.akc_registered ? (form.akc_registered_name.trim() || null) : null,
    akc_registration_number: isDog && form.akc_registered ? (form.akc_registration_number.trim() || null) : null,
    breeder: isDog && form.akc_registered ? (form.breeder.trim() || null) : null,
    notes: form.notes.trim() || null,
    nicknames: form.nicknames,
    favorite_activities: form.favorite_activities,
  };
  if ((form.photo_path || '') !== (loadedPhotoPath || '')) {
    payload.photo_path = form.photo_path || null;
  }
  return payload;
}
