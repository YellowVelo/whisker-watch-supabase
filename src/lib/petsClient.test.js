import { describe, it, expect, vi, beforeEach } from 'vitest';

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
};

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: me } }) },
    from: () => ({
      select: () => ({
        in: (_col, ids) => ({
          eq: async () => ({
            data: ids.filter((id) => state.createdByMe.includes(id)).map((id) => ({ id })),
            error: null,
          }),
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

const { getSitterOnlyPetIds, listOwnedPets, loadOwnedPets } = await import('./petsClient');

beforeEach(() => {
  state.accesses = [{ pet_sit_id: 'sit-1' }, { pet_sit_id: 'sit-2' }];
  state.sitterLookupError = null;
  state.petListError = null;
  state.listOrders = [];
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
    const { pets, sitterOnlyCount } = await loadOwnedPets('-created_date', 'home');
    expect(pets.map((p) => p.id)).toEqual(['pet-own', 'pet-coown', 'pet-other']);
    expect(sitterOnlyCount).toBe(1);
    expect(state.listOrders).toEqual(['-created_date']);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('counts zero sitter-only pets when the person sits for nobody', async () => {
    state.accesses = [];
    const { pets, sitterOnlyCount } = await loadOwnedPets('-created_date', 'home');
    expect(pets).toHaveLength(4);
    expect(sitterOnlyCount).toBe(0);
  });

  // AC6: a failed sitter lookup falls back to every pet and is reported.
  it.each(['home', 'ask_wysker'])(
    'shows every pet and reports the error when the sitter lookup fails (%s)',
    async (feature) => {
      const err = new Error('network blip');
      state.sitterLookupError = err;
      const { pets, sitterOnlyCount } = await loadOwnedPets('-created_date', feature);
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
    await expect(loadOwnedPets('-created_date', 'home')).rejects.toBe(err);
    expect(reportClientError).not.toHaveBeenCalled();
  });
});
