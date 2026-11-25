// Integration tests for spec 0081 (punch list PA-71, PA-50, PA-51; migration
// 0061): who may see and change a pet's weights, and that the Base44-era
// tables are gone. Run against wysker-watch-dev, after 0061.
//
// Weight lives in `observations` rows of type `weight` with numeric_value
// set. Two kinds: a check-in weight (daily_check_in_id set) and a
// standalone weight (daily_check_in_id null, dated by observed_at at noon
// UTC; Amendment 1). Both are covered by observations' existing rules
// (0014 owner/co-owner read and write, 0045/0057 sitter read during an open
// sit), which is what AC11 pins.
//
// Same shape as sitter_access.test.ts and co_owner_access.test.ts: one set
// of scratch users (owner, co-owner, sitter, stranger) is created and signed
// in once for the whole file (Supabase Auth limits sign-ins per IP; spec
// 0072 hit it), plus one never-signed-in client for "logged out". One pet,
// one household and one open sit are built once; each step seeds its own
// weight rows. "Refused" checks act through the user's own signed-in client,
// the way someone going around the app would; the service-role admin client
// only reads back the result and cleans up.
//
// Run (dev): deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/weight_home.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  requireEnv,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

// Today's UTC calendar date shifted by whole days, as YYYY-MM-DD. The owner's
// profile time zone is set to UTC below, so this is also the owner's calendar
// (the sitter window is counted on it, 0057).
function utcDay(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// The app's dating rule for a standalone weight (src/lib/weightClient.js,
// weightDate.toObservedAt): noon UTC of the chosen calendar date.
const noonUtc = (date: string) => `${date}T12:00:00.000Z`;

interface Household {
  owner: ScratchUser;
  coOwner: ScratchUser;
  sitter: ScratchUser;
  stranger: ScratchUser;
  loggedOut: SupabaseClient;
  petId: string;
  sitId: string;
  weightTypeId: string;
}

async function weightTypeId(): Promise<string> {
  const { data, error } = await adminClient().from('observation_types').select('id').eq('code', 'weight').single();
  if (error || !data) throw new Error(`weight observation type missing: ${error?.message}`);
  return data.id;
}

async function buildHousehold(users: Omit<Household, 'loggedOut' | 'petId' | 'sitId' | 'weightTypeId'>): Promise<Household> {
  const { owner, coOwner, sitter } = users;

  const { error: tzError } = await owner.client.from('profiles').update({ timezone: 'UTC' }).eq('id', owner.userId);
  if (tzError) throw new Error(`timezone update failed: ${tzError.message}`);

  const { data: pet, error: petError } = await owner.client
    .from('pets')
    .insert({ name: 'Scratch Weight Pet', created_by: owner.userId })
    .select('id')
    .single();
  if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);

  // Co-owner: email-only invite, claimed on sign-in (0056's only path).
  const { error: coInviteError } = await owner.client
    .from('pet_co_owners')
    .insert({ pet_id: pet.id, owner_id: owner.userId, created_by: owner.userId, co_owner_email: coOwner.email });
  if (coInviteError) throw new Error(`co-owner invite failed: ${coInviteError.message}`);
  const { error: coClaimError } = await coOwner.client.rpc('claim_pending_co_owner_invites');
  if (coClaimError) throw new Error(`co-owner claim failed: ${coClaimError.message}`);

  // Sitter: a sit covering today, email-only invite, claimed on sign-in (0057).
  const { data: sit, error: sitError } = await owner.client
    .from('pet_sits')
    .insert({ created_by: owner.userId, pet_ids: [pet.id], start_date: utcDay(0), end_date: utcDay(0), sitter_name: 'Scratch Sitter' })
    .select('id')
    .single();
  if (sitError || !sit) throw new Error(`sit insert failed: ${sitError?.message}`);
  const { error: sitInviteError } = await owner.client.from('pet_sitter_access').insert({
    pet_sit_id: sit.id,
    owner_id: owner.userId,
    created_by: owner.userId,
    sitter_email: sitter.email,
  });
  if (sitInviteError) throw new Error(`sitter invite failed: ${sitInviteError.message}`);
  const { error: sitClaimError } = await sitter.client.rpc('claim_pending_sitter_invites');
  if (sitClaimError) throw new Error(`sitter claim failed: ${sitClaimError.message}`);

  return {
    ...users,
    loggedOut: createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY')),
    petId: pet.id,
    sitId: sit.id,
    weightTypeId: await weightTypeId(),
  };
}

