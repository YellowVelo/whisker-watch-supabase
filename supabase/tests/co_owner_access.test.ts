// Integration tests for spec 0072 (punch list PA-02): who may add, see and
// remove a pet's co-owners (migration 0056). Run against wysker-watch-dev.
// Also spec 0083 (PA-25, PA-24; migration 0062): "entered by" on the record
// tables is the inserter and never changes, nobody deletes a pet directly,
// and pets/pet_sits created_by can't be changed by signed-in users.
//
// One set of three throwaway scratch users (primary owner, co-owner,
// stranger — see _shared/testHelpers.ts) is created and signed in once, and
// each check runs as its own step on a brand-new pet, so checks still don't
// depend on each other or on test1@/test2@. Creating users per check hit
// Supabase Auth's sign-in rate limit in CI (27 sign-ins from this file alone,
// on top of the other Deno files in the same step).
// Each "refused" check acts through the user's own signed-in client, the
// same way someone going around the app would; the service-role admin
// client is used only to build the household and to inspect the result.
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/co_owner_access.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

interface Users {
  owner: ScratchUser;
  coOwner: ScratchUser;
  stranger: ScratchUser;
}

interface Household extends Users {
  petId: string;
  coOwnerRowId: string;
}

// A fresh pet for one check: the owner invites the co-owner by email only,
// then the co-owner claims it by signing in (claim_pending_co_owner_invites,
// migration 0016) — the legitimate path.
async function buildHousehold(u: Users): Promise<Household> {
  const { data: pet, error: petError } = await u.owner.client
    .from('pets')
    .insert({ name: 'Scratch Co-Owner Pet', created_by: u.owner.userId })
    .select('id')
    .single();
  if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);

  const { data: row, error: inviteError } = await u.owner.client
    .from('pet_co_owners')
    .insert({ pet_id: pet.id, owner_id: u.owner.userId, created_by: u.owner.userId, co_owner_email: u.coOwner.email })
    .select('id')
    .single();
  if (inviteError || !row) throw new Error(`owner invite failed: ${inviteError?.message}`);
  const { error: claimError } = await u.coOwner.client.rpc('claim_pending_co_owner_invites');
  if (claimError) throw new Error(`co-owner claim failed: ${claimError.message}`);

  return { ...u, petId: pet.id, coOwnerRowId: row.id };
}

// Each step gets its own pet, removed afterward (its co-owner rows cascade).
async function withHousehold(u: Users, fn: (h: Household) => Promise<void>) {
  let h: Household | null = null;
  try {
    h = await buildHousehold(u);
    await fn(h);
  } finally {
    if (h) await adminClient().from('pets').delete().eq('id', h.petId);
  }
}

// Can this user change the pet? An update that RLS filters out returns no
// rows rather than an error, so count what came back.
async function canEditPet(user: ScratchUser, petId: string): Promise<boolean> {
  const { data } = await user.client.from('pets').update({ notes: `edit by ${user.email}` }).eq('id', petId).select('id');
  return (data?.length ?? 0) > 0;
}

async function rowsForPet(petId: string) {
  const { data } = await adminClient().from('pet_co_owners').select('id, co_owner_email, co_owner_user_id').eq('pet_id', petId);
  return data ?? [];
}

// ── Spec 0083 helpers (migration 0062) ─────────────────────────────────────

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

// Spec 0081 may have dropped some of these, so a missing table is skipped,
// the same way 0062 skips it (to_regclass). PostgREST reports a table it
// doesn't know as PGRST205 (or 42P01 straight from Postgres).
// This must be a real GET: a HEAD request has no body to carry the error,
// so it comes back looking like success even for a dropped table.
async function tableExists(table: string): Promise<boolean> {
  const { error, status } = await adminClient().from(table).select('id').limit(1);
  if (!error) return true;
  if (error.code === 'PGRST205' || error.code === '42P01' || status === 404) return false;
  throw new Error(`checking ${table} failed: ${error.message}`);
}

async function createSit(h: Household): Promise<string> {
  const { data, error } = await adminClient()
    .from('pet_sits')
    .insert({ created_by: h.owner.userId, pet_ids: [h.petId], start_date: isoDay(0), end_date: isoDay(0) })
    .select('id')
    .single();
  if (error || !data) throw new Error(`sit insert failed: ${error?.message}`);
  return data.id;
}

