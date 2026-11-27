import { describe, it, expect, vi } from 'vitest';
import { addDays, format } from 'date-fns';
import {
  SIT_MIN_DATE,
  SIT_MAX_DATE,
  SIT_MAX_DAYS,
  parseSitDate,
  sitDays,
  validateSitDates,
  formatSitRange,
  openDatePicker,
} from './sitDates';

const INVALID = 'Please enter a real date with a 4-digit year.';
const END_BEFORE_START = "The end date can't be before the start date.";
const TOO_LONG = 'A pet sit can be up to 30 days. For a longer trip, add a second sit.';

const plus = (iso, n) => format(addDays(parseSitDate(iso), n), 'yyyy-MM-dd');

describe('constants', () => {
  it('match the spec', () => {
    expect(SIT_MIN_DATE).toBe('2000-01-01');
    expect(SIT_MAX_DATE).toBe('2100-12-31');
    expect(SIT_MAX_DAYS).toBe(30);
  });
});

describe('parseSitDate (AC1)', () => {
  it('parses a normal date as local midnight', () => {
    const d = parseSitDate('2026-12-01');
    expect(d).toBeInstanceOf(Date);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 11, 1, 0]);
  });

  it.each(['20266-12-01', '0202-01-01', '', null, undefined])('rejects %j', (v) => {
    expect(parseSitDate(v)).toBeNull();
  });

  it('rejects dates that do not exist or are badly shaped', () => {
    expect(parseSitDate('2026-02-30')).toBeNull();
    expect(parseSitDate('2026-13-01')).toBeNull();
    expect(parseSitDate('2026-1-01')).toBeNull();
    expect(parseSitDate(20261201)).toBeNull();
  });

  it('applies the 2000–2100 boundaries', () => {
    expect(parseSitDate('1999-12-31')).toBeNull();
    expect(parseSitDate('2000-01-01')).not.toBeNull();
    expect(parseSitDate('2100-12-31')).not.toBeNull();
    expect(parseSitDate('2101-01-01')).toBeNull();
  });
});

