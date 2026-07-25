import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Daily Check-In, Vibe & Trends (spec v5) — persistence tests for the two
// signals that replace every prior score: Vibe (status) and Symptom Count.
// entities/supabase are mocked so these exercise checkinClient.js's actual
// persistence logic without a live database, isolated per test via
// vi.resetModules() + dynamic import (the module caches
// loadObservationCatalog() at module scope, so a fresh module instance is
// needed per test to control the mocked catalog).
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
    const checkInUpsertMock = vi.fn().mockResolvedValue({ id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'great' });
    const observationBulkCreateMock = vi.fn().mockResolvedValue([]);

    vi.doMock('@/api/entities', () => ({
      entities: {
        DailyCheckIn: { upsert: checkInUpsertMock },
        Observation: { bulkCreate: observationBulkCreateMock },
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: { from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: deleteEqMock })) })) },
    }));

    const { markGreatDay } = await import('./checkinClient');
    await markGreatDay('pet-1', '2026-01-01', 'app');

    expect(checkInUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'great', symptom_count: 0 }),
      'pet_id,check_in_date',
    );
    // Deletes any prior observations first (editing a previously off/tough
    // day back to Great Day must not leave stale symptom rows behind), then
    // writes an explicit confirmed-normal row per multi-select category
    // present in the catalog, as a single bulk insert.
    expect(deleteEqMock).toHaveBeenCalledWith('daily_check_in_id', 'ci-1');
    expect(observationBulkCreateMock).toHaveBeenCalledWith([
      expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'normal' }),
    ]);
  });

  it('markOffTough recalculates the complete day from the current selections, not an incremental patch', async () => {
    const appetiteTypeId = 'type-appetite';
    const checkInUpsertMock = vi.fn().mockResolvedValue({ id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'off' });
    const checkInUpdateMock = vi.fn().mockResolvedValue({});
    const observationBulkCreateMock = vi.fn().mockResolvedValue([]);

    vi.doMock('@/api/entities', () => ({
      entities: {
        DailyCheckIn: { upsert: checkInUpsertMock, update: checkInUpdateMock },
        Observation: { bulkCreate: observationBulkCreateMock },
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: { from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: deleteEqMock })) })) },
    }));

    const { markOffTough } = await import('./checkinClient');

    // First save: two distinct appetite symptoms logged the same day —
    // equal weight, both count, uncapped.
    const first = await markOffTough('pet-1', '2026-01-01', 'off', [{ code: 'appetite', values: ['ate_much_less', 'did_not_eat'] }]);
    expect(first.symptomCount).toBe(2);
    expect(checkInUpdateMock).toHaveBeenLastCalledWith('ci-1', { symptom_count: 2 });

    // Edit: re-saving with the full current selection set back to no
    // symptoms (confirmed normal) must recompute from scratch (0), not
    // subtract/add deltas.
    const second = await markOffTough('pet-1', '2026-01-01', 'off', [{ code: 'appetite', values: [] }]);
    expect(second.symptomCount).toBe(0);
    expect(checkInUpdateMock).toHaveBeenLastCalledWith('ci-1', { symptom_count: 0 });

    // Both saves must have cleared the check-in's prior observations first
    // — otherwise the stale symptom rows from the first save would still
    // exist for direction/observation reads to pick up.
    expect(deleteEqMock).toHaveBeenCalledTimes(2);
    expect(deleteEqMock).toHaveBeenCalledWith('daily_check_in_id', 'ci-1');
  });

  it('markOffTough never counts a "Not Observed" answer as a symptom', async () => {
    const waterTypeId = 'type-water';
    const checkInUpsertMock = vi.fn().mockResolvedValue({ id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'tough' });
    const checkInUpdateMock = vi.fn().mockResolvedValue({});

    vi.doMock('@/api/entities', () => ({
      entities: {
        DailyCheckIn: { upsert: checkInUpsertMock, update: checkInUpdateMock },
        Observation: { bulkCreate: vi.fn().mockResolvedValue([]) },
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: waterTypeId, code: 'water_intake' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: { from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) })) },
    }));

    const { markOffTough } = await import('./checkinClient');
    const result = await markOffTough('pet-1', '2026-01-01', 'tough', [{ code: 'water_intake', values: ['not_observed'] }]);

    expect(result.symptomCount).toBe(0);
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

// Catch Up (spec 0015), PR 3 — the bulk "finish" write.
describe('markGreatDaysBulk', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('writes one great-day row per date plus baseline observations for every counted category, in batched calls', async () => {
    const appetiteTypeId = 'type-appetite';
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03'];
    const upsertedCheckIns = dates.map((d, i) => ({ id: `ci-${i}`, pet_id: 'pet-1', check_in_date: d, status: 'great' }));

    const upsertMock = vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: upsertedCheckIns, error: null }) }));
    const deleteInMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn((table) => {
      if (table === 'daily_check_ins') return { upsert: upsertMock };
      if (table === 'observations') return { delete: vi.fn(() => ({ in: deleteInMock })) };
      throw new Error(`unexpected table ${table}`);
    });
    const observationBulkCreateMock = vi.fn().mockResolvedValue([]);

    vi.doMock('@/api/supabaseClient', () => ({
      supabase: { from: fromMock, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) } },
    }));
    vi.doMock('@/api/entities', () => ({
      entities: {
        Observation: { bulkCreate: observationBulkCreateMock },
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));

    const { markGreatDaysBulk } = await import('./checkinClient');
    const { checkIns } = await markGreatDaysBulk('pet-1', dates, 'catch_up');

    expect(checkIns).toHaveLength(3);
    // One upsert call for all 3 dates (not 3 separate calls) — the whole
    // point of the bulk path over N markGreatDay calls.
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      dates.map((d) => expect.objectContaining({ check_in_date: d, status: 'great', symptom_count: 0, source: 'catch_up', created_by: 'user-1' })),
      { onConflict: 'pet_id,check_in_date' },
    );
    // Stale observations cleared for every check-in in one call.
    expect(deleteInMock).toHaveBeenCalledWith('daily_check_in_id', ['ci-0', 'ci-1', 'ci-2']);
    // One baseline row per date for the single catalog category present.
    expect(observationBulkCreateMock).toHaveBeenCalledTimes(1);
    expect(observationBulkCreateMock.mock.calls[0][0]).toHaveLength(3);
    expect(observationBulkCreateMock.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'normal' }),
    );
  });

  it('is a no-op for an empty date list — no network calls at all', async () => {
    const fromMock = vi.fn();
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { from: fromMock } }));

    const { markGreatDaysBulk } = await import('./checkinClient');
    const result = await markGreatDaysBulk('pet-1', [], 'catch_up');

    expect(result).toEqual({ checkIns: [] });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
