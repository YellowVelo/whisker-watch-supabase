import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Spec 0081 (PA-71): weight's one home is `observations` rows of type
// `weight`. Check-in weights are dated by daily_check_ins.check_in_date,
// standalone weights by observed_at (noon UTC of the chosen date,
// Amendment 1).

const WEIGHT_TYPE_ID = 'type-weight';
// `rowCap` plays Supabase's max_rows: no response returns more rows than
// this, whatever limit the query asks for. `deletableIds` are the rows a
// delete is allowed to match (RLS); anything else deletes 0 rows.
const state = { rows: [], queries: [], rowCap: 1000, deletableIds: null };

function makeQuery(table) {
  const q = { table, calls: [] };
  const builder = {
    select(cols, opts) { q.calls.push(['select', cols, opts]); return builder; },
    in(col, vals) { q.calls.push(['in', col, vals]); return builder; },
    eq(col, val) { q.calls.push(['eq', col, val]); return builder; },
    not(col, op, val) { q.calls.push(['not', col, op, val]); return builder; },
    gt(col, val) { q.calls.push(['gt', col, val]); return builder; },
    order(col, opts) { q.calls.push(['order', col, opts]); return builder; },
    limit(n) { q.calls.push(['limit', n]); return builder; },
    delete() { q.calls.push(['delete']); return builder; },
    then(resolve, reject) {
      if (q.calls.some((c) => c[0] === 'delete')) {
        const id = q.calls.find((c) => c[0] === 'eq' && c[1] === 'id')?.[2];
        const allowed = state.deletableIds ? state.deletableIds.includes(id) : state.rows.some((r) => r.id === id);
        state.rows = allowed ? state.rows.filter((r) => r.id !== id) : state.rows;
        return Promise.resolve({ data: allowed ? [{ id }] : [], error: null }).then(resolve, reject);
      }
      const petIds = q.calls.find((c) => c[0] === 'in' && c[1] === 'pet_id')?.[2] || [];
      const after = q.calls.find((c) => c[0] === 'gt' && c[1] === 'id')?.[2];
      let matching = state.rows.filter((r) => petIds.includes(r.pet_id) && r.numeric_value != null);
      if (after !== undefined) matching = matching.filter((r) => r.id > after);
      if (q.calls.some((c) => c[0] === 'order' && c[1] === 'id')) {
        matching = [...matching].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      }
      const limit = q.calls.find((c) => c[0] === 'limit')?.[1] ?? Infinity;
      const data = matching.slice(0, Math.min(limit, state.rowCap));
      const wantsCount = q.calls.find((c) => c[0] === 'select')?.[2]?.count === 'exact';
      return Promise.resolve({ data, error: null, count: wantsCount ? matching.length : null }).then(resolve, reject);
    },
  };
  state.queries.push(q);
  return builder;
}

const create = vi.fn(async (row) => ({ id: 'new', ...row }));
const update = vi.fn(async (id, patch) => ({ id, ...patch }));
const remove = vi.fn(async () => true);
const checkInUpdate = vi.fn(async (id, patch) => ({ id, ...patch }));

vi.mock('@/api/supabaseClient', () => ({ supabase: { from: (table) => makeQuery(table) } }));
vi.mock('@/api/entities', () => ({
  entities: {
    Observation: { create: (...a) => create(...a), update: (...a) => update(...a), delete: (...a) => remove(...a) },
    DailyCheckIn: { update: (...a) => checkInUpdate(...a) },
  },
}));
vi.mock('@/lib/checkin/checkinClient', () => ({
  loadObservationCatalog: async () => ({ weight: { type: { id: WEIGHT_TYPE_ID }, optionsByValue: {} } }),
}));

const {
  weightDate, listWeights, addWeight, updateWeight, deleteWeight,
  getWeightSummary, getWeightSummariesForPets, getWeightTrend, validateWeightInput, isValidWeight,
  compareWeightsNewestFirst, weightErrorText, WEIGHT_MESSAGES, WEIGHT_INPUT_ERROR_CODES,
} = await import('./weightClient');
const { dateStrForInstant, dateStrInTimezone } = await import('./timezone');

