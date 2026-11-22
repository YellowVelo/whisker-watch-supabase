// Integration tests for spec 0072 (punch list PA-02): who may add, see and
// remove a pet's co-owners (migration 0056). Run against wysker-watch-dev.
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

Deno.test('co-owner lockdown (spec 0072)', async (t) => {
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
