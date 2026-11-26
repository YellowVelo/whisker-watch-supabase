import { supabase } from './supabaseClient';

/**
 * The app's per-table data helper. Each table gets the same methods:
 *   .list(sort?, limit?)
 *   .get(id)
 *   .filter(matchObj, sort?, limit?)
 *   .create(data)
 *   .update(id, data)
 *   .delete(id)
 *   .bulkCreate(arrayOfData)
 *   .upsert(data, conflictColumns)
 *
 * `sort` is a column name, or an array of them: "-column" sorts
 * descending, "column" ascending. Field names are the table's own column
 * names, passed through unchanged. create/bulkCreate/upsert set
 * `created_by` to the signed-in user's id; RLS decides server-side what
 * the caller may actually read or write, whatever the client sends.
 */
function applySort(query, sort) {
  if (!sort) return query;
  const sorts = Array.isArray(sort) ? sort : [sort];
  for (const s of sorts) {
    const descending = s.startsWith('-');
    const column = descending ? s.slice(1) : s;
    query = query.order(column, { ascending: !descending });
  }
  return query;
}

export function createEntityClient(tableName) {
  return {
    async list(sort, limit) {
      let query = supabase.from(tableName).select('*');
      query = applySort(query, sort);
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async get(id) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    async filter(match = {}, sort, limit) {
      let query = supabase.from(tableName).select('*');
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value);
      }
      query = applySort(query, sort);
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async create(payload) {
      const { data: userData } = await supabase.auth.getUser();
      const row = {
        ...payload,
        created_by: userData?.user?.id,
      };
      const { data, error } = await supabase
        .from(tableName)
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async bulkCreate(payloads) {
      const { data: userData } = await supabase.auth.getUser();
      const rows = payloads.map((p) => ({
        ...p,
        created_by: userData?.user?.id,
      }));
      const { data, error } = await supabase
        .from(tableName)
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },

    // Insert-or-update in a single round trip against a unique constraint
    // (e.g. `unique(pet_id, check_in_date)`), instead of the caller doing
    // its own get-then-create-or-update — the latter is a check-then-act
    // race: two near-simultaneous calls (a fast double-tap, two tabs)
    // can both see "no existing row" and both insert, and the second
    // insert fails on the unique constraint instead of merging cleanly.
    async upsert(payload, conflictColumns) {
      const { data: userData } = await supabase.auth.getUser();
      const row = {
        ...payload,
        created_by: userData?.user?.id,
      };
      const { data, error } = await supabase
        .from(tableName)
        .upsert(row, { onConflict: conflictColumns })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from(tableName)
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
  };
}