interface Fr5Context {
  sitId: string;
  observationTypeId: string;
}

// The FR5 tables, each with a minimal valid row (required columns only,
// from 0001/0012/0014) and an ordinary edit that touches something else.
const FR5_TABLES: Record<string, {
  row: (h: Household, c: Fr5Context) => Record<string, unknown>;
  edit: Record<string, unknown>;
}> = {
  daily_check_ins: { row: (h) => ({ pet_id: h.petId, check_in_date: isoDay(1), status: 'great' }), edit: { notes: 'edited' } },
  observations: { row: (h, c) => ({ pet_id: h.petId, observation_type_id: c.observationTypeId, value: 'normal' }), edit: { notes: 'edited' } },
  vaccinations: { row: (h) => ({ pet_id: h.petId, vaccine_name: 'Scratch Rabies' }), edit: { notes: 'edited' } },
  medications: { row: (h) => ({ pet_id: h.petId, name: 'Scratch Med' }), edit: { name: 'Scratch Med edited' } },
  bloodwork: { row: (h) => ({ pet_id: h.petId, date: isoDay(0) }), edit: { notes: 'edited' } },
  food_logs: { row: (h) => ({ pet_id: h.petId, date: isoDay(0), food_name: 'Scratch Food' }), edit: { food_name: 'Scratch Food edited' } },
  pet_foods: { row: (h) => ({ pet_id: h.petId, name: 'Scratch Food' }), edit: { name: 'Scratch Food edited' } },
  pet_baselines: { row: (h, c) => ({ pet_id: h.petId, observation_type_id: c.observationTypeId, baseline_value: 'normal' }), edit: { baseline_notes: 'edited' } },
  pet_onboarding: { row: (h) => ({ pet_id: h.petId }), edit: { completed_at: new Date().toISOString() } },
  symptom_logs: { row: (h) => ({ pet_id: h.petId, date: isoDay(0) }), edit: { notes: 'edited' } },
  wellness_scores: { row: (h) => ({ pet_id: h.petId, check_in_date: isoDay(0), score: 50 }), edit: { score_reason_summary: 'edited' } },
  pet_sit_logs: { row: (h, c) => ({ pet_sit_id: c.sitId, pet_id: h.petId, date: isoDay(0) }), edit: { notes: 'edited' } },
};

async function storedCreator(table: string, id: string): Promise<string | null> {
  const { data, error } = await adminClient().from(table).select('created_by').eq('id', id).single();
  if (error) throw new Error(`reading ${table}.created_by failed: ${error.message}`);
  return data.created_by;
}

async function petExists(petId: string): Promise<boolean> {
  const { data } = await adminClient().from('pets').select('id').eq('id', petId);
  return (data?.length ?? 0) > 0;
}

