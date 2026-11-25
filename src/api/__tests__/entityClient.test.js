import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spec 0081 FR18: the data helper keeps its shape but no longer renames
// fields (the old created_date -> created_at, cat_id -> pet_id table).
// Column names go to the database exactly as the caller wrote them.

const calls = [];

function chain() {
  const q = {
    select: (...a) => { calls.push(['select', ...a]); return q; },
    eq: (...a) => { calls.push(['eq', ...a]); return q; },
    order: (...a) => { calls.push(['order', ...a]); return q; },
    limit: (...a) => { calls.push(['limit', ...a]); return q; },
    insert: (...a) => { calls.push(['insert', ...a]); return q; },
    update: (...a) => { calls.push(['update', ...a]); return q; },
    single: () => Promise.resolve({ data: { id: 'row' }, error: null }),
    then: (resolve) => resolve({ data: [], error: null }),
  };
  return q;
}

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table) => { calls.push(['from', table]); return chain(); },
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  },
}));

const { createEntityClient } = await import('../entityClient');
const { entities } = await import('../entities');

beforeEach(() => { calls.length = 0; });

describe('entityClient (spec 0081 FR18)', () => {
  it('sorts by the column named: "-created_at" is newest first, "name" ascending', async () => {
    await createEntityClient('pets').list(['-created_at', 'name'], 5);
    expect(calls.filter((c) => c[0] === 'order')).toEqual([
      ['order', 'created_at', { ascending: false }],
      ['order', 'name', { ascending: true }],
    ]);
    expect(calls).toContainEqual(['limit', 5]);
  });

  it('passes filter, create and update field names through unchanged (no Base44-era renames)', async () => {
    const client = createEntityClient('pets');
    await client.filter({ cat_id: 'a', created_date: 'b' }, '-created_date');
    expect(calls).toContainEqual(['eq', 'cat_id', 'a']);
    expect(calls).toContainEqual(['eq', 'created_date', 'b']);
    expect(calls).toContainEqual(['order', 'created_date', { ascending: false }]);

    calls.length = 0;
    await client.create({ cat_id: 'a', name: 'Rex' });
    expect(calls).toContainEqual(['insert', { cat_id: 'a', name: 'Rex', created_by: 'user-1' }]);

    calls.length = 0;
    await client.update('id-1', { updated_date: 'x' });
    expect(calls).toContainEqual(['update', { updated_date: 'x' }]);
  });

  it('no longer offers the retired SymptomLog, FoodLog or WellnessScore entities', () => {
    for (const name of ['SymptomLog', 'FoodLog', 'WellnessScore']) {
      expect(entities).not.toHaveProperty(name);
    }
    expect(entities).toHaveProperty('Pet');
    expect(entities).toHaveProperty('Observation');
  });
});
