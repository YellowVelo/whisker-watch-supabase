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
    PetSitterAccess: { filter: async () => state.accesses },
    PetSit: { get: async (id) => state.sits[id] },
    PetCoOwner: { filter: async () => state.coOwnerRows },
    Pet: { list: async () => state.pets },
  },
}));

const { getSitterOnlyPetIds, listOwnedPets } = await import('./petsClient');

beforeEach(() => {
  state.accesses = [{ pet_sit_id: 'sit-1' }, { pet_sit_id: 'sit-2' }];
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