// The two kinds of weight row, written as the given user through RLS.
// `dayOffset` keeps each step's rows on their own day.
async function addStandaloneWeight(h: Household, user: ScratchUser, lbs: number, dayOffset: number) {
  return await user.client
    .from('observations')
    .insert({
      pet_id: h.petId,
      created_by: user.userId,
      observation_type_id: h.weightTypeId,
      daily_check_in_id: null,
      numeric_value: lbs,
      observed_at: noonUtc(utcDay(dayOffset)),
    })
    .select('id')
    .single();
}

async function addCheckInWeight(h: Household, user: ScratchUser, lbs: number, dayOffset: number) {
  const { data: checkIn, error: ciError } = await user.client
    .from('daily_check_ins')
    .insert({ pet_id: h.petId, created_by: user.userId, check_in_date: utcDay(dayOffset), status: 'great' })
    .select('id')
    .single();
  if (ciError || !checkIn) throw new Error(`check-in insert failed: ${ciError?.message}`);
  return await user.client
    .from('observations')
    .insert({
      pet_id: h.petId,
      created_by: user.userId,
      observation_type_id: h.weightTypeId,
      daily_check_in_id: checkIn.id,
      numeric_value: lbs,
    })
    .select('id')
    .single();
}

// Seeds one standalone and one check-in weight as the owner and returns
// their ids. Seeding through the owner's own client also checks that the
// owner can add both kinds.
async function seedOwnerWeights(h: Household, dayOffset: number) {
  const standalone = await addStandaloneWeight(h, h.owner, 11.2, dayOffset);
  if (standalone.error || !standalone.data) throw new Error(`owner standalone weight failed: ${standalone.error?.message}`);
  const fromCheckIn = await addCheckInWeight(h, h.owner, 11.4, dayOffset - 1);
  if (fromCheckIn.error || !fromCheckIn.data) throw new Error(`owner check-in weight failed: ${fromCheckIn.error?.message}`);
  return { standaloneId: standalone.data.id as string, checkInWeightId: fromCheckIn.data.id as string };
}

// What the database really holds for a row (null if gone), read as admin.
async function storedLbs(id: string): Promise<number | null> {
  const { data, error } = await adminClient().from('observations').select('numeric_value').eq('id', id).maybeSingle();
  if (error) throw new Error(`reading observation ${id} failed: ${error.message}`);
  return data ? Number(data.numeric_value) : null;
}

async function readableIds(client: SupabaseClient, ids: string[]): Promise<string[]> {
  const { data } = await client.from('observations').select('id').in('id', ids);
  return (data ?? []).map((r) => r.id as string).sort();
}

// Can this client change or remove a row? An update or delete RLS filters out
// returns no rows rather than an error, so the stored value is checked too.
async function tryUpdate(client: SupabaseClient, id: string, lbs: number) {
  const { data } = await client.from('observations').update({ numeric_value: lbs }).eq('id', id).select('id');
  return data?.length ?? 0;
}

async function tryDelete(client: SupabaseClient, id: string) {
  const { data } = await client.from('observations').delete().eq('id', id).select('id');
  return data?.length ?? 0;
}

// PostgREST reports a table it doesn't know as PGRST205 (42P01 straight from
// Postgres). A plain GET, not { head: true }: on dev (2026-11-25) a HEAD
// request for a dropped table came back 204 with no error, which would make
// a missing table look present.
async function tableExists(table: string): Promise<boolean> {
  const { error } = await adminClient().from(table).select('id').limit(1);
  if (!error) return true;
  if (error.code === 'PGRST205' || error.code === '42P01') return false;
  throw new Error(`checking ${table} failed: ${error.message}`);
}

