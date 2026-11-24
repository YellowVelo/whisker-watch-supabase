// Integration tests for spec 0080 (FR9, FR13, AC7 and the database part of
// AC6): the shared rate limiter (migration 0060). Run against
// wysker-watch-dev as the service role (the only role allowed to call these
// functions; who else is refused is covered by function_permissions.test.ts).
//
// Every key this file uses starts with a per-run prefix, and every row it
// creates is deleted at the end, so it can't disturb real limits on dev.
// No users are created or signed in.
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/rate_limits.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { adminClient } from '../functions/_shared/testHelpers.ts';

const PREFIX = `spec0080-test-${crypto.randomUUID()}`;

function key(label: string): string {
  return `${PREFIX}:${label}`;
}

async function hitCount(k: string): Promise<number> {
  const { count, error } = await adminClient()
    .from('rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .eq('rate_key', k);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

async function insertHit(k: string, minutesAgo: number): Promise<string> {
  const { data, error } = await adminClient()
    .from('rate_limit_hits')
    .insert({ rate_key: k, created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insert failed: ${error?.message}`);
  return data.id;
}

async function rowExists(id: string): Promise<boolean> {
  const { data, error } = await adminClient().from('rate_limit_hits').select('id').eq('id', id);
  if (error) throw new Error(`select failed: ${error.message}`);
  return (data?.length ?? 0) === 1;
}

async function windowed(keys: string[], limits: number[], windows: number[]) {
  return await adminClient().rpc('check_and_record_rate_limits_windowed', {
    p_keys: keys,
    p_limits: limits,
    p_windows: windows,
  });
}

Deno.test({
  name: 'rate-limit windows (spec 0080)',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    try {
      await t.step('AC7: a 10-minute check for one key leaves another key\'s 30-minute-old history alone', async () => {
        const oldRow = await insertHit(key('hourly-A'), 30);
        const { data, error } = await adminClient().rpc('check_and_record_rate_limit', {
          p_key: key('ten-min-B'),
          p_limit: 20,
          p_window_seconds: 600,
        });
        assertEquals(error, null);
        assertEquals(data, true);
        assert(await rowExists(oldRow), 'key A\'s 30-minute-old row must survive a 600s check for key B');
      });

      await t.step('AC7: the multi-key function leaves other keys\' history alone too', async () => {
        const oldRow = await insertHit(key('hourly-C'), 30);
        const { data, error } = await adminClient().rpc('check_and_record_rate_limits', {
          p_keys: [key('ten-min-D')],
          p_limits: [20],
          p_window_seconds: 600,
        });
        assertEquals(error, null);
        assertEquals(data, true);
        assert(await rowExists(oldRow), 'key C\'s 30-minute-old row must survive a 600s check for key D');
      });

      await t.step('windowed: allowed returns 0 and records one hit for every key', async () => {
        const a = key('win-allow-A');
        const b = key('win-allow-B');
        const { data, error } = await windowed([a, b], [5, 5], [600, 86400]);
        assertEquals(error, null);
        assertEquals(data, 0);
        assertEquals(await hitCount(a), 1);
        assertEquals(await hitCount(b), 1);
      });

      await t.step('windowed: each key is counted over its own window', async () => {
        const short = key('win-short');
        const long = key('win-long');
        // 30 minutes old: outside a 10-minute window, inside a 24-hour one.
        await insertHit(short, 30);
        await insertHit(long, 30);

        // Short key (limit 1 over 600s) ignores its 30-minute-old hit; long key
        // (limit 2 over 86400s) counts its hit and is still under.
        const first = await windowed([short, long], [1, 2], [600, 86400]);
        assertEquals(first.error, null);
        assertEquals(first.data, 0, 'both keys under their own windows');
        assertEquals(await hitCount(short), 2);
        assertEquals(await hitCount(long), 2);

        // Long key now has 2 hits inside 24h (limit 2), short key has 1 inside
        // 600s (limit 5): only the 24-hour key is over, at index 2.
        const second = await windowed([short, long], [5, 2], [600, 86400]);
        assertEquals(second.error, null);
        assertEquals(second.data, 2, 'the 24-hour key is the one over its limit');

        // Same hits, but the 30-minute-old one now falls inside the short
        // key's window when that window is widened to 1 hour: 2 hits, limit 2.
        const third = await windowed([short, long], [2, 5], [3600, 86400]);
        assertEquals(third.error, null);
        assertEquals(third.data, 1, 'a 1-hour window counts the 30-minute-old hit');
        assertEquals(await hitCount(short), 2, 'rejected calls record nothing');
        assertEquals(await hitCount(long), 2, 'rejected calls record nothing');
      });

      await t.step('windowed: rejection records nothing on any key and returns the first key over its limit', async () => {
        const under = key('win-reject-under');
        const over1 = key('win-reject-over1');
        const over2 = key('win-reject-over2');
        await insertHit(over1, 1);
        await insertHit(over2, 1);

        const { data, error } = await windowed([under, over1, over2], [5, 1, 1], [600, 600, 600]);
        assertEquals(error, null);
        assertEquals(data, 2, '1-based index of the first key over its limit');
        assertEquals(await hitCount(under), 0, 'the key that was under its limit gets no hit recorded');
        assertEquals(await hitCount(over1), 1, 'no extra hit on the rejected key');
        assertEquals(await hitCount(over2), 1, 'no extra hit on later keys');
      });

      await t.step('windowed: mismatched or empty arrays raise', async () => {
        const k = key('win-mismatch');
        const cases: Array<[string[], number[], number[]]> = [
          [[k], [1, 2], [600]],
          [[k], [1], [600, 86400]],
          [[k, k], [1], [600]],
          [[], [], []],
        ];
        for (const [keys, limits, windows] of cases) {
          const { data, error } = await windowed(keys, limits, windows);
          assert(error, `expected an error for keys=${keys.length} limits=${limits.length} windows=${windows.length}, got ${data}`);
          assertEquals(error.code, '22023');
        }
        assertEquals(await hitCount(k), 0, 'a rejected call records nothing');
      });

      await t.step('windowed: a null, zero, negative or over-2-day window, or a null or negative limit, raises', async () => {
        const k = key('win-bad-args');
        const other = key('win-bad-args-other');
        const cases: Array<[string, Array<number | null>, Array<number | null>]> = [
          ['null window', [1, 1], [600, null]],
          ['zero window', [1, 1], [600, 0]],
          ['negative window', [1, 1], [600, -1]],
          ['window over 172800', [1, 1], [600, 172801]],
          ['null limit', [1, null], [600, 600]],
          ['negative limit', [1, -1], [600, 600]],
        ];
        for (const [label, limits, windows] of cases) {
          const { data, error } = await adminClient().rpc('check_and_record_rate_limits_windowed', {
            p_keys: [k, other],
            p_limits: limits,
            p_windows: windows,
          });
          assert(error, `expected an error for ${label}, got ${data}`);
          assertEquals(error.code, '22023', label);
        }
        assertEquals(await hitCount(k), 0, 'a rejected call records nothing');
        assertEquals(await hitCount(other), 0, 'a rejected call records nothing');

        // The ceiling itself is allowed.
        const ok = await windowed([k], [1], [172800]);
        assertEquals(ok.error, null);
        assertEquals(ok.data, 0, 'a 172800s window is accepted');
      });

      await t.step('FR13: a 23-hour-old hit survives a 10-minute check and counts in a 24-hour window', async () => {
        const daily = key('daily-E');
        const oldRow = await insertHit(daily, 23 * 60);

        const { data, error } = await adminClient().rpc('check_and_record_rate_limit', {
          p_key: key('ten-min-F'),
          p_limit: 20,
          p_window_seconds: 600,
        });
        assertEquals(error, null);
        assertEquals(data, true);
        assert(await rowExists(oldRow), 'key E\'s 23-hour-old row must survive a 600s check for key F');

        // Limit 1 over 86400s: the 23-hour-old hit alone puts the key at its limit.
        const res = await windowed([daily], [1], [86400]);
        assertEquals(res.error, null);
        assertEquals(res.data, 1, 'the 23-hour-old hit counts against a 24-hour window');
        assertEquals(await hitCount(daily), 1, 'rejected call records nothing');
      });

      await t.step('cleanup: any call deletes rows older than 2 days', async () => {
        const stale = await insertHit(key('stale-G'), 49 * 60);
        assert(await rowExists(stale), 'setup: the 49-hour-old row exists before the call');
        const { data, error } = await windowed([key('cleanup-H')], [20], [600]);
        assertEquals(error, null);
        assertEquals(data, 0);
        assert(!(await rowExists(stale)), 'a 49-hour-old row must be deleted by the call');
      });
    } finally {
      const { error } = await adminClient().from('rate_limit_hits').delete().like('rate_key', `${PREFIX}%`);
      if (error) throw new Error(`cleanup failed: ${error.message}`);
    }
  },
});