const PET_A = 'pet-a';
const PET_B = 'pet-b';

// A standalone weight row as PostgREST returns it.
const standalone = (id, petId, date, lbs, updatedAt = `${date}T13:00:00+00:00`) => ({
  id, pet_id: petId, numeric_value: lbs, daily_check_in_id: null, daily_check_ins: null,
  observed_at: `${date}T12:00:00+00:00`, updated_at: updatedAt,
});
// A check-in weight row: observed_at is whenever the check-in was saved
// (default now()), which may be a different UTC date from check_in_date.
const fromCheckIn = (id, petId, checkInDate, lbs, observedAt, updatedAt = observedAt) => ({
  id, pet_id: petId, numeric_value: lbs, daily_check_in_id: `ci-${id}`,
  daily_check_ins: { check_in_date: checkInDate }, observed_at: observedAt, updated_at: updatedAt,
});

beforeEach(() => {
  state.rows = [];
  state.queries = [];
  state.rowCap = 1000;
  state.deletableIds = null;
  create.mockClear();
  update.mockClear();
  remove.mockClear();
  checkInUpdate.mockReset();
  checkInUpdate.mockImplementation(async (id, patch) => ({ id, ...patch }));
});

describe('weightDate: the one dating rule, both directions', () => {
  it('saves a chosen date as noon UTC of that date', () => {
    expect(weightDate.toObservedAt('2026-11-20')).toBe('2026-11-20T12:00:00.000Z');
  });

  it('reads a standalone weight back as the UTC date of observed_at', () => {
    expect(weightDate.fromRow({ observed_at: '2026-11-20T12:00:00+00:00', daily_check_ins: null })).toBe('2026-11-20');
  });

  it('reads a check-in weight as its check_in_date, not observed_at', () => {
    // Saved 1am UTC Nov 21 (evening of Nov 20 in New York) for Nov 19's check-in.
    expect(weightDate.fromRow({ observed_at: '2026-11-21T01:00:00+00:00', daily_check_ins: { check_in_date: '2026-11-19' } }))
      .toBe('2026-11-19');
  });

  it('gives no date (row skipped) to a check-in weight whose check-in date is missing', () => {
    // observed_at is when the check-in was saved, not the day it's for, so
    // it must never stand in for the check-in's date.
    const base = { daily_check_in_id: 'ci-1', observed_at: '2026-11-21T01:00:00+00:00' };
    expect(weightDate.fromRow({ ...base, daily_check_ins: null })).toBeNull();
    expect(weightDate.fromRow({ ...base, daily_check_ins: {} })).toBeNull();
    expect(weightDate.fromRow({ ...base })).toBeNull();
  });

  it('rejects anything that is not a YYYY-MM-DD date', () => {
    expect(() => weightDate.toObservedAt('11/20/2026')).toThrow();
    expect(() => weightDate.toObservedAt(undefined)).toThrow();
  });

  describe('dates chosen near midnight in non-UTC zones round-trip unchanged', () => {
    // Instants a minute either side of local midnight, resolved to the
    // owner's calendar date the way the sheet does (dateStrForInstant).
    const cases = [
      ['America/Los_Angeles', '2026-11-21T07:59:00Z', '2026-11-20'], // 11:59pm Nov 20 local
      ['America/Los_Angeles', '2026-11-21T08:01:00Z', '2026-11-21'], // 12:01am Nov 21 local
      ['Pacific/Auckland', '2026-11-20T10:59:00Z', '2026-11-20'], // 11:59pm Nov 20 local (NZDT, +13)
      ['Pacific/Auckland', '2026-11-20T11:01:00Z', '2026-11-21'], // 12:01am Nov 21 local
      ['Pacific/Kiritimati', '2026-11-20T09:59:00Z', '2026-11-20'], // +14
      ['Pacific/Pago_Pago', '2026-11-21T10:59:00Z', '2026-11-20'], // -11
    ];
    for (const [tz, instant, expected] of cases) {
      it(`${tz} at ${instant}`, () => {
        const chosen = dateStrForInstant(new Date(instant), tz);
        expect(chosen).toBe(expected);
        const observedAt = weightDate.toObservedAt(chosen);
        expect(weightDate.fromRow({ observed_at: observedAt })).toBe(expected);
        // PostgREST returns timestamptz with +00:00, not Z.
        expect(weightDate.fromRow({ observed_at: observedAt.replace('.000Z', '+00:00') })).toBe(expected);
      });
    }
  });

  describe('does not depend on the device time zone', () => {
    const originalTz = process.env.TZ;
    afterEach(() => { process.env.TZ = originalTz; });
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/New_York']) {
      it(`TZ=${tz}`, () => {
        process.env.TZ = tz;
        expect(weightDate.toObservedAt('2026-03-08')).toBe('2026-03-08T12:00:00.000Z');
        expect(weightDate.fromRow({ observed_at: '2026-03-08T12:00:00+00:00' })).toBe('2026-03-08');
        expect(weightDate.fromRow({ observed_at: '2026-12-31T12:00:00+00:00' })).toBe('2026-12-31');
      });
    }
  });
});

