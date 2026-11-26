import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WEIGHT_MIN_LBS as SERVER_MIN,
  WEIGHT_MAX_LBS as SERVER_MAX,
  compareWeightsNewestFirst as serverCompare,
  currentAndDelta,
  dailyWeights,
  loadDailyWeights,
  weightDateFromRow,
  weightsInRange,
} from '../../supabase/functions/_shared/weight.ts';
import { dateStrInTimezone as serverDateStrInTimezone } from '../../supabase/functions/_shared/checkinRules.ts';
import { RANGE_DAYS as SERVER_RANGE_DAYS } from '../../supabase/functions/ask-vet-assistant/context.ts';

// Spec 0081 (PA-71), Lynn 2026-11-25: one weight per pet per day, picked the
// same way everywhere. The app reads weight through src/lib/weightClient.js;
// the AI features and the Vet Report read it through the server copy in
// supabase/functions/_shared/weight.ts. Edge Functions can't import the
// app's files, so this test feeds the same weight rows to both and fails
// the moment their dating, day pick, range or rounding differ. Fix by
// updating both copies, never this test. (Kept apart from
// aiServerParity.test.js because it mocks the Supabase client.)

const WEIGHT_TYPE_ID = 'type-weight';
const PET = 'pet-a';
const state = { rows: [], rowCap: 1000 };

// A tiny PostgREST stand-in for both readers: the app's (.in on pet_id)
// and the server's (.eq on pet_id), keyset-paged on id with an exact count,
// never returning more than `rowCap` rows (Supabase's max_rows).
function makeQuery(table) {
  const calls = [];
  const builder = {
    select(cols, opts) { calls.push(['select', cols, opts]); return builder; },
    in(col, vals) { calls.push(['in', col, vals]); return builder; },
    eq(col, val) { calls.push(['eq', col, val]); return builder; },
    not(col, op, val) { calls.push(['not', col, op, val]); return builder; },
    gt(col, val) { calls.push(['gt', col, val]); return builder; },
    order(col, opts) { calls.push(['order', col, opts]); return builder; },
    limit(n) { calls.push(['limit', n]); return builder; },
    maybeSingle() {
      const code = calls.find((c) => c[0] === 'eq' && c[1] === 'code')?.[2];
      return Promise.resolve({ data: table === 'observation_types' && code === 'weight' ? { id: WEIGHT_TYPE_ID } : null, error: null });
    },
    then(resolve, reject) {
      const petIds = calls.find((c) => c[0] === 'in' && c[1] === 'pet_id')?.[2]
        ?? [calls.find((c) => c[0] === 'eq' && c[1] === 'pet_id')?.[2]];
      const typeId = calls.find((c) => c[0] === 'eq' && c[1] === 'observation_type_id')?.[2];
      const after = calls.find((c) => c[0] === 'gt' && c[1] === 'id')?.[2];
      let matching = state.rows.filter((r) => petIds.includes(r.pet_id) && r.numeric_value != null
        && (typeId === undefined || typeId === WEIGHT_TYPE_ID));
      if (after !== undefined) matching = matching.filter((r) => r.id > after);
      matching = [...matching].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const limit = calls.find((c) => c[0] === 'limit')?.[1] ?? Infinity;
      const data = matching.slice(0, Math.min(limit, state.rowCap));
      return Promise.resolve({ data, error: null, count: matching.length }).then(resolve, reject);
    },
  };
  return builder;
}

const fakeClient = { from: (table) => makeQuery(table) };

vi.mock('@/api/supabaseClient', () => ({ supabase: { from: (table) => makeQuery(table) } }));
vi.mock('@/api/entities', () => ({ entities: {} }));
vi.mock('@/lib/checkin/checkinClient', () => ({
  loadObservationCatalog: async () => ({ weight: { type: { id: WEIGHT_TYPE_ID }, optionsByValue: {} } }),
}));

