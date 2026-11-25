// Integration tests for ask-vet-assistant's context.ts (spec 0080 FR2, FR6,
// FR7, FR8; AC2, AC3). Run against wysker-watch-dev.
//
// context.ts reads pet data with the CALLER's own signed-in client, so the
// database's access rules decide what the AI is told. These checks run its
// loaders as four throwaway scratch users (owner, co-owner, sitter,
// stranger) plus a logged-out client:
//   - AC3: a sitter's household list leaves out the pet they sit for; a
//     co-owner's includes the co-owned pet; the owner's includes it.
//   - AC2: a stranger (and a logged-out caller) get null from loadPet, so
//     index.ts answers 403.
//   - A sitter still gets the pet during the sit (today's behavior), but
//     not its owner-only medications.
//   - Check-ins come only from the 30-day window ending today on the
//     caller's calendar, with only the 11 counted attributes.
//   - Weight (spec 0081) comes from weight observations of both kinds
//     (check-in and standalone), one per day, picked like the app: a
//     standalone weight beats a check-in weight, then the later save, and
//     values outside 0.1–300 lbs are skipped. A sitter sees a sat pet's
//     weights during the sit; a stranger and a logged-out caller don't.
//
// Same shape as co_owner_access.test.ts: users are created and signed in
// once for the whole file (Supabase Auth limits sign-ins per IP). The
// service-role admin client only seeds check-ins/observations and cleans up.
//
// Run (dev): deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/ai_context.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  requireEnv,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';
import { COUNTED_ATTRIBUTES, dateStrInTimezone } from '../functions/_shared/checkinRules.ts';
import {
  loadActiveMedications,
  loadHouseholdPets,
  loadOwnedPetNames,
  loadPet,
  loadRecentCheckIns,
  loadTrendsSummaryInputs,
  loadWeights,
} from '../functions/ask-vet-assistant/context.ts';

// UTC+14: "today" here is a day ahead of UTC for most of the UTC day, so a
// window counted on the server's UTC calendar would come out wrong.
const OWNER_ZONE = 'Pacific/Kiritimati';
const today = (offset = 0) => dateStrInTimezone(OWNER_ZONE, offset);

const createdPetIds: string[] = [];

async function makePet(user: ScratchUser, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await user.client
    .from('pets')
    .insert({ name, created_by: user.userId, ...extra })
    .select('id')
    .single();
  if (error || !data) throw new Error(`pet insert failed: ${error?.message}`);
  createdPetIds.push(data.id);
  return data.id;
}

async function typeIds(codes: string[]): Promise<Record<string, string>> {
  const { data, error } = await adminClient().from('observation_types').select('id, code').in('code', codes);
  if (error) throw new Error(`observation types lookup failed: ${error.message}`);
  return Object.fromEntries((data ?? []).map((t) => [t.code, t.id]));
}

async function seedCheckIn(
  owner: ScratchUser,
  petId: string,
  date: string,
  status: string,
  observations: { typeId: string; value?: string | null; numeric_value?: number }[] = [],
): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('daily_check_ins')
    .insert({ pet_id: petId, created_by: owner.userId, check_in_date: date, status })
    .select('id')
    .single();
  if (error || !data) throw new Error(`check-in seed failed: ${error?.message}`);
  if (observations.length) {
    const { error: obsError } = await admin.from('observations').insert(
      observations.map((o) => ({
        pet_id: petId,
        created_by: owner.userId,
        daily_check_in_id: data.id,
        observation_type_id: o.typeId,
        value: o.value ?? null,
        numeric_value: o.numeric_value ?? null,
      })),
    );
    if (obsError) throw new Error(`observation seed failed: ${obsError.message}`);
  }
  return data.id;
}

// A standalone weight (no check-in), saved as the owner the way the app's
// Log weight sheet does: observed_at is noon UTC of the chosen date. Saved
// one at a time, so each later call has a later updated_at.
async function logWeight(owner: ScratchUser, petId: string, typeId: string, date: string, lbs: number) {
  const { error } = await owner.client.from('observations').insert({
    pet_id: petId,
    created_by: owner.userId,
    daily_check_in_id: null,
    observation_type_id: typeId,
    numeric_value: lbs,
    observed_at: `${date}T12:00:00.000Z`,
  });
  if (error) throw new Error(`weight insert failed: ${error.message}`);
}