describe('validateWeightInput (FR2: 0.1–300 lbs, one decimal, never a future date)', () => {
  const tz = 'America/New_York';
  const today = () => dateStrInTimezone(tz, 0);

  it('accepts the range ends and rounds to one decimal', () => {
    expect(validateWeightInput({ lbs: 0.1, date: today() }, tz)).toBe(0.1);
    expect(validateWeightInput({ lbs: 300, date: today() }, tz)).toBe(300);
    expect(validateWeightInput({ lbs: 11.24, date: today() }, tz)).toBe(11.2);
  });

  it('refuses 0, 301, blanks and non-numbers with weight_out_of_range', () => {
    for (const lbs of [0, 301, '', null, undefined, 'abc', -5]) {
      expect(() => validateWeightInput({ lbs, date: today() }, tz)).toThrow(expect.objectContaining({ code: 'weight_out_of_range' }));
    }
  });

  it('isValidWeight applies the same rule without throwing (onboarding and the check-in Weight box)', () => {
    for (const lbs of [0.1, 300, 11.24, '9']) expect(isValidWeight(lbs)).toBe(true);
    for (const lbs of [0, 301, 300.06, '', null, undefined, 'abc', -5, Number.NaN]) expect(isValidWeight(lbs)).toBe(false);
  });

  it('refuses tomorrow in the owner\'s time zone with weight_date_in_future', () => {
    expect(() => validateWeightInput({ lbs: 10, date: dateStrInTimezone(tz, 1) }, tz))
      .toThrow(expect.objectContaining({ code: 'weight_date_in_future' }));
  });
});

describe('reads merge check-in and standalone weights', () => {
  it('listWeights merges both kinds newest first, labels check-in ones, and lists same-day weights', async () => {
    state.rows = [
      standalone('s1', PET_A, '2026-11-18', 10.0),
      fromCheckIn('c1', PET_A, '2026-11-19', 10.4, '2026-11-20T02:00:00+00:00'),
      standalone('s2', PET_A, '2026-11-20', 11.2, '2026-11-20T15:00:00+00:00'),
      fromCheckIn('c2', PET_A, '2026-11-20', 11.0, '2026-11-20T14:00:00+00:00'),
      standalone('other', PET_B, '2026-11-20', 50),
    ];
    const list = await listWeights(PET_A);
    expect(list.map((e) => [e.id, e.date, e.lbs, e.fromCheckIn])).toEqual([
      ['s2', '2026-11-20', 11.2, false],
      ['c2', '2026-11-20', 11.0, true],
      ['c1', '2026-11-19', 10.4, true],
      ['s1', '2026-11-18', 10.0, false],
    ]);
  });

  it('listWeights caps at 10 by default', async () => {
    state.rows = Array.from({ length: 14 }, (_, i) => standalone(`s${i}`, PET_A, `2026-11-${String(i + 1).padStart(2, '0')}`, 10 + i / 10));
    const list = await listWeights(PET_A);
    expect(list).toHaveLength(10);
    expect(list[0].date).toBe('2026-11-14');
  });

  it('queries only weight-type rows with a value', async () => {
    await listWeights(PET_A);
    const q = state.queries[0];
    expect(q.table).toBe('observations');
    expect(q.calls).toContainEqual(['eq', 'observation_type_id', WEIGHT_TYPE_ID]);
    expect(q.calls).toContainEqual(['not', 'numeric_value', 'is', null]);
    expect(q.calls.find((c) => c[0] === 'select')[1]).toContain('daily_check_ins(check_in_date)');
  });
});