const {
  weightDate, compareWeightsNewestFirst: appCompare, getWeightTrend, getWeightSummary,
  WEIGHT_MIN_LBS: APP_MIN, WEIGHT_MAX_LBS: APP_MAX,
} = await import('./weightClient');
const { dateStrInTimezone: appDateStrInTimezone } = await import('./timezone');
const { RANGE_DAYS: APP_RANGE_DAYS } = await import('./checkin/trendsRanges');

// 2026-11-25 10:00 UTC: already the 26th in Kiritimati (UTC+14), 02:00 on
// the 25th in Los Angeles. Both readers must cut ranges on the owner's
// calendar, not UTC's.
const NOW = Date.parse('2026-11-25T10:00:00Z');
const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', null];

const day = (offset) => {
  const d = new Date(NOW + offset * 86400000);
  return d.toISOString().slice(0, 10);
};
const standalone = (id, date, lbs, updatedAt = `${date}T13:00:00+00:00`, observedAt = `${date}T12:00:00+00:00`) => ({
  id, pet_id: PET, observation_type_id: WEIGHT_TYPE_ID, numeric_value: lbs, daily_check_in_id: null, daily_check_ins: null,
  observed_at: observedAt, updated_at: updatedAt,
});
const fromCheckIn = (id, checkInDate, lbs, savedAt) => ({
  id, pet_id: PET, observation_type_id: WEIGHT_TYPE_ID, numeric_value: lbs, daily_check_in_id: `ci-${id}`,
  daily_check_ins: { check_in_date: checkInDate }, observed_at: savedAt, updated_at: savedAt,
});

// Every rule in one history: two kinds on one day, re-saves, ties, rounding,
// out-of-range values, a missing check-in date, and old weights.
const ROWS = [
  // Yesterday: a check-in weight saved later than the standalone one; the
  // standalone weight is still the day's weight.
  standalone('a01', day(-1), 10.0, `${day(-1)}T13:00:00+00:00`),
  fromCheckIn('a02', day(-1), 10.4, `${day(0)}T09:00:00+00:00`),
  // Two standalone weights: the later updated_at wins.
  standalone('a03', day(-2), 11.0, `${day(-2)}T13:00:00+00:00`),
  standalone('a04', day(-2), 11.2, `${day(-2)}T15:00:00+00:00`),
  // Same updated_at: the larger id wins.
  standalone('a06', day(-3), 9.6, `${day(-3)}T13:00:00+00:00`),
  standalone('a05', day(-3), 9.4, `${day(-3)}T13:00:00+00:00`),
  // A check-in weight saved two days after the day it's for, rounded.
  fromCheckIn('a07', day(-4), 9.84, `${day(-2)}T08:00:00+00:00`),
  // Out of range: never a day's weight, and the day has no other weight.
  standalone('a08', day(-5), 0.04),
  standalone('a09', day(-5), 300.06),
  // A check-in weight whose check-in date didn't come back: no date.
  { ...fromCheckIn('a10', day(-6), 12.0, `${day(-6)}T08:00:00+00:00`), daily_check_ins: null },
  // A standalone weight dated by observed_at's UTC date, late in the UTC day.
  standalone('a11', day(-6), 9.1, `${day(-6)}T23:40:00+00:00`, `${day(-6)}T23:30:00+00:00`),
  // Out of range on a day that also has a real weight.
  standalone('a12', day(-8), 8.8),
  standalone('a13', day(-8), 0, `${day(-8)}T20:00:00+00:00`),
  // Older weights, inside and outside the wider ranges.
  standalone('a14', day(-29), 8.5),
  fromCheckIn('a15', day(-31), 8.3, `${day(-31)}T20:00:00+00:00`),
  standalone('a16', day(-89), 8.0),
  standalone('a17', day(-200), 7.5),
  standalone('a18', day(-400), 7.0),
  // Another pet's weight never leaks in.
  { ...standalone('b01', day(-1), 50.0), pet_id: 'pet-b' },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.rows = ROWS.map((r) => ({ ...r }));
  state.rowCap = 1000;
});

afterEach(() => {
  vi.useRealTimers();
});