Deno.test('ask-vet-assistant context loaders (spec 0080)', async (t) => {
  const [owner, coOwner, sitter, stranger] = await Promise.all([
    createScratchUser('ctx-owner'),
    createScratchUser('ctx-coowner'),
    createScratchUser('ctx-sitter'),
    createScratchUser('ctx-stranger'),
  ]);
  const loggedOut = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));
  try {
    const { error: tzError } = await owner.client.from('profiles').update({ timezone: OWNER_ZONE }).eq('id', owner.userId);
    if (tzError) throw new Error(`timezone update failed: ${tzError.message}`);

    // The owner's household: a co-owned pet, a sat pet (also co-owned, so
    // the co-owner check covers it), and a memorial pet.
    const sharedPet = await makePet(owner, 'Ctx Shared Pet', { species: 'Dog', breed: 'Beagle' });
    const memorialPet = await makePet(owner, 'Ctx Memorial Pet', { is_memorial: true });

    const { error: inviteError } = await owner.client.from('pet_co_owners').insert({
      pet_id: sharedPet, owner_id: owner.userId, created_by: owner.userId, co_owner_email: coOwner.email,
    });
    if (inviteError) throw new Error(`co-owner invite failed: ${inviteError.message}`);
    const { error: claimError } = await coOwner.client.rpc('claim_pending_co_owner_invites');
    if (claimError) throw new Error(`co-owner claim failed: ${claimError.message}`);

    const { data: sit, error: sitError } = await owner.client
      .from('pet_sits')
      .insert({ created_by: owner.userId, pet_ids: [sharedPet], start_date: today(0), end_date: today(1), sitter_name: 'Ctx Sitter' })
      .select('id')
      .single();
    if (sitError || !sit) throw new Error(`sit insert failed: ${sitError?.message}`);
    const { error: sitInviteError } = await owner.client.from('pet_sitter_access').insert({
      pet_sit_id: sit.id, owner_id: owner.userId, created_by: owner.userId, sitter_email: sitter.email,
    });
    if (sitInviteError) throw new Error(`sitter invite failed: ${sitInviteError.message}`);
    const { error: sitClaimError } = await sitter.client.rpc('claim_pending_sitter_invites');
    if (sitClaimError) throw new Error(`sitter claim failed: ${sitClaimError.message}`);

    const { error: medError } = await owner.client.from('medications').insert([
      { pet_id: sharedPet, created_by: owner.userId, name: 'Ctx Active Med', active: true },
      { pet_id: sharedPet, created_by: owner.userId, name: 'Ctx Stopped Med', active: false },
    ]);
    if (medError) throw new Error(`medication insert failed: ${medError.message}`);

    const types = await typeIds(['appetite', 'energy', 'other', 'weight']);

    await t.step('owner household includes the shared pet, not the memorial pet (AC3)', async () => {
      const names = (await loadHouseholdPets(owner.client, owner.userId)).map((p) => p.name);
      assertEquals(names, ['Ctx Shared Pet']);
      const owned = (await loadOwnedPetNames(owner.client, owner.userId)).map((p) => p.name).sort();
      assertEquals(owned, ['Ctx Memorial Pet', 'Ctx Shared Pet'], 'the scan list keeps memorial pets, like listOwnedPets()');
    });

    await t.step('co-owner household includes the co-owned pet (AC3)', async () => {
      const pets = await loadHouseholdPets(coOwner.client, coOwner.userId);
      assertEquals(pets, [{ name: 'Ctx Shared Pet', species: 'Dog', breed: 'Beagle', conditions: [] }]);
      const owned = (await loadOwnedPetNames(coOwner.client, coOwner.userId)).map((p) => p.name);
      assertEquals(owned, ['Ctx Shared Pet']);
    });

    await t.step('sitter household leaves out the sat pet (AC3)', async () => {
      assertEquals(await loadHouseholdPets(sitter.client, sitter.userId), []);
      assertEquals(await loadOwnedPetNames(sitter.client, sitter.userId), []);
    });

    await t.step('sitter still gets the sat pet during the sit, but not its medications', async () => {
      const pet = await loadPet(sitter.client, sharedPet);
      assertEquals(pet?.id, sharedPet, 'sitter can ask about the pet they sit for');
      assertEquals(await loadActiveMedications(sitter.client, sharedPet), [], 'medications stay owner-only');
    });

    await t.step('stranger and logged-out caller get null for the pet (AC2)', async () => {
      assertEquals(await loadPet(stranger.client, sharedPet), null);
      // A logged-out caller never reaches context.ts (index.ts answers 401
      // first). If it did, the database refuses it outright: the anon role
      // can't run the access-rule helpers (migration 0059), so the read
      // errors instead of returning the pet.
      const anon = await loadPet(loggedOut, sharedPet).then(
        (pet) => ({ pet, error: null as string | null }),
        (err: Error) => ({ pet: null, error: err.message }),
      );
      assertEquals(anon.pet, null, 'logged-out caller gets no pet');
      if (anon.error) assert(anon.error.includes('permission denied'), `unexpected error: ${anon.error}`);
      assertEquals(await loadRecentCheckIns(stranger.client, sharedPet, 'UTC'), []);
      assertEquals(await loadHouseholdPets(stranger.client, stranger.userId), []);
      assertEquals(await loadTrendsSummaryInputs(stranger.client, sharedPet, '7D', 'UTC'), null);
    });

    await t.step('owner and co-owner get the pet and only its active medications', async () => {
      for (const user of [owner, coOwner]) {
        const pet = await loadPet(user.client, sharedPet);
        assertEquals(pet?.name, 'Ctx Shared Pet');
        assertEquals(await loadActiveMedications(user.client, sharedPet), [
          { name: 'Ctx Active Med', dosage: null, frequency: null, active: true },
        ]);
      }
    });

    await t.step('check-ins: only the caller-timezone 30-day window, only counted attributes', async () => {
      const petId = await makePet(owner, 'Ctx Check-In Pet');
      await seedCheckIn(owner, petId, today(1), 'great'); // tomorrow: outside
      await seedCheckIn(owner, petId, today(0), 'off', [
        { typeId: types.appetite, value: 'ate_little_less' },
        { typeId: types.energy, value: 'normal' },
        { typeId: types.other, value: 'something else' },
      ]);
      await seedCheckIn(owner, petId, today(-29), 'skipped'); // first day of the window
      await seedCheckIn(owner, petId, today(-30), 'great'); // one day too old

      const days = await loadRecentCheckIns(owner.client, petId, OWNER_ZONE);
      assertEquals(days.map((d) => d.date), [today(-29), today(0)]);
      assertEquals(days.map((d) => d.status), ['skipped', 'off']);
      const todays = days[1].symptoms.sort((a, b) => a.code.localeCompare(b.code));
      assertEquals(todays, [
        { code: 'appetite', attribute: 'Appetite', value: 'ate_little_less', label: 'Ate a little less' },
        { code: 'energy', attribute: 'Energy', value: 'normal', label: 'Normal' },
      ]);
      for (const d of days) for (const s of d.symptoms) assert(COUNTED_ATTRIBUTES.includes(s.code));
    });

    await t.step('trends summary inputs: today\'s state, weight, and the 2-check-in gate', async () => {
      const petId = await makePet(owner, 'Ctx Trends Pet');
      await seedCheckIn(owner, petId, today(0), 'off', [{ typeId: types.appetite, value: 'ate_little_less' }]);
      assertEquals(await loadTrendsSummaryInputs(owner.client, petId, '7D', OWNER_ZONE), null, 'one check-in is not enough');
      await seedCheckIn(owner, petId, today(-1), 'skipped');
      assertEquals(await loadTrendsSummaryInputs(owner.client, petId, '7D', OWNER_ZONE), null, 'skipped days do not count');
      // A check-in weight typed in today(-2)'s check-in.
      await seedCheckIn(owner, petId, today(-2), 'great', [{ typeId: types.weight, numeric_value: 10.8 }]);

      // Weights of both kinds, one per day after the pick:
      //   today(-8)  9.0   outside the 7D range (cutoff today(-7))
      //   today(-3)  10.0  standalone
      //   today(-2)  11.0  standalone beats the check-in's 10.8
      //   today(-1)  11.6  the later of two standalone saves (11.4 first)
      //   today(0)   400   out of range: skipped, so today has no weight
      await logWeight(owner, petId, types.weight, today(-8), 9.0);
      await logWeight(owner, petId, types.weight, today(-3), 10.0);
      await logWeight(owner, petId, types.weight, today(-2), 11.0);
      await logWeight(owner, petId, types.weight, today(-1), 11.4);
      await logWeight(owner, petId, types.weight, today(-1), 11.6);
      await logWeight(owner, petId, types.weight, today(0), 400);

      const inputs = await loadTrendsSummaryInputs(owner.client, petId, '7D', OWNER_ZONE);
      assert(inputs, 'two non-skipped check-ins unlock the summary');
      assertEquals(inputs.appetite, { currentLabel: '1 Symptom', currentSubtitle: 'Ate a little less' });
      assertEquals(inputs.energy, { currentLabel: 'Normal', currentSubtitle: 'No change from usual' });
      assertEquals(inputs.weight, { currentLbs: 11.6, deltaLbs: 0.6 });

      // Insights gets every day's weight, one per day, newest first.
      assertEquals(await loadWeights(owner.client, petId), [
        { date: today(-1), lbs: 11.6 },
        { date: today(-2), lbs: 11 },
        { date: today(-3), lbs: 10 },
        { date: today(-8), lbs: 9 },
      ]);
    });

    await t.step('weights: a check-in weight counts when it is the only one that day', async () => {
      const petId = await makePet(owner, 'Ctx Check-In Weight Pet');
      await seedCheckIn(owner, petId, today(-1), 'great', [{ typeId: types.weight, numeric_value: 8.44 }]);
      await seedCheckIn(owner, petId, today(0), 'off', [{ typeId: types.weight, numeric_value: 8.66 }]);
      assertEquals(await loadWeights(owner.client, petId), [
        { date: today(0), lbs: 8.7 },
        { date: today(-1), lbs: 8.4 },
      ]);
      const inputs = await loadTrendsSummaryInputs(owner.client, petId, '7D', OWNER_ZONE);
      assertEquals(inputs?.weight, { currentLbs: 8.7, deltaLbs: 0.3 });
    });

    await t.step('weights: owner, co-owner and sitter (during the sit) see them; a stranger and logged-out caller do not', async () => {
      await seedCheckIn(owner, sharedPet, today(0), 'great', [{ typeId: types.weight, numeric_value: 20.4 }]);
      await logWeight(owner, sharedPet, types.weight, today(-1), 20.2);
      const expected = [{ date: today(0), lbs: 20.4 }, { date: today(-1), lbs: 20.2 }];
      for (const user of [owner, coOwner, sitter]) {
        assertEquals(await loadWeights(user.client, sharedPet), expected, `${user.email} should see the weights`);
      }
      assertEquals(await loadWeights(stranger.client, sharedPet), []);
      // As for loadPet: the anon role is refused outright or sees nothing.
      const anon = await loadWeights(loggedOut, sharedPet).then(
        (weights) => ({ weights, error: null as string | null }),
        (err: Error) => ({ weights: [], error: err.message }),
      );
      assertEquals(anon.weights, [], 'logged-out caller gets no weights');
      if (anon.error) assert(anon.error.includes('permission denied'), `unexpected error: ${anon.error}`);
    });
  } finally {
    const admin = adminClient();
    // Sits, invites, check-ins, observations, medications and logs cascade
    // with the pet or the user.
    if (createdPetIds.length) await admin.from('pets').delete().in('id', createdPetIds);
    for (const user of [owner, coOwner, sitter, stranger]) await deleteScratchUser(user.userId);
  }
});