describe('reads are complete whatever the server row cap', () => {
  // 2,500 old weights, plus the newest weight on an id that sorts last, so
  // a single capped response (first 1,000 rows) would leave it out.
  const manyRows = () => {
    const rows = Array.from({ length: 2500 }, (_, i) =>
      standalone(`a${String(i).padStart(5, '0')}`, PET_A, '2025-01-01', 10 + (i % 10) / 10));
    rows.push(fromCheckIn('zzz-newest', PET_A, '2026-11-20', 14.2, '2026-11-21T01:00:00+00:00'));
    return rows;
  };

  it('pages past a 1,000-row cap so the newest weight is the current weight', async () => {
    state.rows = manyRows();
    const summary = await getWeightSummary(PET_A);
    expect(summary.currentLbs).toBe(14.2);
    const list = await listWeights(PET_A, 1);
    expect(list[0].id).toBe('zzz-newest');
  });

  it('still pages correctly when the server cap is smaller than the page size', async () => {
    state.rowCap = 7;
    state.rows = manyRows().slice(-30);
    const result = await getWeightSummariesForPets([PET_A]);
    expect(result[PET_A].currentLbs).toBe(14.2);
    expect(state.queries.length).toBeGreaterThan(1);
  });

  it('keyset-pages in id order, asking for the remaining count each time', async () => {
    state.rowCap = 2;
    state.rows = [
      standalone('b', PET_A, '2026-11-01', 10),
      standalone('a', PET_A, '2026-11-02', 11),
      standalone('c', PET_A, '2026-11-03', 12),
    ];
    const list = await listWeights(PET_A);
    expect(list.map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(state.queries).toHaveLength(2);
    for (const q of state.queries) {
      expect(q.calls).toContainEqual(['order', 'id', { ascending: true }]);
      expect(q.calls.find((c) => c[0] === 'select')[2]).toEqual({ count: 'exact' });
    }
    expect(state.queries[0].calls.some((c) => c[0] === 'gt')).toBe(false);
    expect(state.queries[1].calls).toContainEqual(['gt', 'id', 'b']);
  });
});

describe('reads skip check-in weights with no check-in date', () => {
  it('leaves the row out of the list and the summary', async () => {
    state.rows = [
      standalone('s1', PET_A, '2026-11-18', 10.0),
      { ...fromCheckIn('orphan', PET_A, '2026-11-25', 99, '2026-11-25T12:00:00+00:00'), daily_check_ins: null },
    ];
    const list = await listWeights(PET_A);
    expect(list.map((e) => e.id)).toEqual(['s1']);
    expect((await getWeightSummary(PET_A)).currentLbs).toBe(10);
  });
});

describe('weights outside 0.1–300 lbs stay out of summaries and charts', () => {
  const outOfRangeRows = () => [
    standalone('ok-low', PET_A, '2026-11-10', 0.1),
    standalone('ok-high', PET_A, '2026-11-11', 300),
    fromCheckIn('zero', PET_A, '2026-11-12', 0, '2026-11-12T12:00:00+00:00'),
    fromCheckIn('neg', PET_A, '2026-11-13', -4, '2026-11-13T12:00:00+00:00'),
    fromCheckIn('huge', PET_A, '2026-11-14', 300.1, '2026-11-14T12:00:00+00:00'),
    fromCheckIn('tiny', PET_A, '2026-11-15', 0.04, '2026-11-15T12:00:00+00:00'),
  ];

  it('listWeights still returns them, flagged, so the sheet can edit or delete them', async () => {
    state.rows = outOfRangeRows();
    const list = await listWeights(PET_A);
    expect(list.map((e) => [e.id, e.outOfRange])).toEqual([
      ['tiny', true], ['huge', true], ['neg', true], ['zero', true], ['ok-high', false], ['ok-low', false],
    ]);
  });

  it("summaries, Home's batch and the trend never include them", async () => {
    const tz = 'UTC';
    state.rows = outOfRangeRows();
    const summary = await getWeightSummary(PET_A);
    expect(summary.currentLbs).toBe(300);
    expect(summary.sparkline.map((p) => p.lbs)).toEqual([0.1, 300]);
    const batch = await getWeightSummariesForPets([PET_A]);
    expect(batch[PET_A].currentLbs).toBe(300);

    state.rows = [
      standalone('ok', PET_A, dateStrInTimezone(tz, -2), 12),
      fromCheckIn('bad', PET_A, dateStrInTimezone(tz, -1), 0, `${dateStrInTimezone(tz, -1)}T12:00:00+00:00`),
    ];
    const trend = await getWeightTrend(PET_A, '7D', tz);
    expect(trend.series).toEqual([{ date: dateStrInTimezone(tz, -2), value: 12 }]);
    expect(trend.currentLbs).toBe(12);
  });

  it('skips 0, negative and over-300 values saved through the old check-in box', async () => {
    state.rows = [
      standalone('ok-low', PET_A, '2026-11-10', 0.1),
      standalone('ok-high', PET_A, '2026-11-11', 300),
      fromCheckIn('zero', PET_A, '2026-11-12', 0, '2026-11-12T12:00:00+00:00'),
      fromCheckIn('neg', PET_A, '2026-11-13', -4, '2026-11-13T12:00:00+00:00'),
      fromCheckIn('huge', PET_A, '2026-11-14', 300.1, '2026-11-14T12:00:00+00:00'),
      fromCheckIn('tiny', PET_A, '2026-11-15', 0.04, '2026-11-15T12:00:00+00:00'),
    ];
    const summary = await getWeightSummary(PET_A);
    expect(summary.currentLbs).toBe(300);
    expect(summary.sparkline).toHaveLength(2);
  });
});

describe('ordering (FR6)', () => {
  it('orders by the weight\'s date, not by when a check-in row was (re)inserted', async () => {
    // Nov 10's check-in was re-saved today, so its row is brand new; it
    // must not jump ahead of Nov 20's weight.
    state.rows = [
      standalone('s20', PET_A, '2026-11-20', 11.2, '2026-11-20T13:00:00+00:00'),
      fromCheckIn('c10', PET_A, '2026-11-10', 9.0, '2026-11-24T09:00:00+00:00'),
    ];
    const summary = await getWeightSummary(PET_A);
    expect(summary.currentLbs).toBe(11.2);
    expect(summary.sparkline.map((p) => p.date)).toEqual(['2026-11-10', '2026-11-20']);
  });

  it('two weights on one day: the most recently saved is the day\'s weight', async () => {
    state.rows = [
      standalone('early', PET_A, '2026-11-20', 11.0, '2026-11-20T08:00:00+00:00'),
      standalone('late', PET_A, '2026-11-20', 11.4, '2026-11-20T20:00:00+00:00'),
      standalone('prev', PET_A, '2026-11-19', 11.1),
    ];
    const summary = await getWeightSummary(PET_A);
    expect(summary.sparkline).toEqual([{ date: '2026-11-19', lbs: 11.1 }, { date: '2026-11-20', lbs: 11.4 }]);
    expect(summary.currentLbs).toBe(11.4);
    expect(summary.deltaLbs).toBe(0.3);
  });

  it('is deterministic when date and updated_at tie', () => {
    const a = { id: 'a', date: '2026-11-20', updatedAt: 'x' };
    const b = { id: 'b', date: '2026-11-20', updatedAt: 'x' };
    expect([a, b].sort(compareWeightsNewestFirst).map((e) => e.id)).toEqual(['b', 'a']);
    expect([b, a].sort(compareWeightsNewestFirst).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('summaries', () => {
  it('getWeightSummary has no score or label (retired Stable/Monitor and 0–100 score)', async () => {
    state.rows = [standalone('s1', PET_A, '2026-11-19', 10), standalone('s2', PET_A, '2026-11-20', 12)];
    const summary = await getWeightSummary(PET_A);
    expect(Object.keys(summary).sort()).toEqual(['currentLbs', 'deltaLbs', 'sparkline']);
    expect(summary.deltaLbs).toBe(2);
  });

  it('empty pet returns nulls', async () => {
    expect(await getWeightSummary(PET_A)).toEqual({ currentLbs: null, deltaLbs: null, sparkline: [] });
  });

  it('getWeightSummariesForPets uses one observations query for every pet', async () => {
    state.rows = [
      standalone('a1', PET_A, '2026-11-20', 11.2),
      fromCheckIn('b1', PET_B, '2026-11-19', 50, '2026-11-19T22:00:00+00:00'),
      standalone('b2', PET_B, '2026-11-20', 49.5),
    ];
    const result = await getWeightSummariesForPets([PET_A, PET_B, 'pet-c']);
    expect(state.queries.filter((q) => q.table === 'observations')).toHaveLength(1);
    expect(state.queries[0].calls).toContainEqual(['in', 'pet_id', [PET_A, PET_B, 'pet-c']]);
    expect(result[PET_A]).toEqual({ currentLbs: 11.2, deltaLbs: null, sparkline: [{ date: '2026-11-20', lbs: 11.2 }] });
    expect(result[PET_B].currentLbs).toBe(49.5);
    expect(result[PET_B].deltaLbs).toBe(-0.5);
    expect(result['pet-c']).toEqual({ currentLbs: null, deltaLbs: null, sparkline: [] });
  });

  it('getWeightSummariesForPets with no pets makes no query', async () => {
    expect(await getWeightSummariesForPets([])).toEqual({});
    expect(state.queries).toHaveLength(0);
  });

  it('getWeightTrend keeps the range, one point per day, and reports history outside it', async () => {
    const tz = 'UTC';
    state.rows = [
      standalone('old', PET_A, dateStrInTimezone(tz, -60), 9.0),
      fromCheckIn('c', PET_A, dateStrInTimezone(tz, -3), 10.0, `${dateStrInTimezone(tz, -2)}T01:00:00+00:00`),
      standalone('s', PET_A, dateStrInTimezone(tz, -1), 10.5),
    ];
    const trend = await getWeightTrend(PET_A, '7D', tz);
    expect(trend.hasAnyData).toBe(true);
    expect(trend.series).toEqual([
      { date: dateStrInTimezone(tz, -3), value: 10.0 },
      { date: dateStrInTimezone(tz, -1), value: 10.5 },
    ]);
    expect(trend.currentLbs).toBe(10.5);
    expect(trend.deltaLbs).toBe(0.5);

    state.rows = [standalone('old', PET_A, dateStrInTimezone(tz, -60), 9.0)];
    const empty = await getWeightTrend(PET_A, '7D', tz);
    expect(empty).toEqual({ hasAnyData: true, series: [], currentLbs: null, deltaLbs: null });
  });
});

describe('writes go through entities.Observation', () => {
  const tz = 'America/New_York';

  it('addWeight saves a standalone weight dated noon UTC with no check-in', async () => {
    const date = dateStrInTimezone(tz, -2);
    await addWeight(PET_A, { date, lbs: 11.24 }, tz);
    expect(create).toHaveBeenCalledWith({
      pet_id: PET_A, daily_check_in_id: null, observation_type_id: WEIGHT_TYPE_ID,
      numeric_value: 11.2, observed_at: `${date}T12:00:00.000Z`,
    });
  });

  it('addWeight refuses out-of-range and future input without saving', async () => {
    await expect(addWeight(PET_A, { date: dateStrInTimezone(tz, 0), lbs: 0 }, tz)).rejects.toMatchObject({ code: 'weight_out_of_range' });
    await expect(addWeight(PET_A, { date: dateStrInTimezone(tz, 1), lbs: 10 }, tz)).rejects.toMatchObject({ code: 'weight_date_in_future' });
    expect(create).not.toHaveBeenCalled();
  });

  it('updateWeight on a standalone weight can change date and value', async () => {
    const entry = { id: 's1', date: '2026-11-18', lbs: 10, fromCheckIn: false };
    await updateWeight(entry, { date: '2026-11-17', lbs: 11.0 }, tz);
    expect(update).toHaveBeenCalledWith('s1', { numeric_value: 11, observed_at: '2026-11-17T12:00:00.000Z' });
  });

  it('updateWeight on a check-in weight changes only the value; its date is locked (FR3)', async () => {
    const entry = { id: 'c1', date: '2026-11-18', lbs: 10, fromCheckIn: true, checkInId: 'ci-1' };
    await updateWeight(entry, { lbs: 11.0 }, tz);
    expect(update).toHaveBeenCalledWith('c1', { numeric_value: 11 });
    await expect(updateWeight(entry, { date: '2026-11-17', lbs: 11 }, tz)).rejects.toMatchObject({ code: 'weight_date_locked' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('updateWeight on a check-in weight moves that check-in\'s updated_at first (spec 0043)', async () => {
    const entry = { id: 'c1', date: '2026-11-18', lbs: 10, fromCheckIn: true, checkInId: 'ci-1' };
    await updateWeight(entry, { lbs: 11.0 }, tz);
    expect(checkInUpdate).toHaveBeenCalledTimes(1);
    expect(checkInUpdate.mock.calls[0][0]).toBe('ci-1');
    expect(Object.keys(checkInUpdate.mock.calls[0][1])).toEqual(['updated_at']);
    expect(checkInUpdate.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  });

  it('updateWeight leaves the weight unchanged if the check-in can\'t be touched', async () => {
    checkInUpdate.mockRejectedValueOnce(new Error('no row'));
    const entry = { id: 'c1', date: '2026-11-18', lbs: 10, fromCheckIn: true, checkInId: 'ci-1' };
    await expect(updateWeight(entry, { lbs: 11.0 }, tz)).rejects.toThrow('no row');
    expect(update).not.toHaveBeenCalled();
  });

  it('updateWeight on a standalone weight does not touch any check-in', async () => {
    await updateWeight({ id: 's1', date: '2026-11-18', lbs: 10, fromCheckIn: false }, { lbs: 11 }, tz);
    expect(checkInUpdate).not.toHaveBeenCalled();
  });

  it('deleteWeight deletes the one observation row', async () => {
    state.rows = [fromCheckIn('c1', PET_A, '2026-11-18', 10, '2026-11-18T12:00:00+00:00')];
    await expect(deleteWeight({ id: 'c1', fromCheckIn: true, checkInId: 'ci-c1' })).resolves.toBe(true);
    const q = state.queries.find((x) => x.calls.some((c) => c[0] === 'delete'));
    expect(q.table).toBe('observations');
    expect(q.calls).toContainEqual(['eq', 'id', 'c1']);
    expect(state.rows).toHaveLength(0);
  });

  it("deleteWeight on a check-in weight moves that check-in's updated_at before deleting (spec 0043)", async () => {
    state.rows = [fromCheckIn('c1', PET_A, '2026-11-18', 10, '2026-11-18T12:00:00+00:00')];
    // When the check-in update runs, the weight row must still be there.
    let rowsAtCheckInUpdate = null;
    checkInUpdate.mockImplementation(async (id, patch) => {
      rowsAtCheckInUpdate = state.rows.map((r) => r.id);
      return { id, ...patch };
    });
    await deleteWeight({ id: 'c1', fromCheckIn: true, checkInId: 'ci-c1' });
    expect(checkInUpdate).toHaveBeenCalledTimes(1);
    expect(checkInUpdate.mock.calls[0][0]).toBe('ci-c1');
    expect(Object.keys(checkInUpdate.mock.calls[0][1])).toEqual(['updated_at']);
    expect(rowsAtCheckInUpdate).toEqual(['c1']);
    expect(state.rows).toHaveLength(0);
  });

  it("deleteWeight leaves the weight in place if the check-in can't be touched", async () => {
    state.rows = [fromCheckIn('c1', PET_A, '2026-11-18', 10, '2026-11-18T12:00:00+00:00')];
    checkInUpdate.mockRejectedValueOnce(new Error('no row'));
    await expect(deleteWeight({ id: 'c1', fromCheckIn: true, checkInId: 'ci-c1' })).rejects.toThrow('no row');
    expect(state.queries.some((x) => x.calls.some((c) => c[0] === 'delete'))).toBe(false);
    expect(state.rows).toHaveLength(1);
  });

  it('deleteWeight on a standalone weight does not touch any check-in', async () => {
    state.rows = [standalone('s1', PET_A, '2026-11-18', 10)];
    await deleteWeight({ id: 's1', fromCheckIn: false, checkInId: null });
    expect(checkInUpdate).not.toHaveBeenCalled();
    expect(state.rows).toHaveLength(0);
  });

  it('deleteWeight throws weight_not_found when no row was deleted (gone, or refused by RLS)', async () => {
    state.rows = [standalone('s1', PET_A, '2026-11-18', 10)];
    state.deletableIds = [];
    await expect(deleteWeight({ id: 's1', fromCheckIn: false })).rejects.toMatchObject({ code: 'weight_not_found' });
    await expect(deleteWeight({ id: 'missing', fromCheckIn: false })).rejects.toMatchObject({ code: 'weight_not_found' });
  });
});

describe('weightErrorText: what the Log weight sheet shows', () => {
  it('uses approved wording B for an out-of-range weight (AC4)', () => {
    expect(weightErrorText({ code: 'weight_out_of_range' }, 'save')).toBe('Enter a weight between 0.1 and 300 lbs.');
  });

  it('every weightClient error code has its own message', () => {
    for (const code of ['weight_out_of_range', 'weight_date_invalid', 'weight_date_in_future', 'weight_date_locked', 'weight_not_found']) {
      expect(weightErrorText({ code }, 'save')).toBe(WEIGHT_MESSAGES[code]);
      expect(WEIGHT_MESSAGES[code]).toBeTruthy();
    }
  });

  it('maps an update that matched no row (PGRST116) to the not-found message', () => {
    expect(weightErrorText({ code: 'PGRST116' }, 'save')).toBe(WEIGHT_MESSAGES.weight_not_found);
  });

  it('never shows a raw error message; falls back by action', () => {
    const raw = { code: '42501', message: 'new row violates row-level security policy' };
    expect(weightErrorText(raw, 'save')).toBe(WEIGHT_MESSAGES.save_failed);
    expect(weightErrorText(raw, 'delete')).toBe(WEIGHT_MESSAGES.delete_failed);
    expect(weightErrorText(new Error('network'), 'save')).toBe(WEIGHT_MESSAGES.save_failed);
    expect(weightErrorText({ code: 'save_failed' }, 'delete')).toBe(WEIGHT_MESSAGES.delete_failed);
  });

  it('validation errors from addWeight map straight to a message, with nothing saved', async () => {
    const tz = 'America/New_York';
    for (const [input, code] of [
      [{ date: dateStrInTimezone(tz, 0), lbs: 0 }, 'weight_out_of_range'],
      [{ date: dateStrInTimezone(tz, 0), lbs: 301 }, 'weight_out_of_range'],
      [{ date: dateStrInTimezone(tz, 1), lbs: 10 }, 'weight_date_in_future'],
      [{ date: '', lbs: 10 }, 'weight_date_invalid'],
    ]) {
      const err = await addWeight(PET_A, input, tz).catch((e) => e);
      expect(err.code).toBe(code);
      expect(WEIGHT_INPUT_ERROR_CODES.has(err.code)).toBe(true);
      expect(weightErrorText(err, 'save')).toBe(WEIGHT_MESSAGES[code]);
    }
    expect(create).not.toHaveBeenCalled();
  });
});
