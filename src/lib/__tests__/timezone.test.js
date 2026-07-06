import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isValidIanaTimezone,
  detectTimezone,
  shouldAutoPopulateTimezone,
  isManualTimezoneChange,
} from '../timezone';

describe('isValidIanaTimezone', () => {
  it('accepts a real IANA zone', () => {
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
  });

  it('rejects garbage input', () => {
    expect(isValidIanaTimezone('Not/A_Zone')).toBe(false);
  });

  it('rejects null/empty', () => {
    expect(isValidIanaTimezone(null)).toBe(false);
    expect(isValidIanaTimezone('')).toBe(false);
  });
});

describe('detectTimezone', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the resolved device timezone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Europe/London' }),
    }));
    expect(detectTimezone()).toBe('Europe/London');
  });

  it('returns null when detection fails', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(detectTimezone()).toBeNull();
  });
});

describe('shouldAutoPopulateTimezone', () => {
  it('is true for a new user with no timezone at all', () => {
    expect(shouldAutoPopulateTimezone({ timezone: null, timezone_is_manual: false })).toBe(true);
  });

  it('is true for an existing user whose timezone was never populated', () => {
    expect(shouldAutoPopulateTimezone({ timezone: undefined, timezone_is_manual: false })).toBe(true);
  });

  it('is false once a timezone is already stored, even if it differs from the device', () => {
    expect(shouldAutoPopulateTimezone({ timezone: 'America/Chicago', timezone_is_manual: false })).toBe(false);
  });

  it('is false when the owner has manually overridden the timezone', () => {
    expect(shouldAutoPopulateTimezone({ timezone: 'America/Chicago', timezone_is_manual: true })).toBe(false);
  });
});

describe('isManualTimezoneChange', () => {
  it('is false when the save keeps timezone on automatic', () => {
    expect(isManualTimezoneChange({
      timezoneIsManual: false, timezone: 'America/Chicago',
      previousTimezone: 'America/Chicago', previousTimezoneIsManual: false,
    })).toBe(false);
  });

  it('is true when the owner picks a different zone', () => {
    expect(isManualTimezoneChange({
      timezoneIsManual: true, timezone: 'Europe/London',
      previousTimezone: 'America/Chicago', previousTimezoneIsManual: false,
    })).toBe(true);
  });

  it('is true when the owner re-selects the already-stored zone, converting it from automatic to manual', () => {
    expect(isManualTimezoneChange({
      timezoneIsManual: true, timezone: 'America/Chicago',
      previousTimezone: 'America/Chicago', previousTimezoneIsManual: false,
    })).toBe(true);
  });

  it('is false on a second save that keeps an already-manual zone unchanged', () => {
    expect(isManualTimezoneChange({
      timezoneIsManual: true, timezone: 'America/Chicago',
      previousTimezone: 'America/Chicago', previousTimezoneIsManual: true,
    })).toBe(false);
  });
});
