import { supabase } from './supabaseClient';

/**
 * Mimics the Base44 SDK's per-entity interface:
 *   .list(sort?, limit?)
 *   .get(id)
 *   .filter(matchObj, sort?, limit?)
 *   .create(data)
 *   .update(id, data)
 *   .delete(id)
 *   .bulkCreate(arrayOfData)
 *
 * `sort` strings use Base44's convention: "-field" = descending,
 * "field" = ascending. created_by is set automatically on create
 * from the current authenticated user, mirroring Base44's
 * `created_by: {{user.email}}` behavior (Supabase RLS uses the
 * user's id rather than email, enforced server-side regardless of
 * what the client sends).
 *
 * This intentionally keeps the exact same call shape used throughout
 * the app (base44.entities.X.method(...)) so existing components
 * don't need to change — only the import does.
 *
 * COLUMN TRANSLATION: kept as a safety net during the Cat -> Pet
 * rename. The app now uses pet_id/pet_ids natively, but this alias
 * map stays as a harmless fallback in case any old cat_id reference
 * was missed. Safe to delete once confirmed unnecessary.
 */
const FIELD_ALIASES = {
  cat_id: 'pet_id',
  cat_ids: 'pet_ids',
  catId: 'pet_id',
  catIds: 'pet_ids',
  created_date: 'created_at', // Base44 used created_date; our schema uses created_at
  updated_date: 'updated_at',
};

function toDbKeys(obj) {
  if (!obj) return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const dbKey = FIELD_ALIASES[key] || key;
    out[dbKey] = value;
  }
  return out;
}

function applySort(query, sort) {
  if (!sort) return query;
  const sorts = Array.isArray(sort) ? sort : [sort];
  for (const s of sorts) {
    const descending = s.startsWith('-');
    const rawColumn = descending ? s.slice(1) : s;
    const column = FIELD_ALIASES[rawColumn] || rawColumn;
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
      const dbMatch = toDbKeys(match);
      for (const [key, value] of Object.entries(dbMatch)) {
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
        ...toDbKeys(payload),
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
        ...toDbKeys(p),
        created_by: userData?.user?.id,
      }));
      const { data, error } = await supabase
        .from(tableName)
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from(tableName)
        .update(toDbKeys(payload))
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