// The server's Trends rule, as context.ts and the Vet Report apply it.
async function serverTrend(range, timezone) {
  const days = SERVER_RANGE_DAYS[range] ?? SERVER_RANGE_DAYS['24H'];
  const all = await loadDailyWeights(fakeClient, PET);
  const inRange = weightsInRange(all, serverDateStrInTimezone(timezone, -days, NOW));
  return {
    series: [...inRange].reverse().map((d) => ({ date: d.date, value: d.lbs })),
    ...currentAndDelta(inRange),
  };
}

describe('app/server parity: weight rules (spec 0081)', () => {
  it('has the same 0.1–300 lbs range', () => {
    expect(SERVER_MIN).toBe(APP_MIN);
    expect(SERVER_MAX).toBe(APP_MAX);
  });

  it('dates every row the same way (check-in date, else observed_at in UTC)', () => {
    for (const row of ROWS) expect(weightDateFromRow(row)).toBe(weightDate.fromRow(row));
    const odd = [{}, { observed_at: 'not a date' }, { daily_check_in_id: 'ci', observed_at: `${day(0)}T00:00:00Z` }, null];
    for (const row of odd) expect(weightDateFromRow(row)).toBe(weightDate.fromRow(row));
  });

  it('orders any two weights the same way', () => {
    const entries = ROWS.map((r) => ({
      id: r.id, date: weightDate.fromRow(r) ?? '', fromCheckIn: r.daily_check_in_id != null, updatedAt: r.updated_at,
    }));
    for (const a of entries) {
      for (const b of entries) expect(Math.sign(serverCompare(a, b))).toBe(Math.sign(appCompare(a, b)));
    }
  });

  it('picks one weight per day: standalone over check-in, then later updated_at, then larger id', async () => {
    const days = await loadDailyWeights(fakeClient, PET);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.lbs]));
    expect(byDate[day(-1)]).toBe(10.0);
    expect(byDate[day(-2)]).toBe(11.2);
    expect(byDate[day(-3)]).toBe(9.6);
    expect(byDate[day(-4)]).toBe(9.8);
    expect(byDate[day(-5)]).toBeUndefined();
    expect(byDate[day(-6)]).toBe(9.1);
    expect(byDate[day(-8)]).toBe(8.8);
    expect(days.map((d) => d.date)).toEqual([...new Set(days.map((d) => d.date))]);
    expect(days.some((d) => d.lbs === 50)).toBe(false);
  });

  it.each(Object.keys(APP_RANGE_DAYS).flatMap((range) => ZONES.map((zone) => [range, zone])))(
    'gives Trends the same series, current weight and change for %s in %s',
    async (range, zone) => {
      expect(serverDateStrInTimezone(zone, -APP_RANGE_DAYS[range], NOW)).toBe(appDateStrInTimezone(zone, -APP_RANGE_DAYS[range]));
      const app = await getWeightTrend(PET, range, zone);
      const server = await serverTrend(range, zone);
      expect(server.series).toEqual(app.series);
      expect(server.currentLbs).toBe(app.currentLbs);
      expect(server.deltaLbs).toBe(app.deltaLbs);
    },
  );

  it("gives the same daily weights as Pet Profile's full history", async () => {
    const app = await getWeightSummary(PET, 10000);
    const server = await loadDailyWeights(fakeClient, PET);
    expect([...server].reverse()).toEqual(app.sparkline);
    expect(currentAndDelta(server)).toEqual({ currentLbs: app.currentLbs, deltaLbs: app.deltaLbs });
  });

  it('still reads every weight when the server caps each response', async () => {
    state.rowCap = 3;
    const capped = await loadDailyWeights(fakeClient, PET);
    state.rowCap = 1000;
    expect(capped).toEqual(await loadDailyWeights(fakeClient, PET));
    expect(capped.at(-1)).toEqual({ date: day(-400), lbs: 7.0 });
  });

  it('the loader and the pure day pick agree, and empty history has no weight', async () => {
    expect(dailyWeights(ROWS.filter((r) => r.pet_id === PET))).toEqual(await loadDailyWeights(fakeClient, PET));
    expect(dailyWeights([])).toEqual([]);
    expect(currentAndDelta([])).toEqual({ currentLbs: null, deltaLbs: null });
  });
});
