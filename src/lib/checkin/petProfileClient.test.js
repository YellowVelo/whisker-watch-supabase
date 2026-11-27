import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spec 0087 AC9: medication history (the pet timeline) keeps listing every
// medication, including one whose end date has passed or that's switched
// off. Only "current" lists use the shared rule; the timeline doesn't.
const state = { checkIns: [], medications: [], vaccinations: [] };

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/api/entities', () => ({
  entities: {
    DailyCheckIn: { filter: async () => state.checkIns },
    Medication: { filter: async () => state.medications },
    Vaccination: { filter: async () => state.vaccinations },
  },
}));
vi.mock('./checkinClient', () => ({ getObservationValuesForCheckIns: async () => ({}) }));

const { getTimelineEvents } = await import('./petProfileClient');

const PET_ID = '0b6f1c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';

beforeEach(() => {
  state.checkIns = [];
  state.vaccinations = [];
  state.medications = [];
});

describe('getTimelineEvents (spec 0087 AC9)', () => {
  it('still lists a medication whose end date has passed', async () => {
    state.medications = [
      { id: 'm1', name: 'Carprofen', start_date: '2026-10-01', end_date: '2026-10-14', active: true },
    ];
    const events = await getTimelineEvents(PET_ID);
    expect(events).toContainEqual({ id: 'med-m1', date: '2026-10-01', type: 'medication', title: 'Started Carprofen' });
  });

  it('lists past-dated and switched-off medications alongside current ones', async () => {
    state.medications = [
      { id: 'cur', name: 'Apoquel', start_date: '2026-11-01', end_date: null, active: true },
      { id: 'ended', name: 'Carprofen', start_date: '2026-10-01', end_date: '2026-10-14', active: true },
      { id: 'off', name: 'Gabapentin', start_date: '2026-09-01', end_date: null, active: false },
    ];
    const events = await getTimelineEvents(PET_ID);
    const medIds = events.filter((e) => e.type === 'medication').map((e) => e.id);
    expect(medIds).toEqual(['med-cur', 'med-ended', 'med-off']);
  });
});
