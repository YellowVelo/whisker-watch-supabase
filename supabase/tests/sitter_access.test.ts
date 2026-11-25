// Integration tests for spec 0073 (punch list PA-03, PA-04, PA-26, PA-27 and
// the sitter-function part of PA-05): who may build a pet sit, become its
// sitter, and for how long (migration 0057). Run against wysker-watch-dev.
//
// Same shape as co_owner_access.test.ts: one set of throwaway scratch users
// (owner, sitter, stranger, and a co-owner for the Vet Report check, spec
// 0083 AC4) is created and signed in once for the whole file
// (Supabase Auth limits sign-ins per IP; spec 0072 hit it), and each check
// builds its own fresh pets and sits. "Refused" checks act through the user's
// own signed-in client, the way someone going around the app would; the
// service-role admin client only seeds check-ins/observations and cleans up.
//
// The sitter window is counted on the OWNER's calendar (profiles.timezone of
// the sit's created_by), so each window check sets the owner's zone first and
// computes "today" in that same zone.
//
// Run (dev): deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/sitter_access.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  functionsUrl,
  requireEnv,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);

interface Users {
  owner: ScratchUser;
  sitter: ScratchUser;
  stranger: ScratchUser;
}

// Today's calendar date in a time zone, shifted by whole days, as YYYY-MM-DD.
function dateIn(timeZone: string, offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

async function setTimezone(user: ScratchUser, timezone: string) {
  const { error } = await user.client.from('profiles').update({ timezone }).eq('id', user.userId);
  if (error) throw new Error(`timezone update failed: ${error.message}`);
}

const createdPetIds: string[] = [];

async function makePet(user: ScratchUser, name = 'Scratch Sitter Pet'): Promise<string> {
  const { data, error } = await user.client.from('pets').insert({ name, created_by: user.userId }).select('id').single();
  if (error || !data) throw new Error(`pet insert failed: ${error?.message}`);
  createdPetIds.push(data.id);
  return data.id;
}

async function makeSit(user: ScratchUser, petIds: string[], startDate: string, endDate: string) {
  return await user.client
    .from('pet_sits')
    .insert({ created_by: user.userId, pet_ids: petIds, start_date: startDate, end_date: endDate, sitter_name: 'Scratch Sitter' })
    .select('id')
    .single();
}

// The legitimate path: owner invites by email only, sitter claims on sign-in.
async function inviteAndClaim(u: Users, sitId: string) {
  const { error } = await u.owner.client.from('pet_sitter_access').insert({
    pet_sit_id: sitId,
    owner_id: u.owner.userId,
    created_by: u.owner.userId,
    sitter_email: u.sitter.email,
  });
  if (error) throw new Error(`owner invite failed: ${error.message}`);
  const { error: claimError } = await u.sitter.client.rpc('claim_pending_sitter_invites');
  if (claimError) throw new Error(`sitter claim failed: ${claimError.message}`);
}

let observationTypeId: string | null = null;

// A pet with a photo, one check-in and one observation, inside a sit with
// one checklist row, with the sitter invited and linked.
async function buildSit(u: Users, startOffset: number, endOffset: number, ownerZone: string) {
  const petId = await makePet(u.owner);
  const photoPath = `${u.owner.userId}/sitter-${petId}.png`;
  const { error: uploadError } = await u.owner.client.storage.from('uploads').upload(photoPath, PNG_BYTES, { contentType: 'image/png' });
  if (uploadError) throw new Error(`photo upload failed: ${uploadError.message}`);
  await u.owner.client.from('pets').update({ photo_path: photoPath }).eq('id', petId);

  const admin = adminClient();
  if (!observationTypeId) {
    const { data } = await admin.from('observation_types').select('id').limit(1).single();
    observationTypeId = data?.id ?? null;
  }
  const { error: ciError } = await admin.from('daily_check_ins').insert({
    pet_id: petId, created_by: u.owner.userId, check_in_date: dateIn(ownerZone), status: 'great',
  });
  if (ciError) throw new Error(`check-in seed failed: ${ciError.message}`);
  const { error: obsError } = await admin.from('observations').insert({
    pet_id: petId, created_by: u.owner.userId, observation_type_id: observationTypeId,
  });
  if (obsError) throw new Error(`observation seed failed: ${obsError.message}`);

  const { data: sit, error: sitError } = await makeSit(u.owner, [petId], dateIn(ownerZone, startOffset), dateIn(ownerZone, endOffset));
  if (sitError || !sit) throw new Error(`sit insert failed: ${sitError?.message}`);
  const { error: logError } = await u.owner.client
    .from('pet_sit_logs')
    .insert({ pet_sit_id: sit.id, pet_id: petId, created_by: u.owner.userId, date: dateIn(ownerZone, startOffset) });
  if (logError) throw new Error(`owner checklist insert failed: ${logError.message}`);

  await inviteAndClaim(u, sit.id);
  return { petId, sitId: sit.id, photoPath };
}

// Everything a sitter should see during the window, as one yes/no per item.
async function whatSitterSees(sitter: ScratchUser, s: { petId: string; sitId: string; photoPath: string }) {
  const c = sitter.client;
  const count = async (q: PromiseLike<{ data: unknown[] | null }>) => ((await q).data?.length ?? 0) > 0;
  const { data: signed } = await c.storage.from('uploads').createSignedUrl(s.photoPath, 60);
  return {
    pet: await count(c.from('pets').select('id').eq('id', s.petId)),
    sit: await count(c.from('pet_sits').select('id').eq('id', s.sitId)),
    checklist: await count(c.from('pet_sit_logs').select('id').eq('pet_sit_id', s.sitId)),
    checkIns: await count(c.from('daily_check_ins').select('id').eq('pet_id', s.petId)),
    observations: await count(c.from('observations').select('id').eq('pet_id', s.petId)),
    photo: !!signed?.signedUrl,
  };
}

// Calls generate-vet-report as the user and returns the status, content
// type and, for a JSON refusal, its error code.
async function requestVetReport(user: ScratchUser, petId: string) {
  const res = await fetch(functionsUrl('generate-vet-report'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      apikey: requireEnv('SUPABASE_ANON_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ petId, format: 'pdf' }),
  });
  const contentType = res.headers.get('content-type') ?? '';
  let code: string | null = null;
  if (contentType.includes('application/json')) {
    const json = await res.json().catch(() => ({}));
    code = json?.error?.code ?? null;
  } else {
    await res.arrayBuffer();
  }
  return { status: res.status, contentType, code };
}

const ALL = { pet: true, sit: true, checklist: true, checkIns: true, observations: true, photo: true };
const NONE = { pet: false, sit: false, checklist: false, checkIns: false, observations: false, photo: false };

Deno.test('sitter lockdown (spec 0073)', async (t) => {
  const [owner, sitter, stranger, coOwner] = await Promise.all([
    createScratchUser('sit-owner'),
    createScratchUser('sit-sitter'),
    createScratchUser('sit-stranger'),
    createScratchUser('sit-coowner'),
  ]);
  const u: Users = { owner, sitter, stranger };
  try {
    await setTimezone(owner, 'UTC');

    await t.step('stranger cannot build a sit around someone else\'s pet (AC1)', async () => {
      const victimPet = await makePet(owner);
      const ownPet = await makePet(stranger);
      const today = dateIn('UTC');
      const alone = await makeSit(stranger, [victimPet], today, today);
      assert(alone.error, 'sit listing only the victim pet must be refused');
      const mixed = await makeSit(stranger, [ownPet, victimPet], today, today);
      assert(mixed.error, 'sit mixing own pet with the victim pet must be refused');
      const empty = await makeSit(stranger, [], today, today);
      assert(empty.error, 'sit with no pets must be refused');
      const legit = await makeSit(stranger, [ownPet], today, today);
      assert(!legit.error, `sit with only own pet works: ${legit.error?.message}`);
    });

    await t.step('owner cannot edit a sit to add a pet they don\'t own (AC2)', async () => {
      const ownPet = await makePet(owner);
      const otherPet = await makePet(stranger);
      const today = dateIn('UTC');
      const { data: sit } = await makeSit(owner, [ownPet], today, today);
      assert(sit, 'owner can create their sit');
      const { data: widened } = await owner.client.from('pet_sits').update({ pet_ids: [ownPet, otherPet] }).eq('id', sit.id).select('id');
      assertEquals(widened?.length ?? 0, 0, 'adding a pet the owner does not own must change nothing');
      const { data: edited } = await owner.client.from('pet_sits').update({ sitter_name: 'Renamed' }).eq('id', sit.id).select('id');
      assertEquals(edited?.length, 1, 'editing a sit of own pets still works');
    });

    await t.step('nobody can attach a sitter account directly or invite on someone else\'s sit (AC3)', async () => {
      const ownPet = await makePet(owner);
      const today = dateIn('UTC');
      const { data: sit } = await makeSit(owner, [ownPet], today, today);
      assert(sit, 'owner can create their sit');

      const { error: preLinked } = await owner.client.from('pet_sitter_access').insert({
        pet_sit_id: sit.id, owner_id: owner.userId, created_by: owner.userId, sitter_email: stranger.email, sitter_user_id: stranger.userId,
      });
      assert(preLinked, 'invite with sitter_user_id already set must be refused, even for the owner');

      const { error: strangerInvite } = await stranger.client.from('pet_sitter_access').insert({
        pet_sit_id: sit.id, owner_id: stranger.userId, created_by: stranger.userId, sitter_email: stranger.email,
      });
      assert(strangerInvite, "stranger invite on the owner's sit must be refused");
      await stranger.client.rpc('claim_pending_sitter_invites');
      const { data: seen } = await stranger.client.from('pets').select('id').eq('id', ownPet);
      assertEquals(seen?.length ?? 0, 0, 'stranger still cannot see the pet');
    });

    await t.step('sitter sees everything on every day of the window (AC4)', async () => {
      for (const [label, start, end] of [['day before', 1, 3], ['first day', 0, 2], ['last day', -2, 0], ['day after', -3, -1]] as const) {
        const s = await buildSit(u, start, end, 'UTC');
        assertEquals(await whatSitterSees(sitter, s), ALL, `${label}: sitter sees the sit's pet, photo, records and checklist`);
      }
    });

    await t.step('sitter sees nothing two or more days outside the window (AC5)', async () => {
      for (const [label, start, end] of [['2 days before', 2, 4], ['2 days after', -4, -2]] as const) {
        const s = await buildSit(u, start, end, 'UTC');
        assertEquals(await whatSitterSees(sitter, s), NONE, `${label}: sitter sees nothing`);
      }
    });

    await t.step("the owner's calendar decides, not the sitter's (AC6)", async () => {
      // UTC+14 and UTC-11 are 25 hours apart, so their calendar dates always differ.
      await setTimezone(owner, 'Pacific/Kiritimati');
      await setTimezone(sitter, 'Pacific/Pago_Pago');
      try {
        // Opens tomorrow on the owner's calendar: inside the window by the
        // owner's date, 2+ days early by the sitter's.
        const early = await buildSit(u, 1, 2, 'Pacific/Kiritimati');
        assertEquals(await whatSitterSees(sitter, early), ALL, "owner's calendar opens the window");
        // Ended 2 days ago on the owner's calendar: outside by the owner's
        // date, still inside by the sitter's.
        const late = await buildSit(u, -3, -2, 'Pacific/Kiritimati');
        assertEquals(await whatSitterSees(sitter, late), NONE, "owner's calendar closes the window");
      } finally {
        await setTimezone(owner, 'UTC');
        await setTimezone(sitter, 'UTC');
      }
    });

    await t.step('checklist entries must be for a pet in the sit (AC7)', async () => {
      const s = await buildSit(u, 0, 1, 'UTC');
      const otherPet = await makePet(owner);
      const today = dateIn('UTC');
      const { error: sitterOther } = await sitter.client.from('pet_sit_logs')
        .insert({ pet_sit_id: s.sitId, pet_id: otherPet, created_by: sitter.userId, date: today });
      assert(sitterOther, 'sitter entry for a pet outside the sit must be refused');
      const { error: ownerOther } = await owner.client.from('pet_sit_logs')
        .insert({ pet_sit_id: s.sitId, pet_id: otherPet, created_by: owner.userId, date: today });
      assert(ownerOther, 'owner entry for a pet outside the sit must be refused');
      const { error: sitterOk } = await sitter.client.from('pet_sit_logs')
        .insert({ pet_sit_id: s.sitId, pet_id: s.petId, created_by: sitter.userId, date: today });
      assert(!sitterOk, `sitter entry for the sit's own pet works during the window: ${sitterOk?.message}`);
    });

    await t.step('profile email cannot be changed, and invites follow the login email (AC8)', async () => {
      const { error } = await stranger.client.from('profiles').update({ email: sitter.email }).eq('id', stranger.userId);
      assert(error, 'changing profiles.email must be refused');
      const { data } = await stranger.client.from('pet_sitter_access').select('id').ilike('sitter_email', sitter.email);
      assertEquals(data?.length ?? 0, 0, "stranger sees none of the sitter's invites");
    });

    await t.step('sitter checks answer only about the caller (AC9)', async () => {
      const s = await buildSit(u, 0, 1, 'UTC');
      const { data: forSelf } = await sitter.client.rpc('is_pet_sitter', { p_pet_id: s.petId, p_user_id: sitter.userId });
      assertEquals(forSelf, true, 'sitter asking about themselves gets a true answer');
      const { data: petAnswer } = await stranger.client.rpc('is_pet_sitter', { p_pet_id: s.petId, p_user_id: sitter.userId });
      assertEquals(petAnswer, false, 'stranger asking about the sitter gets no');
      const { data: sitAnswer } = await stranger.client.rpc('is_pet_sit_sitter', { p_pet_sit_id: s.sitId, p_user_id: sitter.userId });
      assertEquals(sitAnswer, false, 'stranger asking about the sitter (sit) gets no');
      const anon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));
      const { data: anonAnswer } = await anon.rpc('is_pet_sitter', { p_pet_id: s.petId, p_user_id: sitter.userId });
      assert(anonAnswer !== true, 'logged-out caller never gets a yes');
    });

    await t.step('only owners and co-owners can generate the Vet Report (spec 0083 AC4, PA-72)', async () => {
      const s = await buildSit(u, 0, 1, 'UTC');
      // The co-owner joins the legitimate way: invited by email, claimed on sign-in.
      const { error: inviteError } = await owner.client.from('pet_co_owners').insert({
        pet_id: s.petId, owner_id: owner.userId, created_by: owner.userId, co_owner_email: coOwner.email,
      });
      if (inviteError) throw new Error(`co-owner invite failed: ${inviteError.message}`);
      const { error: claimError } = await coOwner.client.rpc('claim_pending_co_owner_invites');
      if (claimError) throw new Error(`co-owner claim failed: ${claimError.message}`);

      // The sit is open, so the sitter can read the pet: RLS alone would let them through.
      assertEquals((await whatSitterSees(sitter, s)).pet, true, 'sit is open: sitter can read the pet');
      const asSitter = await requestVetReport(sitter, s.petId);
      assertEquals([asSitter.status, asSitter.code], [403, 'forbidden'], 'sitter during an open sit is refused');
      const asStranger = await requestVetReport(stranger, s.petId);
      assertEquals([asStranger.status, asStranger.code], [403, 'forbidden'], 'stranger is refused');

      for (const [label, user] of [['owner', owner], ['co-owner', coOwner]] as const) {
        const res = await requestVetReport(user, s.petId);
        assertEquals(res.status, 200, `${label} gets the report`);
        assert(res.contentType.includes('application/pdf'), `${label} gets a PDF (got ${res.contentType})`);
      }
    });
  } finally {
    const admin = adminClient();
    // Sits/logs/invites/check-ins cascade with the pet or the user.
    if (createdPetIds.length) await admin.from('pets').delete().in('id', createdPetIds);
    const { data: files } = await admin.storage.from('uploads').list(owner.userId, { limit: 100 });
    if (files?.length) await admin.storage.from('uploads').remove(files.map((f: { name: string }) => `${owner.userId}/${f.name}`));
    for (const user of [owner, sitter, stranger, coOwner]) await deleteScratchUser(user.userId);
  }
});
