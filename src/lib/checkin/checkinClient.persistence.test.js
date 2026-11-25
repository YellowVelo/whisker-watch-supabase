import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Daily Check-In, Vibe & Trends (spec v5) — persistence tests for the two
// signals that replace every prior score: Vibe (status) and Symptom Count.
// entities/supabase are mocked so these exercise checkinClient.js's actual
// persistence logic without a live database, isolated per test via
// vi.resetModules() + dynamic import (the module caches
// loadObservationCatalog() at module scope, so a fresh module instance is
// needed per test to control the mocked catalog).
//
// markGreatDay/markOffTough/markGreatDaysBulk/markOffToughBulk all write
// through the save_daily_check_ins RPC (migration 0034, spec 0016) instead
// of separate upsert/delete/bulkCreate calls, so these tests mock
// supabase.rpc and assert against the payload sent to it, rather than the
// old separate-call sequence.
describe('checkinClient persistence (Vibe & Symptom Count)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('markSkipped sets status to skipped and clears symptom_count', async () => {
    const upsertMock = vi.fn(async (payload) => ({ id: 'ci-1', ...payload }));
    vi.doMock('@/api/entities', () => ({
      entities: { DailyCheckIn: { upsert: upsertMock } },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: {} }));

    const { markSkipped } = await import('./checkinClient');
    await markSkipped('pet-1', '2026-01-01', 'app');

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'skipped', symptom_count: null }),
      'pet_id,check_in_date',
    );
  });

  it('markGreatDay writes status=great, symptom_count=0, and explicit baseline rows for every counted category', async () => {
    const appetiteTypeId = 'type-appetite';
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ conflict: false, check_in: { id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'great', symptom_count: 0 } }],
      error: null,
    });

    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markGreatDay } = await import('./checkinClient');
    const { checkIn } = await markGreatDay('pet-1', '2026-01-01', 'app');

    expect(checkIn).toEqual(expect.objectContaining({ id: 'ci-1', status: 'great' }));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    // One atomic call carrying both the check-in row and its observations
    // together — the RPC (not this JS code) is responsible for clearing any
    // prior observations before inserting the new baseline row, so there's
    // no separate delete-call assertion here anymore; the payload shape is
    // the only thing this test level can observe.
    expect(rpcMock).toHaveBeenCalledWith('save_daily_check_ins', {
      payloads: [
        expect.objectContaining({
          pet_id: 'pet-1',
          check_in_date: '2026-01-01',
          status: 'great',
          symptom_count: 0,
          observations: [expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'normal' })],
        }),
      ],
    });
  });

  it('markOffTough recalculates the complete day from the current selections, not an incremental patch', async () => {
    const appetiteTypeId = 'type-appetite';
    const rpcMock = vi.fn()
      .mockResolvedValueOnce({ data: [{ conflict: false, check_in: { id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'off', symptom_count: 2 } }], error: null })
      .mockResolvedValueOnce({ data: [{ conflict: false, check_in: { id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'off', symptom_count: 0 } }], error: null });

    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markOffTough } = await import('./checkinClient');

    // First save: two distinct appetite symptoms logged the same day —
    // equal weight, both count, uncapped.
    const first = await markOffTough('pet-1', '2026-01-01', 'off', [{ code: 'appetite', values: ['ate_much_less', 'did_not_eat'] }]);
    expect(first.symptomCount).toBe(2);
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'save_daily_check_ins', {
      payloads: [expect.objectContaining({ symptom_count: 2, observations: expect.arrayContaining([
        expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'ate_much_less' }),
        expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'did_not_eat' }),
      ]) })],
    });

    // Edit: re-saving with the full current selection set back to no
    // symptoms (confirmed normal) must recompute from scratch (0), not
    // subtract/add deltas — reflected here as a second, independent RPC
    // call whose payload has no leftover symptom rows from the first save.
    const second = await markOffTough('pet-1', '2026-01-01', 'off', [{ code: 'appetite', values: [] }]);
    expect(second.symptomCount).toBe(0);
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'save_daily_check_ins', {
      payloads: [expect.objectContaining({
        symptom_count: 0,
        observations: [expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'normal' })],
      })],
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('markOffTough never counts a "Not Observed" answer as a symptom', async () => {
    const waterTypeId = 'type-water';
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ conflict: false, check_in: { id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'tough', symptom_count: 0 } }],
      error: null,
    });

    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: waterTypeId, code: 'water_intake' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markOffTough } = await import('./checkinClient');
    const result = await markOffTough('pet-1', '2026-01-01', 'tough', [{ code: 'water_intake', values: ['not_observed'] }]);

    expect(result.symptomCount).toBe(0);
  });

  it('markOffTough throws and propagates the error when the RPC call fails, without swallowing it', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') });
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markOffTough } = await import('./checkinClient');
    await expect(markOffTough('pet-1', '2026-01-01', 'off', [])).rejects.toThrow('boom');
  });

  // Co-owner conflict detection (spec 0043) — the RPC refuses to overwrite
  // a day a different co-owner already changed since this caller loaded
  // it, and reports what's currently saved instead of the usual checkIn.
  it('markGreatDay reports a conflict instead of saving when a different save has landed since the caller loaded this day', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{
        conflict: true,
        check_in: { id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'off', symptom_count: 1, updated_at: '2026-01-01T12:00:00Z' },
        observations: [{ value: 'ate_much_less' }],
      }],
      error: null,
    });
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markGreatDay } = await import('./checkinClient');
    const result = await markGreatDay('pet-1', '2026-01-01', 'app', { expectedUpdatedAt: null });

    expect(result).toEqual({
      conflict: true,
      existingCheckIn: expect.objectContaining({ status: 'off' }),
      existingObservations: [{ value: 'ate_much_less' }],
    });
    expect(rpcMock).toHaveBeenCalledWith('save_daily_check_ins', {
      payloads: [expect.objectContaining({ expected_updated_at: null })],
    });
  });

  it('markOffTough omits expected_updated_at (no conflict check) when the caller does not opt in', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ conflict: false, check_in: { id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'off', symptom_count: 0 } }],
      error: null,
    });
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markOffTough } = await import('./checkinClient');
    await markOffTough('pet-1', '2026-01-01', 'off', []);

    const sentPayload = rpcMock.mock.calls[0][1].payloads[0];
    expect('expected_updated_at' in sentPayload).toBe(false);
  });
});

