import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fake data for one signed-in person ("me"):
//   pet-own     — I created it, and I'm also listed as a sitter on it
//   pet-coown   — I co-own it, and I'm also listed as a sitter on it
//   pet-friend  — I only sit for it
//   pet-other   — mine, not in any sit
const me = { id: 'me', email: 'me@example.com' };
const state = {
  accesses: [{ pet_sit_id: 'sit-1' }, { pet_sit_id: 'sit-2' }],
  sits: {
    'sit-1': { pet_ids: ['pet-own', 'pet-friend'] },
    'sit-2': { pet_ids: ['pet-coown'] },
  },
  createdByMe: ['pet-own', 'pet-other'],
  coOwnerRows: [{ pet_id: 'pet-coown' }],
  pets: ['pet-own', 'pet-coown', 'pet-friend', 'pet-other'].map((id) => ({ id })),
  /** @type {Error | null} */ sitterLookupError: null,
  /** @type {Error | null} */ petListError: null,
  /** @type {Array<string | undefined>} */ listOrders: [],
  /** @type {any[]} */ medications: [],
  /** @type {string[]} */ medSelects: [],
};

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: me } }) },
    from: (table) => ({
      select: (cols) => ({
        in: (_col, ids) => ({
          eq: async (col, value) => {
            if (table === 'medications') {
              state.medSelects.push(cols);
              return {
                data: state.medications.filter((m) => ids.includes(m.pet_id) && m[col] === value),
                error: null,
              };
            }
            return {
              data: ids.filter((id) => state.createdByMe.includes(id)).map((id) => ({ id })),
              error: null,
            };
          },
        }),
      }),
    }),
  },
}));
vi.mock('@/api/entities', () => ({
  entities: {
    PetSitterAccess: {
      filter: async () => {
        if (state.sitterLookupError) throw state.sitterLookupError;
        return state.accesses;
      },
    },
    PetSit: { get: async (id) => state.sits[id] },
    PetCoOwner: { filter: async () => state.coOwnerRows },
    Pet: {
      list: async (order) => {
        state.listOrders.push(order);
        if (state.petListError) throw state.petListError;
        return state.pets;
      },
    },
  },
}));
const reportClientError = vi.fn();
vi.mock('@/lib/errorMonitoring', () => ({ reportClientError: (...args) => reportClientError(...args) }));

const { getSitterOnlyPetIds, listOwnedPets, loadOwnedPets, getActiveMedicationCountsForPets } = await import('./petsClient');

beforeEach(() => {
  state.accesses = [{ pet_sit_id: 'sit-1' }, { pet_sit_id: 'sit-2' }];
  state.sitterLookupError = null;
  state.petListError = null;
  state.listOrders = [];
  state.medications = [];
  state.medSelects = [];
  reportClientError.mockClear();
});

// Spec 0076 (PA-28): a pet I own or co-own is never "sitter-only", even if
// I'm also listed as its sitter — otherwise Edit Pet would lock me out.
describe('getSitterOnlyPetIds', () => {
  it('returns only pets I sit for but neither own nor co-own', async () => {
    expect([...(await getSitterOnlyPetIds())]).toEqual(['pet-friend']);
  });

  it('returns nothing when I have no sitter invites', async () => {
    state.accesses = [];
    expect((await getSitterOnlyPetIds()).size).toBe(0);
  });
});

describe('listOwnedPets', () => {
  it('drops sitter-only pets and keeps owned and co-owned ones', async () => {
    const ids = (await listOwnedPets()).map((p) => p.id);
    expect(ids).toEqual(['pet-own', 'pet-coown', 'pet-other']);
  });
});

