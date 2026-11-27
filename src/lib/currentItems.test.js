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

// Spec 0087 QA: "ends today" across time zones and at local midnight.
describe('current rule across time zones and midnight (spec 0087 QA, AC3/AC7)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const endsNov27 = { active: true, end_date: '2026-11-27' };

  it('the same instant is a different "today" in Kiritimati, London and Pago Pago', () => {
    vi.useFakeTimers();
    // 2026-11-27 11:30 UTC = 2026-11-28 01:30 in Kiritimati (UTC+14),
    // 2026-11-27 00:30 in Pago Pago (UTC-11).
    vi.setSystemTime(new Date('2026-11-27T11:30:00Z'));
    expect(todayForUser({ timezone: 'Pacific/Kiritimati' })).toBe('2026-11-28');
    expect(todayForUser({ timezone: 'Europe/London' })).toBe('2026-11-27');
    expect(todayForUser({ timezone: 'Pacific/Pago_Pago' })).toBe('2026-11-27');
    expect(isCurrentItem(endsNov27, todayForUser({ timezone: 'Pacific/Kiritimati' }))).toBe(false);
    expect(isCurrentItem(endsNov27, todayForUser({ timezone: 'Europe/London' }))).toBe(true);
    expect(isCurrentItem(endsNov27, todayForUser({ timezone: 'Pacific/Pago_Pago' }))).toBe(true);
  });

  it('flips exactly at local midnight in New York (test1@\'s saved zone)', () => {
    vi.useFakeTimers();
    // 2026-11-28 04:59:59 UTC = 23:59:59 on the 27th in New York (EST, UTC-5).
    vi.setSystemTime(new Date('2026-11-28T04:59:59Z'));
    expect(isCurrentItem(endsNov27, todayForUser({ timezone: 'America/New_York' }))).toBe(true);
    vi.setSystemTime(new Date('2026-11-28T05:00:00Z'));
    expect(isCurrentItem(endsNov27, todayForUser({ timezone: 'America/New_York' }))).toBe(false);
  });

  it('month and year boundaries compare correctly as strings', () => {
    expect(isCurrentItem({ active: true, end_date: '2026-11-30' }, '2026-12-01')).toBe(false);
    expect(isCurrentItem({ active: true, end_date: '2026-12-31' }, '2027-01-01')).toBe(false);
    expect(isCurrentItem({ active: true, end_date: '2027-01-01' }, '2026-12-31')).toBe(true);
    expect(isCurrentItem({ active: true, end_date: '2028-02-29' }, '2028-02-29')).toBe(true);
  });
});

describe('current rule: more malformed rows (spec 0087 QA)', () => {
  it('active must be exactly true: "true", 1 and "yes" are not current', () => {
    for (const active of ['true', 1, 'yes']) {
      expect(isCurrentItem({ active, end_date: null }, TODAY)).toBe(false);
    }
  });

  it('a well-formed but impossible end date still compares as a string (2026-13-45 is after today)', () => {
    // Documented behavior: only the YYYY-MM-DD shape is checked, so an
    // impossible month counts as a later date and the item stays current.
    expect(isCurrentItem({ active: true, end_date: '2026-13-45' }, TODAY)).toBe(true);
    expect(isCurrentItem({ active: true, end_date: '2026-00-00' }, TODAY)).toBe(false);
  });

  it('whitespace around a date counts as malformed, not ended', () => {
    expect(isCurrentItem({ active: true, end_date: ' 2020-01-01' }, TODAY)).toBe(true);
    expect(isCurrentItem({ active: true, end_date: '2020-01-01 ' }, TODAY)).toBe(true);
  });

  it('splitCurrent skips nothing: null rows go to past and every row lands in one group', () => {
    const rows = [null, { active: true }, undefined, { active: false }];
    const { current, past } = splitCurrent(rows, TODAY);
    expect(current).toHaveLength(1);
    expect(past).toHaveLength(3);
  });
});