// Catch Up (spec 0015) gap detection.
describe('getMissedDaysForPet', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    // 2026-03-10 in UTC, comfortably clear of any DST edge.
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns no missed days when every day in range has a check-in', async () => {
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn().mockResolvedValue({
                  data: [{ check_in_date: '2026-03-09' }],
                  error: null,
                }),
              })),
            })),
          })),
        })),
      },
    }));

    const { getMissedDaysForPet } = await import('./checkinClient');
    const result = await getMissedDaysForPet('pet-1', { timezone: 'UTC', petCreatedAt: '2026-03-09T00:00:00Z' });
    expect(result).toEqual({ missedDates: [], count: 0 });
  });

  it('finds every missing day in a multi-day gap, not just the most recent one', async () => {
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        })),
      },
    }));

    const { getMissedDaysForPet } = await import('./checkinClient');
    // Pet created 2026-03-05, so the eligible window is 03-05..03-09 (yesterday).
    const result = await getMissedDaysForPet('pet-1', { timezone: 'UTC', petCreatedAt: '2026-03-05T00:00:00Z' });
    expect(result).toEqual({
      missedDates: ['2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'],
      count: 5,
    });
  });

  it('never looks back further than 6 months, even for a pet created long ago', async () => {
    let capturedGte;
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn((_col, value) => {
                capturedGte = value;
                return { lte: vi.fn().mockResolvedValue({ data: [], error: null }) };
              }),
            })),
          })),
        })),
      },
    }));

    const { getMissedDaysForPet, CATCH_UP_MAX_LOOKBACK_DAYS } = await import('./checkinClient');
    await getMissedDaysForPet('pet-1', { timezone: 'UTC', petCreatedAt: '2020-01-01T00:00:00Z' });
    expect(CATCH_UP_MAX_LOOKBACK_DAYS).toBe(180);
    // 2026-03-10 minus 180 days.
    expect(capturedGte).toBe('2025-09-11');
  });

  it('surfaces nothing for a pet or account created today — no backlog for a brand-new user', async () => {
    const fromMock = vi.fn();
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { from: fromMock } }));

    const { getMissedDaysForPet } = await import('./checkinClient');
    const result = await getMissedDaysForPet('pet-1', { timezone: 'UTC', petCreatedAt: '2026-03-10T08:00:00Z' });
    expect(result).toEqual({ missedDates: [], count: 0 });
    // Never even queries — the floor is already past yesterday.
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// Catch Up (spec 0015), PR 3 — the bulk "finish" write. Chunked atomic RPC
// calls (spec 0016) replace the old single bulk-upsert/bulk-delete/
// bulk-insert sequence.
describe('markGreatDaysBulk', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('writes one great-day row per date plus baseline observations for every counted category, in one RPC call', async () => {
    const appetiteTypeId = 'type-appetite';
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03'];
    const upsertedCheckIns = dates.map((d, i) => ({ id: `ci-${i}`, pet_id: 'pet-1', check_in_date: d, status: 'great', symptom_count: 0 }));

    const rpcMock = vi.fn().mockResolvedValue({ data: upsertedCheckIns.map((checkIn) => ({ conflict: false, check_in: checkIn })), error: null });
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));

    const { markGreatDaysBulk } = await import('./checkinClient');
    const { checkIns } = await markGreatDaysBulk('pet-1', dates, 'catch_up');

    expect(checkIns).toHaveLength(3);
    // Well under the 20-day chunk size, so this is one atomic call for all
    // 3 dates — not 3 separate calls, and not yet split into chunks.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('save_daily_check_ins', {
      payloads: dates.map((d) => expect.objectContaining({
        check_in_date: d, status: 'great', symptom_count: 0, source: 'catch_up',
        observations: [expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'normal' })],
      })),
    });
  });

  it('splits a gap larger than the chunk size into multiple sequential RPC calls', async () => {
    const dates = Array.from({ length: 45 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
    const rpcMock = vi.fn().mockImplementation((_fn, { payloads }) => Promise.resolve({
      data: payloads.map((p, i) => ({ conflict: false, check_in: { id: `ci-${i}`, ...p } })),
      error: null,
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));

    const { markGreatDaysBulk } = await import('./checkinClient');
    const { checkIns } = await markGreatDaysBulk('pet-1', dates, 'catch_up');

    // 45 dates / chunk size 20 = 3 calls (20 + 20 + 5), sequential, not
    // parallel — so a failure's exact position is always known.
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(rpcMock.mock.calls[0][1].payloads).toHaveLength(20);
    expect(rpcMock.mock.calls[1][1].payloads).toHaveLength(20);
    expect(rpcMock.mock.calls[2][1].payloads).toHaveLength(5);
    expect(checkIns).toHaveLength(45);
  });

  it('is a no-op for an empty date list — no network calls at all', async () => {
    const rpcMock = vi.fn();
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markGreatDaysBulk } = await import('./checkinClient');
    const result = await markGreatDaysBulk('pet-1', [], 'catch_up');

    expect(result).toEqual({ checkIns: [] });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('stops at the failed chunk — a later chunk never runs once an earlier one errors', async () => {
    const dates = Array.from({ length: 25 }, (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`);
    const rpcMock = vi.fn()
      .mockResolvedValueOnce({ data: null, error: new Error('boom') });
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));

    const { markGreatDaysBulk } = await import('./checkinClient');
    await expect(markGreatDaysBulk('pet-1', dates, 'catch_up')).rejects.toThrow('boom');
    // 25 dates = 2 chunks (20 + 5); only the first chunk's call should have
    // happened before the function threw.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

// BulkApplySheet.jsx's multi-day apply (spec 0016) — shares one status and
// one set of selections across every date in the bulk-apply session.
describe('markOffToughBulk', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves selections once and applies the same observations/symptom_count to every date, chunked', async () => {
    const appetiteTypeId = 'type-appetite';
    const dates = ['2026-07-01', '2026-07-02'];
    const rpcMock = vi.fn().mockResolvedValue({
      data: dates.map((d, i) => ({ conflict: false, check_in: { id: `ci-${i}`, pet_id: 'pet-1', check_in_date: d, status: 'off', symptom_count: 1 } })),
      error: null,
    });
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));

    const { markOffToughBulk } = await import('./checkinClient');
    const { checkIns, symptomCount } = await markOffToughBulk(
      'pet-1', dates, 'off', [{ code: 'appetite', values: ['ate_much_less'] }], 'catch_up',
    );

    expect(symptomCount).toBe(1);
    expect(checkIns).toHaveLength(2);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('save_daily_check_ins', {
      payloads: dates.map((d) => expect.objectContaining({
        check_in_date: d, status: 'off', symptom_count: 1, source: 'catch_up',
        observations: [expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'ate_much_less' })],
      })),
    });
  });

  it('is a no-op for an empty date list — no network calls at all', async () => {
    const rpcMock = vi.fn();
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));

    const { markOffToughBulk } = await import('./checkinClient');
    const result = await markOffToughBulk('pet-1', [], 'off', []);

    expect(result).toEqual({ checkIns: [] });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('splits more than 20 dates into multiple sequential chunked RPC calls', async () => {
    const dates = Array.from({ length: 22 }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`);
    const rpcMock = vi.fn().mockImplementation((_fn, { payloads }) => Promise.resolve({
      data: payloads.map((p, i) => ({ conflict: false, check_in: { id: `ci-${i}`, ...p } })),
      error: null,
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock } }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));

    const { markOffToughBulk } = await import('./checkinClient');
    const { checkIns } = await markOffToughBulk('pet-1', dates, 'tough', []);

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[0][1].payloads).toHaveLength(20);
    expect(rpcMock.mock.calls[1][1].payloads).toHaveLength(2);
    expect(checkIns).toHaveLength(22);
  });
});

// Spec 0081 "Check-in edit safety": save_daily_check_ins deletes and
// re-inserts a check-in's observations, so every save path must re-send
// the day's saved weight unless the owner changed or cleared it in the form.
describe("every check-in save keeps the day's weight", () => {
  const APPETITE = 'type-appetite';
  const WEIGHT = 'type-weight';

  // A chainable stand-in for supabase.from('observations')... that records
  // every filter and resolves to `result`.
  function makeObservationsQuery(result) {
    const calls = [];
    const query = {
      calls,
      select: (...args) => { calls.push(['select', ...args]); return query; },
      eq: (...args) => { calls.push(['eq', ...args]); return query; },
      in: (...args) => { calls.push(['in', ...args]); return query; },
      is: (...args) => { calls.push(['is', ...args]); return query; },
      gte: (...args) => { calls.push(['gte', ...args]); return query; },
      lt: (...args) => { calls.push(['lt', ...args]); return query; },
      delete: () => { calls.push(['delete']); return query; },
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return query;
  }

  function weightRow(date, lbs, updatedAt = '2026-07-01T10:00:00Z', notes = null, id = `w-${date}-${lbs}`) {
    return { id, observation_type_id: WEIGHT, value: null, numeric_value: lbs, notes, updated_at: updatedAt, daily_check_ins: { check_in_date: date } };
  }

  // Each supabase.from() call gets its own recorded query. `query` is the
  // first one (the weight read); `reads`/`deletes` split them by kind.
  function setup({ weightRows = [], readError = null } = {}) {
    const queries = [];
    const fromMock = vi.fn(() => {
      const q = makeObservationsQuery({ data: readError ? null : weightRows, error: readError });
      queries.push(q);
      return q;
    });
    const isDelete = (q) => q.calls.some((c) => c[0] === 'delete');
    const rpcMock = vi.fn().mockImplementation((_fn, { payloads }) => Promise.resolve({
      data: payloads.map((p, i) => ({ conflict: false, check_in: { id: `ci-${i}`, updated_at: 'u', ...p } })),
      error: null,
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: APPETITE, code: 'appetite' }, { id: WEIGHT, code: 'weight' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    return {
      rpcMock,
      fromMock,
      get query() { return queries[0]; },
      get reads() { return queries.filter((q) => !isDelete(q)); },
      get deletes() { return queries.filter(isDelete); },
    };
  }

  const weightsIn = (payload) => payload.observations.filter((o) => o.observation_type_id === WEIGHT);

  beforeEach(() => {
    vi.resetModules();
  });

  it('Great Day on a day that already has a weight re-sends that weight (and still sends expected_updated_at)', async () => {
    const harness = setup({ weightRows: [weightRow('2026-07-01', 12.4)] });
    const { rpcMock, fromMock } = harness;
    const { markGreatDay } = await import('./checkinClient');
    await markGreatDay('pet-1', '2026-07-01', 'app', { expectedUpdatedAt: '2026-07-01T09:00:00Z' });

    // Reads only this pet's saved check-in weights for that day.
    expect(fromMock).toHaveBeenCalledWith('observations');
    expect(harness.query.calls).toEqual(expect.arrayContaining([
      ['eq', 'pet_id', 'pet-1'],
      ['eq', 'observation_type_id', WEIGHT],
      ['in', 'daily_check_ins.check_in_date', ['2026-07-01']],
    ]));
    const [payload] = rpcMock.mock.calls[0][1].payloads;
    expect(payload.expected_updated_at).toBe('2026-07-01T09:00:00Z');
    expect(payload.status).toBe('great');
    expect(weightsIn(payload)).toEqual([{ observation_type_id: WEIGHT, value: null, numeric_value: 12.4, notes: null }]);
    // The baseline row is still there and weight never touches the count.
    expect(payload.observations).toEqual(expect.arrayContaining([expect.objectContaining({ observation_type_id: APPETITE, value: 'normal' })]));
    expect(payload.symptom_count).toBe(0);
  });

  it('Great Day on a day with no weight sends no weight row', async () => {
    const { rpcMock } = setup({ weightRows: [] });
    const { markGreatDay } = await import('./checkinClient');
    await markGreatDay('pet-1', '2026-07-01', 'app');
    expect(weightsIn(rpcMock.mock.calls[0][1].payloads[0])).toEqual([]);
  });

  it('an Off/Tough re-save that leaves Weight out of the selections keeps the saved weight', async () => {
    const { rpcMock } = setup({ weightRows: [weightRow('2026-07-01', 12.4)] });
    const { markOffTough } = await import('./checkinClient');
    const result = await markOffTough('pet-1', '2026-07-01', 'off', [{ code: 'appetite', values: ['ate_much_less'] }], 'app', { expectedUpdatedAt: 'u0' });

    const [payload] = rpcMock.mock.calls[0][1].payloads;
    expect(weightsIn(payload)).toEqual([expect.objectContaining({ numeric_value: 12.4 })]);
    expect(payload.expected_updated_at).toBe('u0');
    expect(result.symptomCount).toBe(1);
  });

  it('a weight the owner typed replaces the saved one (no old row is re-sent, no extra read)', async () => {
    const harness = setup({ weightRows: [weightRow('2026-07-01', 12.4)] });
    const { rpcMock } = harness;
    const { markOffTough } = await import('./checkinClient');
    await markOffTough('pet-1', '2026-07-01', 'off', [{ code: 'weight', numericValue: 13.1 }]);

    expect(harness.reads).toHaveLength(0);
    expect(weightsIn(rpcMock.mock.calls[0][1].payloads[0])).toEqual([expect.objectContaining({ numeric_value: 13.1 })]);
  });

  it("a Weight box the owner emptied clears the day's weight", async () => {
    const harness = setup({ weightRows: [weightRow('2026-07-01', 12.4)] });
    const { rpcMock } = harness;
    const { markOffTough } = await import('./checkinClient');
    await markOffTough('pet-1', '2026-07-01', 'tough', [{ code: 'weight', numericValue: null }]);

    expect(harness.reads).toHaveLength(0);
    expect(weightsIn(rpcMock.mock.calls[0][1].payloads[0])).toEqual([]);
  });

  it('re-sends at most one weight row per day, even if older data has several (latest saved, then larger id)', async () => {
    const { rpcMock } = setup({ weightRows: [
      weightRow('2026-07-01', 12.4, '2026-07-01T08:00:00Z'),
      weightRow('2026-07-01', 12.9, '2026-07-01T12:00:00Z', 'after the vet'),
      weightRow('2026-07-02', 8.0, '2026-07-02T08:00:00Z', null, 'a'),
      weightRow('2026-07-02', 8.5, '2026-07-02T08:00:00Z', null, 'b'),
    ] });
    const { markGreatDay, markGreatDaysBulk } = await import('./checkinClient');
    await markGreatDay('pet-1', '2026-07-01');
    expect(weightsIn(rpcMock.mock.calls[0][1].payloads[0]).map((o) => [o.numeric_value, o.notes])).toEqual([[12.9, 'after the vet']]);

    // A tie on time (rows re-inserted together) is broken by id, the same way every time.
    await markGreatDaysBulk('pet-1', ['2026-07-01', '2026-07-02']);
    expect(rpcMock.mock.calls[1][1].payloads.map((p) => weightsIn(p).map((o) => o.numeric_value))).toEqual([[12.9], [8.5]]);
  });

  it("does not save at all if the saved weight can't be read (so it can't be lost blind)", async () => {
    const { rpcMock } = setup({ readError: new Error('read failed') });
    const { markGreatDay, markOffTough, markGreatDaysBulk, markOffToughBulk } = await import('./checkinClient');
    await expect(markGreatDay('pet-1', '2026-07-01')).rejects.toThrow('read failed');
    await expect(markOffTough('pet-1', '2026-07-01', 'off', [])).rejects.toThrow('read failed');
    await expect(markGreatDaysBulk('pet-1', ['2026-07-01'])).rejects.toThrow('read failed');
    await expect(markOffToughBulk('pet-1', ['2026-07-01'], 'off', [])).rejects.toThrow('read failed');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('a conflict (spec 0043) is still reported, with nothing saved', async () => {
    const { fromMock } = setup({ weightRows: [weightRow('2026-07-01', 12.4)] });
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ conflict: true, check_in: { id: 'ci-1', status: 'off', updated_at: 'newer' }, observations: [] }],
      error: null,
    });
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
    const { markGreatDay } = await import('./checkinClient');
    const result = await markGreatDay('pet-1', '2026-07-01', 'app', { expectedUpdatedAt: 'older' });
    expect(result).toEqual(expect.objectContaining({ conflict: true }));
    expect(rpcMock.mock.calls[0][1].payloads[0].expected_updated_at).toBe('older');
  });

  it("Catch-Up's bulk Great Day keeps each day's own weight", async () => {
    const harness = setup({ weightRows: [weightRow('2026-07-01', 12.4), weightRow('2026-07-03', 12.8)] });
    const { rpcMock } = harness;
    const { markGreatDaysBulk } = await import('./checkinClient');
    await markGreatDaysBulk('pet-1', ['2026-07-01', '2026-07-02', '2026-07-03'], 'catch_up');

    expect(harness.query.calls).toEqual(expect.arrayContaining([['in', 'daily_check_ins.check_in_date', ['2026-07-01', '2026-07-02', '2026-07-03']]]));
    const payloads = rpcMock.mock.calls[0][1].payloads;
    expect(payloads.map((p) => weightsIn(p).map((o) => o.numeric_value))).toEqual([[12.4], [], [12.8]]);
  });

  it("bulk apply with an empty Weight box keeps each day's own weight", async () => {
    const { rpcMock } = setup({ weightRows: [weightRow('2026-07-02', 9.5)] });
    const { markOffToughBulk } = await import('./checkinClient');
    await markOffToughBulk('pet-1', ['2026-07-01', '2026-07-02'], 'off', [{ code: 'appetite', values: ['ate_much_less'] }], 'catch_up');

    const payloads = rpcMock.mock.calls[0][1].payloads;
    expect(payloads.map((p) => weightsIn(p).map((o) => o.numeric_value))).toEqual([[], [9.5]]);
    expect(payloads.every((p) => p.symptom_count === 1)).toBe(true);
  });

  it('bulk apply with a typed weight saves that weight to every day instead', async () => {
    const harness = setup({ weightRows: [weightRow('2026-07-02', 9.5)] });
    const { rpcMock } = harness;
    const { markOffToughBulk } = await import('./checkinClient');
    await markOffToughBulk('pet-1', ['2026-07-01', '2026-07-02'], 'off', [{ code: 'weight', numericValue: 10.2 }], 'catch_up');

    expect(harness.reads).toHaveLength(0);
    const payloads = rpcMock.mock.calls[0][1].payloads;
    expect(payloads.map((p) => weightsIn(p).map((o) => o.numeric_value))).toEqual([[10.2], [10.2]]);
  });

  it("bulk saves read each chunk's weights just before that chunk is saved", async () => {
    const dates = Array.from({ length: 22 }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`);
    const { rpcMock, fromMock } = setup({ weightRows: [weightRow('2026-03-22', 20)] });
    const { markGreatDaysBulk } = await import('./checkinClient');
    await markGreatDaysBulk('pet-1', dates, 'catch_up');

    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(weightsIn(rpcMock.mock.calls[1][1].payloads[1])).toEqual([expect.objectContaining({ numeric_value: 20 })]);
  });

  // The old check-in Weight box didn't check its range, and no screen counts
  // a value outside 0.1–300 lbs as a weight (weightClient.js). Re-sending
  // one could only push out the day's real weight.
  it('never re-sends an out-of-range value: a newer 500 lbs row does not push out the in-range weight', async () => {
    const { rpcMock } = setup({ weightRows: [
      weightRow('2026-07-01', 12.4, '2026-07-01T08:00:00Z'),
      weightRow('2026-07-01', 500, '2026-07-01T12:00:00Z'),
      weightRow('2026-07-02', 0, '2026-07-02T12:00:00Z'),
      weightRow('2026-07-02', 8.5, '2026-07-02T08:00:00Z'),
    ] });
    const { markGreatDay, markGreatDaysBulk } = await import('./checkinClient');
    await markGreatDay('pet-1', '2026-07-01');
    expect(weightsIn(rpcMock.mock.calls[0][1].payloads[0]).map((o) => o.numeric_value)).toEqual([12.4]);

    await markGreatDaysBulk('pet-1', ['2026-07-01', '2026-07-02']);
    expect(rpcMock.mock.calls[1][1].payloads.map((p) => weightsIn(p).map((o) => o.numeric_value))).toEqual([[12.4], [8.5]]);
  });

  it('a day whose only check-in weight is out of range re-sends no weight row (the day had no weight, and still has none)', async () => {
    const { rpcMock } = setup({ weightRows: [weightRow('2026-07-01', 301), weightRow('2026-07-01', -2, '2026-07-01T11:00:00Z')] });
    const { markOffTough } = await import('./checkinClient');
    await markOffTough('pet-1', '2026-07-01', 'off', [{ code: 'appetite', values: ['ate_much_less'] }]);
    expect(weightsIn(rpcMock.mock.calls[0][1].payloads[0])).toEqual([]);
  });

  it('the range check uses the same rounding as every screen: 0.05 rounds to 0.1 and is kept, 300.04 is kept, 300.06 is not', async () => {
    const { rpcMock } = setup({ weightRows: [
      weightRow('2026-07-01', 0.05),
      weightRow('2026-07-02', 300.04),
      weightRow('2026-07-03', 300.06),
    ] });
    const { markGreatDaysBulk } = await import('./checkinClient');
    await markGreatDaysBulk('pet-1', ['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(rpcMock.mock.calls[0][1].payloads.map((p) => weightsIn(p).map((o) => o.numeric_value))).toEqual([[0.05], [300.04], []]);
  });
});

// One weight per pet per day (Lynn, 2026-11-25). A small in-memory stand-in
// for the database checks the day's resulting weights, not just payloads:
// save_daily_check_ins replaces a day's check-in observations with the
// payload's, and deletes on `observations` match the filters sent.
describe("a check-in weight the owner typed or cleared is the day's only weight", () => {
  const WEIGHT = 'type-weight';
  const PET = 'pet-1';

  function makeDb({ standalone = [], checkInWeights = {}, deleteError = null, rpcResult = null } = {}) {
    const db = {
      // Standalone weights: { id, pet_id, observed_at, numeric_value }.
      standalone: standalone.map((r) => ({ observation_type_id: WEIGHT, daily_check_in_id: null, ...r })),
      // Check-in weights by date: numeric values.
      checkInWeights: { ...checkInWeights },
      deleteError,
    };
    const from = vi.fn(() => {
      const calls = [];
      const q = {
        select: (...a) => { calls.push(['select', ...a]); return q; },
        delete: () => { calls.push(['delete']); return q; },
        eq: (...a) => { calls.push(['eq', ...a]); return q; },
        in: (...a) => { calls.push(['in', ...a]); return q; },
        is: (...a) => { calls.push(['is', ...a]); return q; },
        gte: (...a) => { calls.push(['gte', ...a]); return q; },
        lt: (...a) => { calls.push(['lt', ...a]); return q; },
        then: (resolve, reject) => {
          const val = (op, col) => calls.find((c) => c[0] === op && c[1] === col)?.[2];
          if (calls.some((c) => c[0] === 'delete')) {
            if (db.deleteError) return Promise.resolve({ data: null, error: db.deleteError }).then(resolve, reject);
            const onlyStandalone = calls.some((c) => c[0] === 'is' && c[1] === 'daily_check_in_id' && c[2] === null);
            const matches = (r) => onlyStandalone
              && r.pet_id === val('eq', 'pet_id')
              && r.observation_type_id === val('eq', 'observation_type_id')
              && r.observed_at >= val('gte', 'observed_at')
              && r.observed_at < val('lt', 'observed_at');
            db.standalone = db.standalone.filter((r) => !matches(r));
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          const dates = val('in', 'daily_check_ins.check_in_date') || [];
          const data = dates.flatMap((d) => (db.checkInWeights[d] || []).map((lbs, i) => ({
            id: `c-${d}-${i}`, observation_type_id: WEIGHT, value: null, numeric_value: lbs, notes: null,
            updated_at: '2026-07-01T00:00:00Z', daily_check_ins: { check_in_date: d },
          })));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return q;
    });
    const rpc = vi.fn().mockImplementation((_fn, { payloads }) => {
      if (rpcResult) return Promise.resolve(rpcResult);
      for (const p of payloads) {
        db.checkInWeights[p.check_in_date] = p.observations.filter((o) => o.observation_type_id === WEIGHT).map((o) => o.numeric_value);
      }
      return Promise.resolve({ data: payloads.map((p, i) => ({ conflict: false, check_in: { id: `ci-${i}`, ...p } })), error: null });
    });
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { rpc, from } }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: 'type-appetite', code: 'appetite' }, { id: WEIGHT, code: 'weight' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    const reportClientError = vi.fn();
    vi.doMock('@/lib/errorMonitoring', () => ({ reportClientError }));
    // Every weight the day has, check-in and standalone, using weightClient's
    // dating rule for standalone rows (UTC date of observed_at).
    const dayWeights = (date) => [
      ...(db.checkInWeights[date] || []),
      ...db.standalone.filter((r) => r.pet_id === PET && r.observed_at.slice(0, 10) === date).map((r) => r.numeric_value),
    ];
    return { db, dayWeights, rpc, from, reportClientError };
  }

  const sa = (id, date, lbs, petId = PET) => ({ id, pet_id: petId, observed_at: `${date}T12:00:00.000Z`, numeric_value: lbs });

  beforeEach(() => {
    vi.resetModules();
  });

  it("single-day save with a typed weight removes that day's standalone weight", async () => {
    const { db, dayWeights } = makeDb({
      standalone: [sa('s1', '2026-07-01', 12.0), sa('s-prev', '2026-06-30', 11.0), sa('s-next', '2026-07-02', 11.5), sa('s-other-pet', '2026-07-01', 40, 'pet-2')],
      checkInWeights: { '2026-07-01': [11.0] },
    });
    const { markOffTough } = await import('./checkinClient');
    const result = await markOffTough(PET, '2026-07-01', 'off', [{ code: 'weight', numericValue: 13.1 }], 'app', { expectedUpdatedAt: 'u' });

    expect(dayWeights('2026-07-01')).toEqual([13.1]);
    // Neighbouring days and other pets are untouched.
    expect(dayWeights('2026-06-30')).toEqual([11.0]);
    expect(dayWeights('2026-07-02')).toEqual([11.5]);
    expect(db.standalone.map((r) => r.id)).toEqual(['s-prev', 's-next', 's-other-pet']);
    expect(result.weightCleanupFailedDates).toEqual([]);
  });

  it('single-day save with the Weight box cleared leaves the day with no weight', async () => {
    const { dayWeights } = makeDb({ standalone: [sa('s1', '2026-07-01', 12.0)], checkInWeights: { '2026-07-01': [11.0] } });
    const { markOffTough } = await import('./checkinClient');
    await markOffTough(PET, '2026-07-01', 'tough', [{ code: 'weight', numericValue: null }]);
    expect(dayWeights('2026-07-01')).toEqual([]);
  });

  it('a save that leaves Weight alone keeps the standalone weight', async () => {
    const { dayWeights } = makeDb({ standalone: [sa('s1', '2026-07-01', 12.0)] });
    const { markOffTough, markGreatDay } = await import('./checkinClient');
    await markOffTough(PET, '2026-07-01', 'off', [{ code: 'appetite', values: ['ate_much_less'] }]);
    await markGreatDay(PET, '2026-07-01');
    expect(dayWeights('2026-07-01')).toEqual([12.0]);
  });

  it('a refused (conflict) save removes nothing', async () => {
    const { dayWeights, from } = makeDb({
      standalone: [sa('s1', '2026-07-01', 12.0)],
      rpcResult: { data: [{ conflict: true, check_in: { id: 'ci-1', updated_at: 'newer' }, observations: [] }], error: null },
    });
    const { markOffTough } = await import('./checkinClient');
    const result = await markOffTough(PET, '2026-07-01', 'off', [{ code: 'weight', numericValue: 13 }], 'app', { expectedUpdatedAt: 'older' });
    expect(result.conflict).toBe(true);
    expect(from).not.toHaveBeenCalled();
    expect(dayWeights('2026-07-01')).toEqual([12.0]);
  });

  it('a failed save removes nothing', async () => {
    const { dayWeights, from } = makeDb({ standalone: [sa('s1', '2026-07-01', 12.0)], rpcResult: { data: null, error: new Error('boom') } });
    const { markOffTough } = await import('./checkinClient');
    await expect(markOffTough(PET, '2026-07-01', 'off', [{ code: 'weight', numericValue: 13 }])).rejects.toThrow('boom');
    expect(from).not.toHaveBeenCalled();
    expect(dayWeights('2026-07-01')).toEqual([12.0]);
  });

  it('if removing the standalone weight fails, the check-in save still succeeds, nothing is lost, and it is reported', async () => {
    const deleteError = { code: '08006', message: 'network' };
    const { dayWeights, reportClientError } = makeDb({ standalone: [sa('s1', '2026-07-01', 12.0)], deleteError });
    const { markOffTough } = await import('./checkinClient');
    const result = await markOffTough(PET, '2026-07-01', 'off', [{ code: 'weight', numericValue: 13 }]);

    expect(result.checkIn).toBeTruthy();
    expect(result.weightCleanupFailedDates).toEqual(['2026-07-01']);
    expect(reportClientError).toHaveBeenCalledWith(deleteError, expect.objectContaining({ feature: 'daily_checkin' }));
    // Both are kept; weightClient's readers then choose the standalone one
    // as the day's weight, the one the day had before this save
    // (weightClient.test.js covers that order).
    expect(dayWeights('2026-07-01').sort()).toEqual([12.0, 13]);
  });

  it('Catch-Up bulk apply with a typed weight leaves each of those days one weight; other days keep theirs', async () => {
    const { dayWeights } = makeDb({
      standalone: [sa('s1', '2026-07-01', 12.0), sa('s2', '2026-07-02', 12.2), sa('s5', '2026-07-05', 12.5)],
      checkInWeights: { '2026-07-02': [11.9] },
    });
    const { markOffToughBulk } = await import('./checkinClient');
    const result = await markOffToughBulk(PET, ['2026-07-01', '2026-07-02', '2026-07-03'], 'off', [{ code: 'weight', numericValue: 10.2 }], 'catch_up');

    for (const d of ['2026-07-01', '2026-07-02', '2026-07-03']) expect(dayWeights(d)).toEqual([10.2]);
    expect(dayWeights('2026-07-05')).toEqual([12.5]);
    expect(result.weightCleanupFailedDates).toEqual([]);
  });

  it('Catch-Up bulk apply with an empty Weight box removes no weight', async () => {
    const { dayWeights } = makeDb({ standalone: [sa('s1', '2026-07-01', 12.0)], checkInWeights: { '2026-07-02': [11.9] } });
    const { markOffToughBulk } = await import('./checkinClient');
    await markOffToughBulk(PET, ['2026-07-01', '2026-07-02'], 'off', [{ code: 'appetite', values: ['ate_much_less'] }], 'catch_up');
    expect(dayWeights('2026-07-01')).toEqual([12.0]);
    expect(dayWeights('2026-07-02')).toEqual([11.9]);
  });

  it('Catch-Up bulk apply reports a failed removal per day and still saves every day', async () => {
    const { dayWeights, reportClientError } = makeDb({ standalone: [sa('s1', '2026-07-01', 12.0)], deleteError: { code: 'x' } });
    const { markOffToughBulk } = await import('./checkinClient');
    const result = await markOffToughBulk(PET, ['2026-07-01', '2026-07-02'], 'off', [{ code: 'weight', numericValue: 10.2 }], 'catch_up');
    expect(result.checkIns).toHaveLength(2);
    expect(result.weightCleanupFailedDates).toEqual(['2026-07-01', '2026-07-02']);
    expect(reportClientError).toHaveBeenCalledTimes(2);
    expect(dayWeights('2026-07-02')).toEqual([10.2]);
  });

  it('a re-save of a day with several legacy check-in weights leaves exactly one', async () => {
    const { dayWeights } = makeDb({ checkInWeights: { '2026-07-01': [11.0, 11.0, 11.4] } });
    const { markGreatDay } = await import('./checkinClient');
    await markGreatDay(PET, '2026-07-01');
    expect(dayWeights('2026-07-01')).toHaveLength(1);
  });
});
