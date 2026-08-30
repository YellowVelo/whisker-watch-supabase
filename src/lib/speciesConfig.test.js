import { describe, it, expect } from 'vitest';
import { vaccineNamesMatch } from './speciesConfig';

describe('vaccineNamesMatch', () => {
  it('matches a known vaccine with an added prefix', () => {
    expect(vaccineNamesMatch('Rabies Vaccine', 'Canine - Rabies Vaccine', 'Dog')).toBe(true);
  });

  it('matches a known vaccine with an added parenthetical detail', () => {
    expect(vaccineNamesMatch('Bordetella Vaccine', 'Canine - Bordetella Vaccine (Oral)', 'Dog')).toBe(true);
  });

  it('matches differently-worded versions of the same combo vaccine', () => {
    expect(vaccineNamesMatch('Canine Distemper DA2PP/DHPP Vaccine', 'Canine - Distemper DHPP Vaccine', 'Dog')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(vaccineNamesMatch('RABIES', 'rabies vaccine', 'Dog')).toBe(true);
  });

  it('does not match two different known vaccines', () => {
    expect(vaccineNamesMatch('Rabies Vaccine', 'Bordetella Vaccine', 'Dog')).toBe(false);
  });

  it('falls back to exact match for a vaccine not on the known list', () => {
    expect(vaccineNamesMatch('Giardia Vaccine', 'Canine - Giardia Vaccine', 'Dog')).toBe(false);
  });

  it('still matches an unrecognized vaccine when worded exactly the same', () => {
    expect(vaccineNamesMatch('Giardia Vaccine', 'Giardia Vaccine', 'Dog')).toBe(true);
  });

  it('resolves against the cat vaccine list for cats', () => {
    expect(vaccineNamesMatch('FVRCP Vaccine', 'Feline - Distemper Combo (FVRCP)', 'Cat')).toBe(true);
  });
});
