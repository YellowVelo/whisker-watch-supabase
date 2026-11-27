import { describe, it, expect, vi, afterEach } from 'vitest';

// The device's time zone is stubbed so the fallback tests tell "device zone"
// apart from "UTC" even on a CI runner whose own zone is UTC.
const device = vi.hoisted(() => ({ zone: /** @type {string | null} */ ('America/Los_Angeles') }));
vi.mock('./timezone', async (importOriginal) => ({
  .../** @type {any} */ (await importOriginal()),
  detectTimezone: () => device.zone,
}));

const { isCurrentItem, splitCurrent, todayForUser, currentFromSettled } = await import('./currentItems');

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

  // 2026-11-28 05:00 UTC is still 2026-11-27 on the stubbed device (Los
  // Angeles), so each fallback gives a different date.
  it("falls back to the device's time zone when none is saved", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T05:00:00Z'));
    device.zone = 'America/Los_Angeles';
    expect(todayForUser(null)).toBe('2026-11-27');
    expect(todayForUser({ timezone: null })).toBe('2026-11-27');
  });

  it("falls back to the device's time zone when the saved one isn't a real time zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T05:00:00Z'));
    device.zone = 'America/Los_Angeles';
    expect(() => todayForUser({ timezone: 'Not/AZone' })).not.toThrow();
    expect(todayForUser({ timezone: 'Not/AZone' })).toBe('2026-11-27');
    expect(todayForUser({ timezone: 'garbage' })).toBe('2026-11-27');
    expect(todayForUser({ timezone: 42 })).toBe('2026-11-27');
  });

  it('falls back to UTC when neither a saved nor a device time zone is available', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T05:00:00Z'));
    device.zone = null;
    try {
      expect(todayForUser(null)).toBe('2026-11-28');
      expect(todayForUser({ timezone: 'Not/AZone' })).toBe('2026-11-28');
    } finally {
      device.zone = 'America/Los_Angeles';
    }
  });
});

describe('currentFromSettled: the pet profile meds/foods filter (spec 0087 AC3, AC4, AC6)', () => {
  const rows = [
    { id: 'now', active: true, end_date: null },
    { id: 'today', active: true, end_date: TODAY },
    { id: 'ended', active: true, end_date: '2026-11-26' },
    { id: 'off', active: false, end_date: null },
  ];

  it('keeps only current rows: ending today stays, ended yesterday and switched off drop', () => {
    const result = currentFromSettled({ status: 'fulfilled', value: rows }, TODAY);
    expect(result.map((r) => r.id)).toEqual(['now', 'today']);
  });

  it('shows nothing when the load failed', () => {
    expect(currentFromSettled({ status: 'rejected', reason: new Error('x') }, TODAY)).toEqual([]);
    expect(currentFromSettled(undefined, TODAY)).toEqual([]);
  });

  it("uses the viewer's calendar via todayForUser (AC7)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T05:00:00Z'));
    try {
      const food = [{ id: 'f', active: true, end_date: '2026-11-27' }];
      expect(currentFromSettled({ status: 'fulfilled', value: food }, todayForUser({ timezone: 'America/Los_Angeles' }))).toHaveLength(1);
      expect(currentFromSettled({ status: 'fulfilled', value: food }, todayForUser({ timezone: 'UTC' }))).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
