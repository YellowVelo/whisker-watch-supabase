import { describe, it, expect, vi, afterEach } from 'vitest';
import { isCurrentItem, splitCurrent, todayForUser } from './currentItems';
import { dateStrInTimezone, detectTimezone } from './timezone';

const TODAY = '2026-11-27';

describe('isCurrentItem (spec 0087)', () => {
  it('an item that ends today is still current (AC3)', () => {
    expect(isCurrentItem({ active: true, end_date: '2026-11-27' }, TODAY)).toBe(true);
  });

  it('an item that ended yesterday is not current (AC1, AC2)', () => {
    expect(isCurrentItem({ active: true, end_date: '2026-11-26' }, TODAY)).toBe(false);
  });

  it('an item that ends tomorrow is current', () => {
    expect(isCurrentItem({ active: true, end_date: '2026-11-28' }, TODAY)).toBe(true);
  });

  it('an item with no end date is current while switched on', () => {
    expect(isCurrentItem({ active: true, end_date: null }, TODAY)).toBe(true);
    expect(isCurrentItem({ active: true }, TODAY)).toBe(true);
    expect(isCurrentItem({ active: true, end_date: '' }, TODAY)).toBe(true);
  });

  it('a switched-off item is never current, whatever its end date (AC6)', () => {
    expect(isCurrentItem({ active: false, end_date: null }, TODAY)).toBe(false);
    expect(isCurrentItem({ active: false, end_date: '2027-01-01' }, TODAY)).toBe(false);
    expect(isCurrentItem({ active: null }, TODAY)).toBe(false);
    expect(isCurrentItem({}, TODAY)).toBe(false);
    expect(isCurrentItem(null, TODAY)).toBe(false);
  });

  it("a malformed end date counts as not ended, so a switched-on item isn't hidden", () => {
    for (const end_date of ['11/02/2026', '1/1/2020', 'garbage', '2020-1-1', '2020-01-01T00:00:00Z', 20200101]) {
      expect(isCurrentItem({ active: true, end_date }, TODAY)).toBe(true);
    }
  });

  it('a future start date does not make an item non-current (Non-Goals)', () => {
    expect(isCurrentItem({ active: true, start_date: '2026-12-05', end_date: null }, TODAY)).toBe(true);
  });
});

describe('splitCurrent (spec 0087)', () => {
  it('splits rows into current and past, keeping input order', () => {
    const rows = [
      { id: 1, active: true, end_date: null },
      { id: 2, active: true, end_date: '2026-11-26' },
      { id: 3, active: false, end_date: null },
      { id: 4, active: true, end_date: '2026-11-27' },
    ];
    const { current, past } = splitCurrent(rows, TODAY);
    expect(current.map((r) => r.id)).toEqual([1, 4]);
    expect(past.map((r) => r.id)).toEqual([2, 3]);
  });

  it('handles empty or missing input', () => {
    expect(splitCurrent([], TODAY)).toEqual({ current: [], past: [] });
    expect(splitCurrent(null, TODAY)).toEqual({ current: [], past: [] });
  });
});

describe('todayForUser (spec 0087)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it("uses the viewer's saved time zone: 9pm in Los Angeles is still today there (AC7)", () => {
    vi.useFakeTimers();
    // 2026-11-28 05:00 UTC = 2026-11-27 21:00 in America/Los_Angeles.
    vi.setSystemTime(new Date('2026-11-28T05:00:00Z'));
    const today = todayForUser({ timezone: 'America/Los_Angeles' });
    expect(today).toBe('2026-11-27');
    const food = { active: true, end_date: '2026-11-27' };
    expect(isCurrentItem(food, today)).toBe(true);
    expect(splitCurrent([food], today).current).toEqual([food]);
    // The UTC date has already moved on, which is the bug this fixes.
    expect(isCurrentItem(food, todayForUser({ timezone: 'UTC' }))).toBe(false);
  });

  it("falls back to the device's time zone, then UTC, when none is saved", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T05:00:00Z'));
    const expected = dateStrInTimezone(detectTimezone() || 'UTC', 0);
    expect(todayForUser(null)).toBe(expected);
    expect(todayForUser({ timezone: null })).toBe(expected);
  });
});
