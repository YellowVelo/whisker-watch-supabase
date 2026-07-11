import { describe, it, expect, vi, beforeEach } from 'vitest';

// Health Score Revision V2 — required tests #12 (editing observations
// recalculates the complete day) and #13 (editing a scored day to skipped
// removes its V2 score). entities/supabase are mocked so these exercise
// checkinClient.js's actual persistence logic without a live database,
// isolated per test via vi.resetModules() + dynamic import (the module
// caches loadObservationCatalog() at module scope, so a fresh module
// instance is needed per test to control the mocked catalog).
describe('checkinClient persistence (Health Score V2)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('markSkipped deletes any existing wellness_scores row for that date (spec #13)', async () => {
    const callOrder = [];
    const deleteMock = vi.fn(async (id) => { callOrder.push(`delete:${id}`); return true; });
    const filterMock = vi.fn().mockResolvedValue([{ id: 'ws-1' }]);
    const upsertMock = vi.fn(async () => { callOrder.push('upsert'); return { id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'skipped' }; });

    vi.doMock('@/api/entities', () => ({
      entities: {
        DailyCheckIn: { upsert: upsertMock },
        WellnessScore: { filter: filterMock, delete: deleteMock },
      },
    }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: {} }));

    const { markSkipped } = await import('./checkinClient');
    await markSkipped('pet-1', '2026-01-01', 'app');

    expect(filterMock).toHaveBeenCalledWith({ pet_id: 'pet-1', check_in_date: '2026-01-01' });
    expect(deleteMock).toHaveBeenCalledWith('ws-1');
    // The stale score must be gone before the check-in is flipped to
    // 'skipped' — if the delete never runs (or fails), the check-in must
    // never end up marked skipped while an old score is still visible.
    expect(callOrder).toEqual(['delete:ws-1', 'upsert']);
  });

  it('markNormal persists a 10/10 V2 health score and writes explicit baseline rows', async () => {
    const appetiteTypeId = 'type-appetite';
    const wellnessUpsertMock = vi.fn().mockResolvedValue({});
    const checkInUpsertMock = vi.fn().mockResolvedValue({ id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'normal' });
    const observationBulkCreateMock = vi.fn().mockResolvedValue([]);

    vi.doMock('@/api/entities', () => ({
      entities: {
        DailyCheckIn: { upsert: checkInUpsertMock },
        Observation: { bulkCreate: observationBulkCreateMock },
        WellnessScore: { filter: vi.fn().mockResolvedValue([]), upsert: wellnessUpsertMock },
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue([]) },
      },
    }));
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: { from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: deleteEqMock })) })) },
    }));

    const { markNormal } = await import('./checkinClient');
    const { healthScoreResult } = await markNormal('pet-1', '2026-01-01', 'app');

    expect(healthScoreResult).toEqual({ score: 10, totalDeduction: 0, deductionsByAttribute: {}, reasonSummary: null });
    expect(wellnessUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ score: 100, health_score: 10, health_score_version: 'health_score_v2', total_deductions: 0 }),
      'pet_id,check_in_date',
    );
    // Deletes any prior observations first (editing a previously-'changed'
    // day back to 'normal' must not leave stale symptom rows behind), then
    // writes an explicit confirmed-normal row per multi-select category
    // present in the catalog, rather than leaving no row at all — as a
    // single bulk insert, not N individual creates.
    expect(deleteEqMock).toHaveBeenCalledWith('daily_check_in_id', 'ci-1');
    expect(observationBulkCreateMock).toHaveBeenCalledWith([
      expect.objectContaining({ observation_type_id: appetiteTypeId, value: 'normal', severity_score: 0 }),
    ]);
  });

  it('saveChangedCheckIn recalculates the complete day from the current selections, not an incremental patch', async () => {
    const appetiteTypeId = 'type-appetite';
    const options = {
      normal: { observation_type_id: appetiteTypeId, value: 'normal', severity_score: 0 },
      ate_much_less: { observation_type_id: appetiteTypeId, value: 'ate_much_less', severity_score: -15 },
      did_not_eat: { observation_type_id: appetiteTypeId, value: 'did_not_eat', severity_score: -30 },
    };
    const wellnessUpsertMock = vi.fn().mockResolvedValue({});
    const checkInUpsertMock = vi.fn().mockResolvedValue({ id: 'ci-1', pet_id: 'pet-1', check_in_date: '2026-01-01', status: 'changed' });
    const observationBulkCreateMock = vi.fn().mockResolvedValue([]);

    vi.doMock('@/api/entities', () => ({
      entities: {
        DailyCheckIn: { upsert: checkInUpsertMock },
        Observation: { bulkCreate: observationBulkCreateMock },
        WellnessScore: { filter: vi.fn().mockResolvedValue([]), upsert: wellnessUpsertMock },
        ObservationType: { list: vi.fn().mockResolvedValue([{ id: appetiteTypeId, code: 'appetite' }]) },
        ObservationOption: { list: vi.fn().mockResolvedValue(Object.values(options)) },
      },
    }));
    // saveChangedCheckIn deletes any prior observations for this check-in
    // (via supabase.from('observations').delete().eq(...)) before
    // re-inserting the current selection set, so the mock needs to satisfy
    // that chain in addition to the entities.* calls above.
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('@/api/supabaseClient', () => ({
      supabase: { from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: deleteEqMock })) })) },
    }));

    const { saveChangedCheckIn } = await import('./checkinClient');

    // First save: two distinct appetite symptoms logged the same day —
    // equal weight, capped at -2 for the attribute regardless of count -> 8/10.
    const first = await saveChangedCheckIn('pet-1', '2026-01-01', [{ code: 'appetite', values: ['ate_much_less', 'did_not_eat'] }]);
    expect(first.healthScoreResult.score).toBe(8);
    expect(first.healthScoreResult.deductionsByAttribute).toEqual({ appetite: 2 });

    // Edit: re-saving with the full current selection set back to no
    // symptoms (confirmed normal) must recompute from scratch (10/10), not
    // subtract/add deltas.
    const second = await saveChangedCheckIn('pet-1', '2026-01-01', [{ code: 'appetite', values: [] }]);
    expect(second.healthScoreResult.score).toBe(10);
    expect(second.healthScoreResult.deductionsByAttribute).toEqual({});

    // Both saves must have cleared the check-in's prior observations first
    // — otherwise the stale symptom rows from the first save would still
    // exist for direction/observation reads to pick up.
    expect(deleteEqMock).toHaveBeenCalledTimes(2);
    expect(deleteEqMock).toHaveBeenCalledWith('daily_check_in_id', 'ci-1');
  });

  // Builds a minimal chainable Supabase query-builder stub: every method
  // used by the code under test returns the same chain object except the
  // terminal call, which resolves to `result`.
  function makeQueryChain(result) {
    const chain = {
      select: () => chain,
      in: () => chain,
      order: () => chain,
      eq: () => chain,
      limit: () => Promise.resolve(result),
      lt: () => Promise.resolve(result),
    };
    return chain;
  }

  // getRecentWellnessForPets's main fetch is bounded to `limitPerPet` rows,
  // so it can't tell "no V2 score at all before today" (First day logged)
  // apart from "there's a real V2 score, just outside this window" (Not
  // enough data) using the fetched rows alone — it must fall back to a
  // targeted existence query when direction comes back unknown. These two
  // cases were previously conflated (both read as "first day logged").
  it('reports "first_day" when no earlier V2 score exists at all', async () => {
    const petId = 'pet-1';
    const today = '2026-01-20';
    // Bounded fetch returns only today's row.
    const mainFetch = { data: [{ pet_id: petId, check_in_date: today, health_score: 9, health_score_version: 'health_score_v2' }], error: null };
    const existenceCheck = { data: [], error: null }; // no earlier row anywhere
    const fromMock = vi.fn()
      .mockReturnValueOnce(makeQueryChain(mainFetch))
      .mockReturnValueOnce(makeQueryChain(existenceCheck));

    vi.doMock('@/api/entities', () => ({ entities: {} }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { from: fromMock } }));

    const { getRecentWellnessForPets } = await import('./checkinClient');
    const result = await getRecentWellnessForPets([petId], 14, today);

    expect(result[petId].healthScore.direction).toBe('unknown');
    expect(result[petId].healthScore.directionReason).toBe('first_day');
  });

  it('reports "missing_yesterday" (not "first_day") when real history exists outside the fetch window', async () => {
    const petId = 'pet-1';
    const today = '2026-01-20';
    // Same bounded fetch as above — indistinguishable from the pet's
    // perspective without the extra existence check.
    const mainFetch = { data: [{ pet_id: petId, check_in_date: today, health_score: 9, health_score_version: 'health_score_v2' }], error: null };
    const existenceCheck = { data: [{ pet_id: petId }], error: null }; // an earlier V2 row does exist, just older than the window
    const fromMock = vi.fn()
      .mockReturnValueOnce(makeQueryChain(mainFetch))
      .mockReturnValueOnce(makeQueryChain(existenceCheck));

    vi.doMock('@/api/entities', () => ({ entities: {} }));
    vi.doMock('@/api/supabaseClient', () => ({ supabase: { from: fromMock } }));

    const { getRecentWellnessForPets } = await import('./checkinClient');
    const result = await getRecentWellnessForPets([petId], 14, today);

    expect(result[petId].healthScore.direction).toBe('unknown');
    expect(result[petId].healthScore.directionReason).toBe('missing_yesterday');
  });
});
