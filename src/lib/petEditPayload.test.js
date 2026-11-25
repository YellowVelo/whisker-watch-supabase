import { describe, it, expect, vi } from 'vitest';

// Vitest runs in plain Node. petEditPayload.js imports resolveDate from
// DateInfoFields.jsx, whose UI imports read `window` at load time, so give
// them one before the import runs (vi.hoisted runs ahead of imports).
vi.hoisted(() => {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = { self: globalThis, top: globalThis };
  }
});

import { buildPetUpdatePayload } from './petEditPayload';

// A minimal Edit Pet form as formFromPet() would build it.
function form(overrides = {}) {
  return {
    name: ' Biscuit ',
    breed: 'Beagle',
    photo_path: 'owner/photo.jpg',
    color_markings: '',
    sex: 'Male',
    altered_status: '',
    birthPrecision: 'YEAR',
    birthDate: '',
    birthMonthYear: '',
    birthYear: '2020',
    gotchaPrecision: '',
    gotchaDate: '',
    gotchaMonthYear: '',
    gotchaYear: '',
    microchip_number: '',
    akc_registered: false,
    akc_registered_name: '',
    akc_registration_number: '',
    breeder: '',
    notes: '',
    nicknames: [],
    favorite_activities: [],
    ...overrides,
  };
}
const dog = { id: 'pet-1', species: 'Dog', photo_path: 'owner/photo.jpg' };

describe('buildPetUpdatePayload (spec 0083 FR1)', () => {
  it('leaves photo_path out when the photo was not changed in this form', () => {
    const payload = buildPetUpdatePayload(form({ notes: 'new note' }), dog, 'owner/photo.jpg');
    expect('photo_path' in payload).toBe(false);
    // The person's other edits are still sent.
    expect(payload.notes).toBe('new note');
    expect(payload.name).toBe('Biscuit');
    expect(payload.birth_date).toBe('2020-01-01');
  });

  it('leaves photo_path out when the pet had no photo and still has none', () => {
    const payload = buildPetUpdatePayload(form({ photo_path: '' }), { ...dog, photo_path: null }, null);
    expect('photo_path' in payload).toBe(false);
  });

  it('sends the new photo_path when a photo was uploaded in this form', () => {
    const payload = buildPetUpdatePayload(form({ photo_path: 'coowner/new.jpg' }), dog, 'owner/photo.jpg');
    expect(payload.photo_path).toBe('coowner/new.jpg');
  });

  it('sends photo_path null when the photo was removed in this form', () => {
    const payload = buildPetUpdatePayload(form({ photo_path: '' }), dog, 'owner/photo.jpg');
    expect(payload).toHaveProperty('photo_path', null);
  });

  it('sends a photo added to a pet that had none', () => {
    const payload = buildPetUpdatePayload(form({ photo_path: 'me/first.jpg' }), { ...dog, photo_path: null }, null);
    expect(payload.photo_path).toBe('me/first.jpg');
  });
});
