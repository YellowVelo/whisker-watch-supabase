// Integration tests for spec 0085 (migration 0063): the database refuses a
// pet sit whose dates break pet_sits_dates_sane (both dates between
// 2000-01-01 and 2100-12-31, end not before start, end at most 30 days after
// start), on insert and on update, and still accepts ordinary sits.
// Run against wysker-watch-dev.
//
// One scratch owner is created and signed in once for the whole file
// (Supabase Auth's per-IP sign-in limit, see co_owner_access.test.ts), with
// one pet. Every write goes through the owner's own signed-in client, the
// same path the app uses; the service-role client is used only to set up,
// inspect and clean up (and once to show the rule binds it too).
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/pet_sit_dates.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

interface Dates {
  start_date: string;
  end_date: string;
}

// Each shape the rule must refuse, with fixed dates so the result never
// depends on today's date or time zone.
const BAD: Record<string, Dates> = {
  'start in year 2101': { start_date: '2101-01-01', end_date: '2101-01-01' },
  'end in year 2101': { start_date: '2100-12-31', end_date: '2101-01-01' },
  'start in year 1999': { start_date: '1999-12-31', end_date: '2000-01-01' },
  'end in year 1999': { start_date: '1999-12-01', end_date: '1999-12-31' },
  'end before start': { start_date: '2027-01-10', end_date: '2027-01-09' },
  '31-day span': { start_date: '2027-01-01', end_date: '2027-02-01' },
};

// Shapes the rule must accept, including both year limits.
const GOOD: Record<string, Dates> = {
  'same-day sit': { start_date: '2027-01-01', end_date: '2027-01-01' },
  '+30-day sit': { start_date: '2027-01-01', end_date: '2027-01-31' },
  'ordinary week-long sit': { start_date: '2027-03-01', end_date: '2027-03-07' },
  'first allowed day': { start_date: '2000-01-01', end_date: '2000-01-01' },
  'last allowed day': { start_date: '2100-12-31', end_date: '2100-12-31' },
};

const CHECK_VIOLATION = '23514';

function assertRefusedByRule(error: { code?: string; message?: string } | null, label: string) {
  assert(error, `${label}: must be refused`);
  assertEquals(error.code, CHECK_VIOLATION, `${label}: refused by a check constraint (got ${error.code}: ${error.message})`);
  assert(error.message?.includes('pet_sits_dates_sane'), `${label}: refused by pet_sits_dates_sane (got ${error.message})`);
}

Deno.test('pet sit dates rule (spec 0085, migration 0063)', async (t) => {
  const admin = adminClient();
  const owner: ScratchUser = await createScratchUser('sit-dates');
  let petId: string | null = null;
  try {
    const { data: pet, error: petError } = await owner.client
      .from('pets')
      .insert({ name: 'Scratch Sit Dates Pet', created_by: owner.userId })
      .select('id')
      .single();
    if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);
    petId = pet.id;
    const pid: string = pet.id;

    const insertSit = (dates: Dates) =>
      owner.client
        .from('pet_sits')
        .insert({ created_by: owner.userId, pet_ids: [pid], sitter_name: 'Scratch Sitter', ...dates })
        .select('id, start_date, end_date')
        .single();

    const sitCount = async () => {
      const { count, error } = await admin.from('pet_sits').select('id', { count: 'exact', head: true }).eq('created_by', owner.userId);
      if (error) throw new Error(`sit count failed: ${error.message}`);
      return count ?? 0;
    };

    for (const [label, dates] of Object.entries(BAD)) {
      await t.step(`insert refused: ${label}`, async () => {
        const before = await sitCount();
        const { error } = await insertSit(dates);
        assertRefusedByRule(error, label);
        assertEquals(await sitCount(), before, `${label}: nothing saved`);
      });
    }

    for (const [label, dates] of Object.entries(GOOD)) {
      await t.step(`insert accepted: ${label}`, async () => {
        const { data, error } = await insertSit(dates);
        assert(!error && data, `${label}: must be accepted (got ${error?.message})`);
        assertEquals({ start_date: data.start_date, end_date: data.end_date }, dates, `${label}: dates stored as sent`);
      });
    }

    await t.step('update of a valid sit to each bad shape is refused and leaves it unchanged', async () => {
      const valid = GOOD['ordinary week-long sit'];
      const { data: sit, error } = await insertSit(valid);
      if (error || !sit) throw new Error(`valid sit insert failed: ${error?.message}`);
      for (const [label, dates] of Object.entries(BAD)) {
        const { error: updateError } = await owner.client.from('pet_sits').update(dates).eq('id', sit.id).select('id');
        assertRefusedByRule(updateError, `update to ${label}`);
        const { data: stored } = await admin.from('pet_sits').select('start_date, end_date').eq('id', sit.id).single();
        assertEquals(stored, valid, `update to ${label}: sit unchanged`);
      }
    });

    await t.step('update of a valid sit to another valid range is accepted', async () => {
      const { data: sit, error } = await insertSit(GOOD['same-day sit']);
      if (error || !sit) throw new Error(`valid sit insert failed: ${error?.message}`);
      const next = GOOD['+30-day sit'];
      const { data, error: updateError } = await owner.client.from('pet_sits').update(next).eq('id', sit.id).select('start_date, end_date').single();
      assert(!updateError && data, `valid update must be accepted (got ${updateError?.message})`);
      assertEquals(data, next);
    });

    await t.step('the rule binds the service role too', async () => {
      const { error } = await admin
        .from('pet_sits')
        .insert({ created_by: owner.userId, pet_ids: [pid], ...BAD['31-day span'] })
        .select('id');
      assertRefusedByRule(error, 'service-role insert of a 31-day span');
    });
  } finally {
    await admin.from('pet_sits').delete().eq('created_by', owner.userId);
    if (petId) await admin.from('pets').delete().eq('id', petId);
    await deleteScratchUser(owner.userId);
  }
});
