import { describe, it, expect } from 'vitest';
import { buildFullName, getDisplayName } from '../profileName';

describe('buildFullName', () => {
  it('joins first and last name', () => {
    expect(buildFullName('Lynn', 'Mount')).toBe('Lynn Mount');
  });

  it('handles only a first name', () => {
    expect(buildFullName('Lynn', null)).toBe('Lynn');
  });

  it('handles only a last name', () => {
    expect(buildFullName(null, 'Mount')).toBe('Mount');
  });

  it('returns empty string when both are missing', () => {
    expect(buildFullName(null, undefined)).toBe('');
  });
});

describe('getDisplayName', () => {
  it('prefers full name when present', () => {
    expect(getDisplayName({ first_name: 'Lynn', last_name: 'Mount', email: 'lynn@example.com' })).toBe('Lynn Mount');
  });

  it('falls back to email when neither name exists', () => {
    expect(getDisplayName({ first_name: null, last_name: null, email: 'lynn@example.com' })).toBe('lynn@example.com');
  });

  it('returns empty string when nothing at all is present', () => {
    expect(getDisplayName({})).toBe('');
  });
});
