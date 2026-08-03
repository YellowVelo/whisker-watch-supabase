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
