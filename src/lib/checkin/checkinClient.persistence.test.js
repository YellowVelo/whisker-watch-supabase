import { describe, it, expect, vi, beforeEach } from 'vitest';

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
