import { describe, it, expect, vi, afterEach } from 'vitest';
import { dateStrInTimezone, todayInTimezone, yesterdayInTimezone } from './timezone';

// Health Score Revision V2 — "Daily date boundaries must use the user's
// stored timezone, not UTC midnight" (spec §24/#20). Fixed instant chosen
// near a UTC day boundary so a timezone-blind implementation would fail.
describe('timezone-aware date boundaries', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves "today" using the given IANA timezone, not UTC', () => {
    // 2026-03-05T02:00:00Z is already 2026-03-04 in America/Los_Angeles (UTC-8).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T02:00:00Z'));

    expect(todayInTimezone('UTC')).toBe('2026-03-05');
    expect(todayInTimezone('America/Los_Angeles')).toBe('2026-03-04');
  });

  it('resolves "yesterday" relative to the given timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T02:00:00Z'));

    expect(yesterdayInTimezone('UTC')).toBe('2026-03-04');
    expect(yesterdayInTimezone('America/Los_Angeles')).toBe('2026-03-03');
  });

  it('falls back to UTC for an invalid/missing timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T02:00:00Z'));

    expect(dateStrInTimezone(undefined, 0)).toBe('2026-03-05');
    expect(dateStrInTimezone('Not/AZone', 0)).toBe('2026-03-05');
  });
});