describe('validateSitDates (AC4–AC6)', () => {
  const start = '2026-12-01';

  it('year boundaries 1999/2000/2100/2101', () => {
    expect(validateSitDates('1999-12-31', '2000-01-01')).toBe(INVALID);
    expect(validateSitDates('2000-01-01', '2000-01-01')).toBeNull();
    expect(validateSitDates('2100-12-31', '2100-12-31')).toBeNull();
    expect(validateSitDates('2100-12-31', '2101-01-01')).toBe(INVALID);
  });

  it.each(['20266-12-01', '0202-01-01', '', null, undefined])('bad end %j gives the 4-digit-year message', (v) => {
    expect(validateSitDates(start, v)).toBe(INVALID);
    expect(validateSitDates(v, start)).toBe(INVALID);
  });

  it('end = start - 1 is refused', () => {
    expect(validateSitDates(start, plus(start, -1))).toBe(END_BEFORE_START);
  });

  it('end = start is accepted', () => {
    expect(validateSitDates(start, start)).toBeNull();
  });

  it('end = start + 30 is accepted', () => {
    expect(validateSitDates(start, plus(start, 30))).toBeNull();
  });

  it('end = start + 31 is refused', () => {
    expect(validateSitDates(start, plus(start, 31))).toBe(TOO_LONG);
  });

  it('counts calendar days across a DST change', () => {
    // CI runs in UTC, which has no DST, so force a zone that changes clocks
    // on 2026-03-08 (Node applies a runtime TZ change immediately).
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const before = parseSitDate('2026-03-01');
      const after = parseSitDate('2026-03-31');
      // Proves the range really crosses a DST change in this run.
      expect(before.getTimezoneOffset()).not.toBe(after.getTimezoneOffset());
      expect(validateSitDates('2026-03-01', '2026-03-31')).toBeNull();
      expect(validateSitDates('2026-03-01', '2026-04-01')).toBe(TOO_LONG);
      expect(sitDays({ start_date: '2026-03-01', end_date: '2026-03-31' })).toHaveLength(31);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});

describe('sitDays', () => {
  const start = '2026-12-01';

  it('same start and end gives 1 day', () => {
    expect(sitDays({ start_date: start, end_date: start })).toHaveLength(1);
  });

  it('+30 gives 31 days', () => {
    const days = sitDays({ start_date: start, end_date: plus(start, 30) });
    expect(days).toHaveLength(31);
    expect(format(days[0], 'yyyy-MM-dd')).toBe(start);
    expect(format(days[30], 'yyyy-MM-dd')).toBe(plus(start, 30));
  });

  it('+31 gives []', () => {
    expect(sitDays({ start_date: start, end_date: plus(start, 31) })).toEqual([]);
  });

  it('end before start gives []', () => {
    expect(sitDays({ start_date: start, end_date: plus(start, -1) })).toEqual([]);
  });

  it.each(['20266-12-01', '0202-01-01', '', null, undefined])('unusable end %j gives []', (v) => {
    expect(sitDays({ start_date: start, end_date: v })).toEqual([]);
    expect(sitDays({ start_date: v, end_date: start })).toEqual([]);
  });

  it('missing sit gives []', () => {
    expect(sitDays(null)).toEqual([]);
    expect(sitDays(undefined)).toEqual([]);
  });
});

describe('formatSitRange', () => {
  it('formats a valid range like the existing header', () => {
    expect(formatSitRange({ start_date: '2026-12-01', end_date: '2026-12-05' })).toBe('Dec 1 – Dec 5, 2026');
  });

  it.each(['20266-12-01', '0202-01-01', '', null, undefined])('shows "Dates not set" for %j', (v) => {
    expect(formatSitRange({ start_date: '2026-12-01', end_date: v })).toBe('Dates not set');
    expect(formatSitRange({ start_date: v, end_date: '2026-12-01' })).toBe('Dates not set');
  });

  it('shows "Dates not set" for a missing sit', () => {
    expect(formatSitRange(null)).toBe('Dates not set');
  });
});

describe('openDatePicker (AC12)', () => {
  it('calls showPicker when present', () => {
    const showPicker = vi.fn();
    openDatePicker({ currentTarget: { showPicker } });
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('does nothing when showPicker is missing', () => {
    expect(() => openDatePicker({ currentTarget: {} })).not.toThrow();
  });

  it('swallows an error thrown by showPicker', () => {
    const showPicker = vi.fn(() => { throw new Error('NotAllowedError'); });
    expect(() => openDatePicker({ currentTarget: { showPicker } })).not.toThrow();
    expect(showPicker).toHaveBeenCalledTimes(1);
  });
});

// QA edge cases (spec 0085 QA pass).
describe('edge cases: leap days, year boundaries, odd input', () => {
  it('leap days: real ones parse, impossible ones do not (2100 is not a leap year)', () => {
    expect(parseSitDate('2028-02-29')).not.toBeNull();
    expect(parseSitDate('2000-02-29')).not.toBeNull();
    expect(parseSitDate('2027-02-29')).toBeNull();
    expect(parseSitDate('2100-02-29')).toBeNull();
    expect(validateSitDates('2027-02-29', '2027-03-01')).toBe(INVALID);
  });

  it('a sit crossing New Year counts calendar days correctly', () => {
    expect(validateSitDates('2026-12-15', '2027-01-14')).toBeNull();
    expect(validateSitDates('2026-12-15', '2027-01-15')).toBe(TOO_LONG);
    const days = sitDays({ start_date: '2026-12-15', end_date: '2027-01-14' });
    expect(days).toHaveLength(31);
    expect(format(days[16], 'yyyy-MM-dd')).toBe('2026-12-31');
    expect(format(days[17], 'yyyy-MM-dd')).toBe('2027-01-01');
    expect(formatSitRange({ start_date: '2026-12-31', end_date: '2027-01-01' })).toBe('Dec 31 – Jan 1, 2027');
  });

  it('a sit spanning a leap-year February counts Feb 29', () => {
    expect(sitDays({ start_date: '2028-02-01', end_date: '2028-03-01' })).toHaveLength(30);
    expect(validateSitDates('2028-02-01', '2028-03-02')).toBeNull();
    expect(validateSitDates('2028-02-01', '2028-03-03')).toBe(TOO_LONG);
  });

  it.each([
    ' 2026-12-01', '2026-12-01 ', '2026-12-01T00:00:00Z', '2026/12/01', '12/01/2026',
    '02026-12-01', '2026-00-10', '2026-12-00', '2026-12-32', 'abcd-ef-gh', '2026-12', {}, [], true,
  ])('rejects malformed %j', (v) => {
    expect(parseSitDate(v)).toBeNull();
    expect(validateSitDates(v, '2026-12-02')).toBe(INVALID);
    expect(formatSitRange({ start_date: v, end_date: '2026-12-02' })).toBe('Dates not set');
    expect(sitDays({ start_date: v, end_date: '2026-12-02' })).toEqual([]);
  });

  it('a Date object is not accepted (dates are stored and sent as strings)', () => {
    expect(parseSitDate(new Date(2026, 11, 1))).toBeNull();
  });

  it('an unusable date wins over a reversed range', () => {
    expect(validateSitDates('2026-12-05', '20266-12-01')).toBe(INVALID);
    expect(validateSitDates('2026-12-05', '1999-01-01')).toBe(INVALID);
  });

  it.each(['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata', 'Australia/Lord_Howe'])(
    'in %s the day stays the typed day and spans stay exact',
    (tz) => {
      const originalTz = process.env.TZ;
      process.env.TZ = tz;
      try {
        const d = parseSitDate('2026-12-31');
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 11, 31]);
        expect(validateSitDates('2026-12-01', '2026-12-31')).toBeNull();
        expect(validateSitDates('2026-12-01', '2027-01-01')).toBe(TOO_LONG);
        const days = sitDays({ start_date: '2026-12-30', end_date: '2027-01-02' });
        expect(days.map((x) => format(x, 'yyyy-MM-dd'))).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
        expect(formatSitRange({ start_date: '2026-12-01', end_date: '2026-12-05' })).toBe('Dec 1 – Dec 5, 2026');
      } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      }
    },
  );
});
