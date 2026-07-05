import { describe, it, expect } from 'vitest';
import { greetingForHour, buildGreeting } from './greeting';

describe('greetingForHour', () => {
  it('returns morning before noon', () => {
    expect(greetingForHour(0)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
  });

  it('returns afternoon from noon up to 6pm', () => {
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good afternoon');
  });

  it('returns evening from 6pm onward', () => {
    expect(greetingForHour(18)).toBe('Good evening');
    expect(greetingForHour(23)).toBe('Good evening');
  });
});

describe('buildGreeting', () => {
  it('appends the first name when present', () => {
    expect(buildGreeting('Lynn', 9)).toBe('Good morning, Lynn');
  });

  it('falls back to the bare greeting when first name is unavailable', () => {
    expect(buildGreeting(null, 9)).toBe('Good morning');
    expect(buildGreeting(undefined, 9)).toBe('Good morning');
    expect(buildGreeting('', 9)).toBe('Good morning');
  });
});
