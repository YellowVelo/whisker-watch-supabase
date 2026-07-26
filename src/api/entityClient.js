import { supabase } from './supabaseClient';
import { isDemoAccount } from '@/lib/accountType';
import { toast } from '@/components/ui/use-toast';

// Thrown by the demo-account write guard below. A dedicated class (rather
// than a plain Error) lets any future caller recognize this specific case
// with `instanceof`, though today nothing needs to — the toast is already
// fired before this is thrown, so callers just need the promise to reject.
export class DemoAccountBlockedError extends Error {}

// account_type rarely changes mid-session, and writes can happen often —
// cache it per user instead of re-querying profiles on every single write.
// Mirrors the accountTypeCache pattern in src/lib/analytics.js.
const accountTypeCache = new Map(); // userId -> { accountType, fetchedAt }
const ACCOUNT_TYPE_CACHE_TTL_MS = 5 * 60 * 1000;

// Demo accounts (account_type = 'demo') can view everything but must never
// write — this is the single choke point (per Technical Standards, all data
// access goes through entityClient.js) that enforces that. Returns the
// caller's user id so create/bulkCreate/upsert can reuse it for created_by
// instead of fetching it twice.
async function assertNotDemoAccount() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return userId;

  let accountType;
  const cached = accountTypeCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < ACCOUNT_TYPE_CACHE_TTL_MS) {
    accountType = cached.accountType;
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', userId)
      .single();
    accountType = profile?.account_type ?? 'production';
    accountTypeCache.set(userId, { accountType, fetchedAt: Date.now() });
  }

  if (isDemoAccount({ account_type: accountType })) {
    toast({ variant: 'destructive', description: "This is a demo — changes aren't saved here." });
    throw new DemoAccountBlockedError('Demo accounts cannot write data');
  }

  return userId;
}

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
      const userId = await assertNotDemoAccount();
      const row = {
        ...toDbKeys(payload),
        created_by: userId,
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
      const userId = await assertNotDemoAccount();
      const rows = payloads.map((p) => ({
        ...toDbKeys(p),
        created_by: userId,
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
      const userId = await assertNotDemoAccount();
      const row = {
        ...toDbKeys(payload),
        created_by: userId,
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
      await assertNotDemoAccount();
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
      await assertNotDemoAccount();
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
  };
}