Deno.test('weight home access and Base44 tables (spec 0081)', async (t) => {
  const [owner, coOwner, sitter, stranger] = await Promise.all([
    createScratchUser('wt-owner'),
    createScratchUser('wt-coowner'),
    createScratchUser('wt-sitter'),
    createScratchUser('wt-stranger'),
  ]);
  let h: Household | null = null;
  try {
    h = await buildHousehold({ owner, coOwner, sitter, stranger });
    const hh = h;

    await t.step('sitter during an open sit can read both kinds of weight (AC11)', async () => {
      const { standaloneId, checkInWeightId } = await seedOwnerWeights(hh, -2);
      assertEquals(
        await readableIds(hh.sitter.client, [standaloneId, checkInWeightId]),
        [standaloneId, checkInWeightId].sort(),
        'sitter reads the standalone weight and the check-in weight',
      );
      const { data: standaloneRow } = await hh.sitter.client
        .from('observations')
        .select('numeric_value, daily_check_in_id')
        .eq('id', standaloneId)
        .single();
      assertEquals(standaloneRow?.daily_check_in_id, null, 'the standalone weight has no check-in');
      assertEquals(Number(standaloneRow?.numeric_value), 11.2);
    });

    await t.step('sitter cannot add, change or delete a weight (AC11)', async () => {
      const { standaloneId, checkInWeightId } = await seedOwnerWeights(hh, -5);

      const added = await addStandaloneWeight(hh, hh.sitter, 12.0, -8);
      assert(added.error, 'sitter standalone weight insert must be refused');
      const { data: sitterRows } = await adminClient()
        .from('observations')
        .select('id')
        .eq('pet_id', hh.petId)
        .eq('observed_at', noonUtc(utcDay(-8)));
      assertEquals(sitterRows?.length ?? 0, 0, 'nothing was saved for the sitter');

      for (const id of [standaloneId, checkInWeightId]) {
        assertEquals(await tryUpdate(hh.sitter.client, id, 99.9), 0, 'sitter update changes no rows');
        assertEquals(await tryDelete(hh.sitter.client, id), 0, 'sitter delete removes no rows');
      }
      assertEquals(await storedLbs(standaloneId), 11.2, 'standalone weight unchanged after sitter tries');
      assertEquals(await storedLbs(checkInWeightId), 11.4, 'check-in weight unchanged after sitter tries');
    });

    await t.step('stranger cannot read, add, change or delete a weight (AC11)', async () => {
      const { standaloneId, checkInWeightId } = await seedOwnerWeights(hh, -11);
      assertEquals(await readableIds(hh.stranger.client, [standaloneId, checkInWeightId]), [], 'stranger reads nothing');
      const added = await addStandaloneWeight(hh, hh.stranger, 12.0, -14);
      assert(added.error, 'stranger weight insert must be refused');
      for (const id of [standaloneId, checkInWeightId]) {
        assertEquals(await tryUpdate(hh.stranger.client, id, 99.9), 0, 'stranger update changes no rows');
        assertEquals(await tryDelete(hh.stranger.client, id), 0, 'stranger delete removes no rows');
      }
      assertEquals(await storedLbs(standaloneId), 11.2);
      assertEquals(await storedLbs(checkInWeightId), 11.4);
    });

    await t.step('logged-out visitor cannot read, add, change or delete a weight (AC11)', async () => {
      const { standaloneId, checkInWeightId } = await seedOwnerWeights(hh, -17);
      assertEquals(await readableIds(hh.loggedOut, [standaloneId, checkInWeightId]), [], 'logged-out client reads nothing');
      const { error } = await hh.loggedOut.from('observations').insert({
        pet_id: hh.petId,
        created_by: hh.owner.userId,
        observation_type_id: hh.weightTypeId,
        numeric_value: 12.0,
        observed_at: noonUtc(utcDay(-20)),
      });
      assert(error, 'logged-out weight insert must be refused');
      for (const id of [standaloneId, checkInWeightId]) {
        assertEquals(await tryUpdate(hh.loggedOut, id, 99.9), 0, 'logged-out update changes no rows');
        assertEquals(await tryDelete(hh.loggedOut, id), 0, 'logged-out delete removes no rows');
      }
      assertEquals(await storedLbs(standaloneId), 11.2);
      assertEquals(await storedLbs(checkInWeightId), 11.4);
    });

    await t.step('co-owner can do everything the owner can (AC11)', async () => {
      // Owner's rows: the co-owner reads, edits and deletes them.
      const { standaloneId, checkInWeightId } = await seedOwnerWeights(hh, -23);
      assertEquals(
        await readableIds(hh.coOwner.client, [standaloneId, checkInWeightId]),
        [standaloneId, checkInWeightId].sort(),
        "co-owner reads the owner's weights",
      );
      assertEquals(await tryUpdate(hh.coOwner.client, standaloneId, 11.0), 1, "co-owner edits the owner's standalone weight");
      assertEquals(await tryUpdate(hh.coOwner.client, checkInWeightId, 11.1), 1, "co-owner edits the owner's check-in weight");
      assertEquals(await storedLbs(standaloneId), 11.0);
      assertEquals(await storedLbs(checkInWeightId), 11.1);
      assertEquals(await tryDelete(hh.coOwner.client, standaloneId), 1, "co-owner deletes the owner's standalone weight");
      assertEquals(await tryDelete(hh.coOwner.client, checkInWeightId), 1, "co-owner deletes the owner's check-in weight");
      assertEquals(await storedLbs(standaloneId), null);
      assertEquals(await storedLbs(checkInWeightId), null);

      // Co-owner's own rows, both kinds: the owner sees and can remove them.
      const standalone = await addStandaloneWeight(hh, hh.coOwner, 10.8, -26);
      assert(!standalone.error && standalone.data, `co-owner adds a standalone weight: ${standalone.error?.message}`);
      const fromCheckIn = await addCheckInWeight(hh, hh.coOwner, 10.9, -27);
      assert(!fromCheckIn.error && fromCheckIn.data, `co-owner adds a check-in weight: ${fromCheckIn.error?.message}`);
      const coIds = [standalone.data.id as string, fromCheckIn.data.id as string];
      assertEquals(await readableIds(hh.owner.client, coIds), [...coIds].sort(), "owner reads the co-owner's weights");
      assertEquals(await tryUpdate(hh.owner.client, coIds[0], 10.7), 1, "owner edits the co-owner's weight");
      assertEquals(await tryDelete(hh.owner.client, coIds[0]), 1, "owner deletes the co-owner's weight");
      assertEquals(await tryDelete(hh.coOwner.client, coIds[1]), 1, 'co-owner deletes their own check-in weight');
    });

    await t.step('sitter loses read access once the sit window closes (AC11)', async () => {
      const { standaloneId, checkInWeightId } = await seedOwnerWeights(hh, -29);
      // Move the sit well into the past: the window (day before start to day
      // after end, owner's calendar) no longer covers today.
      const { data: moved } = await hh.owner.client
        .from('pet_sits')
        .update({ start_date: utcDay(-40), end_date: utcDay(-39) })
        .eq('id', hh.sitId)
        .select('id');
      assertEquals(moved?.length, 1, 'owner can move their own sit');
      assertEquals(await readableIds(hh.sitter.client, [standaloneId, checkInWeightId]), [], 'sitter reads nothing after the window');
    });

    await t.step('Base44-era tables are gone after 0061 (AC9)', async () => {
      for (const table of ['symptom_logs', 'wellness_scores', 'food_logs']) {
        assertEquals(await tableExists(table), false, `${table} must no longer exist`);
      }
    });

    await t.step('uploads bucket accepts spreadsheets and keeps every 0054 type (FR27)', async () => {
      const { data, error } = await adminClient().storage.getBucket('uploads');
      if (error || !data) throw new Error(`reading the uploads bucket failed: ${error?.message}`);
      const allowed = [...(data.allowed_mime_types ?? [])].sort();
      assertEquals(allowed, [
        'application/pdf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/csv',
      ]);
      assertEquals(data.public, false, 'the bucket stays private (0055)');
      assertEquals(data.file_size_limit, 10485760, 'the 10 MB limit is unchanged');
    });
  } finally {
    const admin = adminClient();
    if (h) {
      await admin.from('pet_sits').delete().eq('id', h.sitId);
      await admin.from('pets').delete().eq('id', h.petId);
    }
    await Promise.all([owner, coOwner, sitter, stranger].map((u) => deleteScratchUser(u.userId)));
  }
});