Deno.test('co-owner lockdown (specs 0072, 0083)', async (t) => {
  const [owner, coOwner, stranger] = await Promise.all([
    createScratchUser('co-owner'),
    createScratchUser('co-coowner'),
    createScratchUser('co-stranger'),
  ]);
  const u: Users = { owner, coOwner, stranger };
  try {
    await t.step('co-owner lockdown: legitimate invite + claim still grants access (AC4)', () =>
      withHousehold(u, async (h) => {
        assert(await canEditPet(h.coOwner, h.petId), 'claimed co-owner can edit the pet');
      }));

    await t.step('co-owner lockdown: stranger cannot attach themselves directly (AC1)', () =>
      withHousehold(u, async (h) => {
        const { error } = await h.stranger.client.from('pet_co_owners').insert({
          pet_id: h.petId,
          owner_id: h.stranger.userId,
          created_by: h.stranger.userId,
          co_owner_email: h.stranger.email,
          co_owner_user_id: h.stranger.userId,
        });
        assert(error, 'stranger self-link insert must be refused');
        assert(!(await canEditPet(h.stranger, h.petId)), 'stranger must not be able to edit the pet');
      }));

    await t.step('co-owner lockdown: stranger cannot pose as the owner either (AC1)', () =>
      withHousehold(u, async (h) => {
        const { error } = await h.stranger.client.from('pet_co_owners').insert({
          pet_id: h.petId,
          owner_id: h.owner.userId,
          created_by: h.stranger.userId,
          co_owner_email: h.stranger.email,
        });
        assert(error, "stranger insert naming the real owner as owner_id must be refused");
      }));

    await t.step('co-owner lockdown: stranger email-only invite + claim gives nothing (AC2)', () =>
      withHousehold(u, async (h) => {
        const { error } = await h.stranger.client.from('pet_co_owners').insert({
          pet_id: h.petId,
          owner_id: h.stranger.userId,
          created_by: h.stranger.userId,
          co_owner_email: h.stranger.email,
        });
        assert(error, 'stranger email-only insert must be refused');
        await h.stranger.client.rpc('claim_pending_co_owner_invites');
        assert(!(await canEditPet(h.stranger, h.petId)), 'stranger must still have no access after claiming');
      }));

    await t.step('co-owner lockdown: co-owner cannot add another co-owner (AC3)', () =>
      withHousehold(u, async (h) => {
        const { error } = await h.coOwner.client.from('pet_co_owners').insert({
          pet_id: h.petId,
          owner_id: h.coOwner.userId,
          created_by: h.coOwner.userId,
          co_owner_email: h.stranger.email,
        });
        assert(error, 'co-owner invite must be refused');
        assertEquals((await rowsForPet(h.petId)).length, 1, 'only the original co-owner row exists');
      }));

    await t.step('co-owner lockdown: owner cannot pre-attach an account (AC4)', () =>
      withHousehold(u, async (h) => {
        const { error } = await h.owner.client.from('pet_co_owners').insert({
          pet_id: h.petId,
          owner_id: h.owner.userId,
          created_by: h.owner.userId,
          co_owner_email: h.stranger.email,
          co_owner_user_id: h.stranger.userId,
        });
        assert(error, 'insert with co_owner_user_id already set must be refused, even for the owner');
        assert(!(await canEditPet(h.stranger, h.petId)), 'pre-attached account gets no access');
      }));

    await t.step('co-owner lockdown: every owner sees the full list, stranger sees none (AC5)', () =>
      withHousehold(u, async (h) => {
        // A second, still-pending invite from the owner.
        const { error } = await h.owner.client.from('pet_co_owners').insert({
          pet_id: h.petId,
          owner_id: h.owner.userId,
          created_by: h.owner.userId,
          co_owner_email: `pending-${h.stranger.email}`,
        });
        if (error) throw new Error(`second invite failed: ${error.message}`);

        const { data: asCoOwner } = await h.coOwner.client.from('pet_co_owners').select('id').eq('pet_id', h.petId);
        assertEquals(asCoOwner?.length, 2, 'co-owner sees both co-owner rows');
        const { data: asOwner } = await h.owner.client.from('pet_co_owners').select('id').eq('pet_id', h.petId);
        assertEquals(asOwner?.length, 2, 'owner sees both co-owner rows');
        const { data: asStranger } = await h.stranger.client.from('pet_co_owners').select('id').eq('pet_id', h.petId);
        assertEquals(asStranger?.length ?? 0, 0, 'stranger sees no co-owner rows');
      }));

    await t.step('co-owner lockdown: only the primary owner can remove; removed co-owner cannot return (AC6, AC7)', () =>
      withHousehold(u, async (h) => {
        // A second co-owner row the first co-owner will try to remove.
        const { data: other, error } = await h.owner.client
          .from('pet_co_owners')
          .insert({ pet_id: h.petId, owner_id: h.owner.userId, created_by: h.owner.userId, co_owner_email: `other-${h.stranger.email}` })
          .select('id')
          .single();
        if (error || !other) throw new Error(`second invite failed: ${error?.message}`);

        await h.coOwner.client.from('pet_co_owners').delete().eq('id', other.id);
        assertEquals((await rowsForPet(h.petId)).length, 2, 'co-owner delete must remove nothing');

        await h.owner.client.from('pet_co_owners').delete().eq('id', h.coOwnerRowId);
        const remaining = await rowsForPet(h.petId);
        assert(!remaining.some((r) => r.id === h.coOwnerRowId), 'primary owner can remove a co-owner');
        assert(!(await canEditPet(h.coOwner, h.petId)), 'removed co-owner loses edit access');

        const { error: rejoinError } = await h.coOwner.client.from('pet_co_owners').insert({
          pet_id: h.petId,
          owner_id: h.coOwner.userId,
          created_by: h.coOwner.userId,
          co_owner_email: h.coOwner.email,
          co_owner_user_id: h.coOwner.userId,
        });
        assert(rejoinError, 'removed co-owner must not be able to add themselves back');
        assert(!(await canEditPet(h.coOwner, h.petId)), 'removed co-owner still has no access');
      }));

    // ── Spec 0083 (migration 0062) ──────────────────────────────────────────
    const admin = adminClient();
    const { data: obsType, error: obsTypeError } = await admin.from('observation_types').select('id').limit(1).single();
    if (obsTypeError || !obsType) throw new Error(`observation type lookup failed: ${obsTypeError?.message}`);

    for (const [table, spec] of Object.entries(FR5_TABLES)) {
      await t.step(`access tightening: ${table} "entered by" is the inserter and never changes (AC5, AC6)`, async () => {
        if (!(await tableExists(table))) {
          console.log(`  ${table} does not exist on this project (spec 0081); skipped`);
          return;
        }
        await withHousehold(u, async (h) => {
          const sitId = await createSit(h);
          try {
            const row = spec.row(h, { sitId, observationTypeId: obsType.id });

            // AC5: forged author on insert.
            const { data: inserted, error: insertError } = await h.coOwner.client
              .from(table)
              .insert({ ...row, created_by: h.stranger.userId })
              .select('id')
              .single();
            if (insertError || !inserted) throw new Error(`${table} co-owner insert failed: ${insertError?.message}`);
            assertEquals(await storedCreator(table, inserted.id), h.coOwner.userId, `${table}: forged created_by must be replaced by the co-owner's id`);

            // AC6: owner edit that also tries to rewrite the author.
            const { error: updateError } = await h.owner.client
              .from(table)
              .update({ ...spec.edit, created_by: h.owner.userId })
              .eq('id', inserted.id);
            if (updateError) throw new Error(`${table} owner update failed: ${updateError.message}`);
            assertEquals(await storedCreator(table, inserted.id), h.coOwner.userId, `${table}: owner update must not change created_by`);

            // AC5 "or nothing": no author sent at all. Skipped where the
            // table allows only one row per pet (pet_onboarding) or the
            // first row already used the day (unique pet/day tables).
            if (table !== 'pet_onboarding') {
              const second = { ...row };
              if ('check_in_date' in second) second.check_in_date = isoDay(2);
              if (table === 'pet_baselines') second.effective_to = isoDay(0);
              const { data: bare, error: bareError } = await h.coOwner.client
                .from(table)
                .insert(second)
                .select('id')
                .single();
              assertEquals(bareError, null, `${table}: insert with no created_by must succeed`);
              if (bare) assertEquals(await storedCreator(table, bare.id), h.coOwner.userId, `${table}: missing created_by must be the co-owner's id`);
            }
          } finally {
            await admin.from('pet_sits').delete().eq('id', sitId);
          }
        });
      });
    }

    await t.step('access tightening: daily_check_ins upsert ("Skip today") keeps the first author (AC5, AC6)', async () => {
      if (!(await tableExists('daily_check_ins'))) return;
      await withHousehold(u, async (h) => {
        const day = isoDay(3);
        const { data: first, error: firstError } = await h.coOwner.client
          .from('daily_check_ins')
          .upsert(
            { pet_id: h.petId, check_in_date: day, status: 'skipped', created_by: h.stranger.userId },
            { onConflict: 'pet_id,check_in_date' },
          )
          .select('id')
          .single();
        if (firstError || !first) throw new Error(`co-owner upsert failed: ${firstError?.message}`);
        assertEquals(await storedCreator('daily_check_ins', first.id), h.coOwner.userId, 'upsert insert must stamp the co-owner');

        const { data: second, error: secondError } = await h.owner.client
          .from('daily_check_ins')
          .upsert(
            { pet_id: h.petId, check_in_date: day, status: 'great', created_by: h.owner.userId },
            { onConflict: 'pet_id,check_in_date' },
          )
          .select('id, status')
          .single();
        if (secondError || !second) throw new Error(`owner upsert failed: ${secondError?.message}`);
        assertEquals(second.id, first.id, 'second upsert updates the same day');
        assertEquals(second.status, 'great', 'second upsert saves the new status');
        assertEquals(await storedCreator('daily_check_ins', first.id), h.coOwner.userId, 'upsert update must keep the original author');
      });
    });

    await t.step('access tightening: nobody can delete a pet directly (AC7)', () =>
      withHousehold(u, async (h) => {
        await h.coOwner.client.from('pets').delete().eq('id', h.petId);
        assert(await petExists(h.petId), 'co-owner direct delete must delete nothing');

        await h.owner.client.from('pets').delete().eq('id', h.petId);
        assert(await petExists(h.petId), 'primary owner (with a co-owner) direct delete must delete nothing');

        const { data: solo, error } = await h.owner.client
          .from('pets')
          .insert({ name: 'Scratch Sole-Owner Pet', created_by: h.owner.userId })
          .select('id')
          .single();
        if (error || !solo) throw new Error(`sole-owner pet insert failed: ${error?.message}`);
        try {
          await h.owner.client.from('pets').delete().eq('id', solo.id);
          assert(await petExists(solo.id), 'sole owner direct delete must delete nothing');
        } finally {
          await admin.from('pets').delete().eq('id', solo.id);
        }
      }));

    await t.step('access tightening: pets.created_by and pet_sits.created_by cannot be changed (AC8)', () =>
      withHousehold(u, async (h) => {
        const sitId = await createSit(h);
        try {
          const attempts: Array<[string, ScratchUser, string]> = [
            ['co-owner -> self', h.coOwner, h.coOwner.userId],
            ['co-owner -> stranger', h.coOwner, h.stranger.userId],
            ['primary owner -> self', h.owner, h.owner.userId],
            ['primary owner -> co-owner', h.owner, h.coOwner.userId],
            ['primary owner -> stranger', h.owner, h.stranger.userId],
          ];
          for (const [table, id] of [['pets', h.petId], ['pet_sits', sitId]] as const) {
            for (const [label, actor, target] of attempts) {
              await actor.client.from(table).update({ created_by: target }).eq('id', id);
              const stored = await storedCreator(table, id);
              // Put it back (service role) so one failure doesn't hide the next.
              if (stored !== h.owner.userId) await admin.from(table).update({ created_by: h.owner.userId }).eq('id', id);
              assertEquals(stored, h.owner.userId, `${table} ${label}: created_by must stay the primary owner`);
            }
          }
        } finally {
          await admin.from('pet_sits').delete().eq('id', sitId);
        }
      }));

    // QA (spec 0083): clearing the creator to "no one" is also a change, and
    // so is clearing "entered by" on a record (only account deletion may).
    await t.step('QA: created_by cannot be cleared to null, on pets, pet_sits or a record', () =>
      withHousehold(u, async (h) => {
        const sitId = await createSit(h);
        try {
          for (const [table, id] of [['pets', h.petId], ['pet_sits', sitId]] as const) {
            for (const actor of [h.owner, h.coOwner]) {
              const { error }: { error: unknown } = await actor.client.from(table).update({ created_by: null }).eq('id', id);
              const stored = await storedCreator(table, id);
              if (stored !== h.owner.userId) await admin.from(table).update({ created_by: h.owner.userId }).eq('id', id);
              assertEquals(stored, h.owner.userId, `${table}: ${actor.email} clearing created_by must be refused`);
              if (table === 'pets' || actor === h.owner) assert(error, `${table}: ${actor.email} gets an error, not a silent no-op`);
            }
          }
          const { data: v, error: vError } = await h.coOwner.client.from('vaccinations')
            .insert({ pet_id: h.petId, vaccine_name: 'Scratch Null Author' }).select('id').single();
          if (vError || !v) throw new Error(`vaccination insert failed: ${vError?.message}`);
          await h.owner.client.from('vaccinations').update({ created_by: null }).eq('id', v.id);
          assertEquals(await storedCreator('vaccinations', v.id), h.coOwner.userId, 'record author survives an update to null');
        } finally {
          await admin.from('pet_sits').delete().eq('id', sitId);
        }
      }));
  } finally {
    for (const user of [owner, coOwner, stranger]) await deleteScratchUser(user.userId);
  }
});

Deno.test('co-owner lockdown: is_primary_pet_owner is not callable logged out', async () => {
  const { createClient } = await import('jsr:@supabase/supabase-js@2.119.2');
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { error } = await anon.rpc('is_primary_pet_owner', {
    p_pet_id: crypto.randomUUID(),
    p_user_id: crypto.randomUUID(),
  });
  assert(error, 'logged-out call must be refused');
});