// Spec 0079 (PA-61): the helper Home and Ask Wysker's general chat use.
describe('loadOwnedPets', () => {
  // AC5: owned + also-sat pets are kept, sitter-only pets are dropped.
  it('keeps owned and co-owned pets, drops sitter-only ones, and counts them', async () => {
    const { pets, sitterOnlyCount } = await loadOwnedPets('-created_at', 'home');
    expect(pets.map((p) => p.id)).toEqual(['pet-own', 'pet-coown', 'pet-other']);
    expect(sitterOnlyCount).toBe(1);
    expect(state.listOrders).toEqual(['-created_at']);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('counts zero sitter-only pets when the person sits for nobody', async () => {
    state.accesses = [];
    const { pets, sitterOnlyCount } = await loadOwnedPets('-created_at', 'home');
    expect(pets).toHaveLength(4);
    expect(sitterOnlyCount).toBe(0);
  });

  // AC6: a failed sitter lookup falls back to every pet and is reported.
  it.each(['home', 'ask_wysker'])(
    'shows every pet and reports the error when the sitter lookup fails (%s)',
    async (feature) => {
      const err = new Error('network blip');
      state.sitterLookupError = err;
      const { pets, sitterOnlyCount } = await loadOwnedPets('-created_at', feature);
      expect(pets.map((p) => p.id)).toEqual(['pet-own', 'pet-coown', 'pet-friend', 'pet-other']);
      expect(sitterOnlyCount).toBe(0);
      expect(reportClientError).toHaveBeenCalledTimes(1);
      expect(reportClientError.mock.calls[0][0]).toBe(err);
      expect(reportClientError.mock.calls[0][1]).toMatchObject({ feature });
    },
  );

  it('passes a pet-list failure up unchanged, so Home still shows its load error', async () => {
    const err = new Error('pets down');
    state.petListError = err;
    await expect(loadOwnedPets('-created_at', 'home')).rejects.toBe(err);
    expect(reportClientError).not.toHaveBeenCalled();
  });
});

// QA edge cases for spec 0079 (PA-61).
describe('loadOwnedPets edge cases', () => {
  const saved = {};
  beforeEach(() => {
    Object.assign(saved, {
      pets: state.pets, sits: state.sits, createdByMe: state.createdByMe, coOwnerRows: state.coOwnerRows,
    });
  });
  afterEach(() => {
    Object.assign(state, saved);
  });

  // A sitter with no pets of their own (test4@'s situation): Home shows the
  // welcome screen, and Ask Wysker gets an empty list ("no pets on file yet").
  it('a person who only sits gets no pets and a count of every sat pet', async () => {
    state.createdByMe = [];
    state.coOwnerRows = [];
    state.sits = { 'sit-1': { pet_ids: ['pet-a', 'pet-b'] }, 'sit-2': { pet_ids: ['pet-c'] } };
    state.pets = ['pet-a', 'pet-b', 'pet-c'].map((id) => ({ id }));
    const { pets, sitterOnlyCount } = await loadOwnedPets('-created_at', 'ask_wysker');
    expect(pets).toEqual([]);
    expect(sitterOnlyCount).toBe(3);
  });

  // Pets owned by two different people, sat in one sit: both dropped.
  it('drops sat pets from more than one owner, keeping my own', async () => {
    state.sits = { 'sit-1': { pet_ids: ['friend1-pet'] }, 'sit-2': { pet_ids: ['friend2-pet', 'pet-own'] } };
    state.pets = ['pet-own', 'friend1-pet', 'friend2-pet'].map((id) => ({ id }));
    const { pets, sitterOnlyCount } = await loadOwnedPets('-created_at', 'home');
    expect(pets.map((p) => p.id)).toEqual(['pet-own']);
    expect(sitterOnlyCount).toBe(2);
  });

  // Deleted records: a sit row that's gone, or a sit still naming a pet that
  // was deleted (or that the database no longer lets me read, e.g. outside
  // the sit window), never inflates the count or breaks the list.
  it('ignores a deleted sit and a sat pet that is no longer in the pet list', async () => {
    state.sits = { 'sit-1': { pet_ids: ['pet-friend', 'pet-deleted'] } }; // sit-2 deleted
    const { pets, sitterOnlyCount } = await loadOwnedPets('-created_at', 'home');
    expect(pets.map((p) => p.id)).toEqual(['pet-own', 'pet-coown', 'pet-other']);
    expect(sitterOnlyCount).toBe(1);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('a brand-new account with no pets and no sits gets an empty list and zero', async () => {
    state.pets = [];
    state.accesses = [];
    expect(await loadOwnedPets('-created_at', 'home')).toEqual({ pets: [], sitterOnlyCount: 0 });
  });
});

// Spec 0087 (AC3, AC4, AC6): Home's per-pet medication count includes only
// current meds, judged on the viewer's today.
describe('getActiveMedicationCountsForPets', () => {
  const TODAY = '2026-11-27';

  it('counts only current meds: ended yesterday and switched off are left out, ending today counts', async () => {
    state.medications = [
      { pet_id: 'pet-own', active: true, end_date: null },
      { pet_id: 'pet-own', active: true, end_date: TODAY },
      { pet_id: 'pet-own', active: true, end_date: '2026-11-26' },
      { pet_id: 'pet-own', active: false, end_date: null },
      { pet_id: 'pet-other', active: true, end_date: '2026-11-26' },
      { pet_id: 'pet-coown', active: true, end_date: '2026-12-31' },
    ];
    const counts = await getActiveMedicationCountsForPets(['pet-own', 'pet-other', 'pet-coown'], TODAY);
    expect(counts).toEqual({ 'pet-own': 2, 'pet-coown': 1 });
    expect(state.medSelects).toEqual(['pet_id, active, end_date']);
  });

  it('uses the date it is given, not the device clock', async () => {
    state.medications = [{ pet_id: 'pet-own', active: true, end_date: TODAY }];
    expect(await getActiveMedicationCountsForPets(['pet-own'], TODAY)).toEqual({ 'pet-own': 1 });
    expect(await getActiveMedicationCountsForPets(['pet-own'], '2026-11-28')).toEqual({});
  });

  it('returns nothing for no pets without querying', async () => {
    expect(await getActiveMedicationCountsForPets([], TODAY)).toEqual({});
    expect(state.medSelects).toEqual([]);
  });
});

describe('getActiveMedicationCountsForPets: mixed rows (spec 0087 QA)', () => {
  const TODAY = '2026-11-27';

  it('several pets: a pet with only finished meds is absent; a malformed end date still counts', async () => {
    state.medications = [
      { pet_id: 'p1', active: true, end_date: '2026-11-26' },
      { pet_id: 'p1', active: true, end_date: '2025-01-01' },
      { pet_id: 'p2', active: true, end_date: '11/02/2026' },
      { pet_id: 'p2', active: true, end_date: null },
      { pet_id: 'p2', active: false, end_date: '2027-01-01' },
      { pet_id: 'p3', active: true, end_date: '2026-11-28' },
      { pet_id: 'not-asked', active: true, end_date: null },
    ];
    const counts = await getActiveMedicationCountsForPets(['p1', 'p2', 'p3'], TODAY);
    expect(counts).toEqual({ p2: 2, p3: 1 });
    expect(counts).not.toHaveProperty('p1');
    expect(counts).not.toHaveProperty('not-asked');
  });

  it('no todayStr (a caller that forgot it) does not crash and hides nothing', async () => {
    state.medications = [{ pet_id: 'p1', active: true, end_date: '2026-11-26' }];
    // @ts-expect-error deliberately missing argument
    expect(await getActiveMedicationCountsForPets(['p1'])).toEqual({ p1: 1 });
  });
});
