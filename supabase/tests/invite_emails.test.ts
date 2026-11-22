// Integration tests for spec 0077 (punch list PA-10, PA-36): the deployed
// invite-co-owner and invite-sitter functions on wysker-watch-dev.
//
// No real email is ever sent:
//   - every inviter is switched to account_type 'test' (admin client) before
//     it calls a function, so sendEmail() drops the send and only writes an
//     email_logs row with status 'suppressed' (which also tells us which
//     template was chosen);
//   - every invitee is an existing scratch account, so the functions never
//     create a new Auth user through generateLink.
// The rate-limit check uses its own scratch user, so it can't use up anyone
// else's hourly budget. Five scratch users are created once for the file
// (Supabase Auth's sign-in limit — see co_owner_access.test.ts).
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/invite_emails.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  functionsUrl,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

async function callFunction(name: string, user: ScratchUser, body: Record<string, unknown>) {
  const resp = await fetch(functionsUrl(name), {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  return { status: resp.status, json };
}

async function markTestAccount(user: ScratchUser) {
  const { error } = await adminClient().from('profiles').update({ account_type: 'test' }).eq('id', user.userId);
  if (error) throw new Error(`could not mark ${user.email} as test: ${error.message}`);
}

async function lastLogFor(relatedEntityId: string) {
  const { data } = await adminClient()
    .from('email_logs')
    .select('template_name, status')
    .eq('related_entity_id', relatedEntityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

Deno.test({
  name: 'invite emails (spec 0077)',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const owner = await createScratchUser('invite-owner');
    const invitee = await createScratchUser('invite-invitee');
    const sitter = await createScratchUser('invite-sitter');
    const stranger = await createScratchUser('invite-stranger');
    const flooder = await createScratchUser('invite-flooder');
    const users = [owner, invitee, sitter, stranger, flooder];
    const admin = adminClient();
    let petId = '';
    let sitId = '';
    try {
      for (const u of users) await markTestAccount(u);

      const { data: pet, error: petError } = await owner.client
        .from('pets')
        .insert({ name: 'Scratch Invite Pet', created_by: owner.userId })
        .select('id')
        .single();
      if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);
      petId = pet.id;

      const { data: coRow, error: coError } = await owner.client
        .from('pet_co_owners')
        .insert({ pet_id: petId, owner_id: owner.userId, created_by: owner.userId, co_owner_email: invitee.email })
        .select('id')
        .single();
      if (coError || !coRow) throw new Error(`co-owner invite failed: ${coError?.message}`);

      await t.step('AC7/AC10: primary owner, pending invite, existing account → co-owner-added, no messageId', async () => {
        const { status, json } = await callFunction('invite-co-owner', owner, {
          coOwnerEmail: invitee.email.toUpperCase(), // case shouldn't matter
          petId,
          petName: 'A Name The Browser Made Up',
        });
        assertEquals(status, 200, JSON.stringify(json));
        assertEquals(json, { sent: false, reason: 'test_or_demo_account' });
        assert(!('messageId' in json));
        const log = await lastLogFor(coRow.id);
        assertEquals(log?.template_name, 'co-owner-added');
        assertEquals(log?.status, 'suppressed');
      });

      await t.step('AC8: a stranger gets "Invite not found" for someone else\'s pet', async () => {
        const { status, json } = await callFunction('invite-co-owner', stranger, { coOwnerEmail: invitee.email, petId });
        assertEquals(status, 404);
        assertEquals(json, { error: 'Invite not found' });
      });

      await t.step('AC8: no pending invite for that address → "Invite not found"', async () => {
        const { status } = await callFunction('invite-co-owner', owner, {
          coOwnerEmail: `nobody-${Date.now()}@example.com`,
          petId,
        });
        assertEquals(status, 404);
      });

      await t.step('AC8: an accepted co-owner (not primary) cannot send invites', async () => {
        const { error: claimError } = await invitee.client.rpc('claim_pending_co_owner_invites');
        if (claimError) throw new Error(`claim failed: ${claimError.message}`);
        // The invitee's own row is linked now, so the owner gets 404 for it too.
        const { status: ownerStatus } = await callFunction('invite-co-owner', owner, { coOwnerEmail: invitee.email, petId });
        assertEquals(ownerStatus, 404, 'a linked invite is no longer pending');
        // A pending row the co-owner (not primary owner) tries to email about.
        const { error: rowError } = await owner.client
          .from('pet_co_owners')
          .insert({ pet_id: petId, owner_id: owner.userId, created_by: owner.userId, co_owner_email: stranger.email });
        if (rowError) throw new Error(`second invite failed: ${rowError.message}`);
        const { status } = await callFunction('invite-co-owner', invitee, { coOwnerEmail: stranger.email, petId });
        assertEquals(status, 404);
      });

      await t.step('AC9/AC10: sit owner, pending sitter invite, existing account → sitter-added', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const { data: sit, error: sitError } = await owner.client
          .from('pet_sits')
          .insert({ pet_ids: [petId], start_date: today, end_date: today, created_by: owner.userId })
          .select('id')
          .single();
        if (sitError || !sit) throw new Error(`sit insert failed: ${sitError?.message}`);
        sitId = sit.id;
        const { data: access, error: accessError } = await owner.client
          .from('pet_sitter_access')
          .insert({ pet_sit_id: sit.id, owner_id: owner.userId, created_by: owner.userId, sitter_email: sitter.email })
          .select('id')
          .single();
        if (accessError || !access) throw new Error(`sitter invite failed: ${accessError?.message}`);

        const { status, json } = await callFunction('invite-sitter', owner, { sitterEmail: sitter.email, petSitId: sit.id });
        assertEquals(status, 200, JSON.stringify(json));
        assertEquals(json, { sent: false, reason: 'test_or_demo_account' });
        const log = await lastLogFor(access.id);
        assertEquals(log?.template_name, 'sitter-added');

        const { status: strangerStatus, json: strangerJson } = await callFunction('invite-sitter', stranger, {
          sitterEmail: sitter.email,
          petSitId: sit.id,
        });
        assertEquals(strangerStatus, 404);
        assertEquals(strangerJson, { error: 'Invite not found' });

        const { status: noInviteStatus } = await callFunction('invite-sitter', owner, {
          sitterEmail: `nobody-${Date.now()}@example.com`,
          petSitId: sit.id,
        });
        assertEquals(noInviteStatus, 404);
      });

      await t.step('AC11: the 11th invite request in an hour is refused, across both functions', async () => {
        for (let i = 0; i < 10; i++) {
          const fn = i % 2 === 0 ? 'invite-co-owner' : 'invite-sitter';
          const body = fn === 'invite-co-owner'
            ? { coOwnerEmail: `probe-${i}@example.com`, petId: crypto.randomUUID() }
            : { sitterEmail: `probe-${i}@example.com`, petSitId: crypto.randomUUID() };
          const { status } = await callFunction(fn, flooder, body);
          assertEquals(status, 404, `request ${i + 1} should be refused as not found, not rate limited`);
        }
        const { status } = await callFunction('invite-co-owner', flooder, {
          coOwnerEmail: 'probe-11@example.com',
          petId: crypto.randomUUID(),
        });
        assertEquals(status, 429);
      });
    } finally {
      if (petId) await admin.from('pets').delete().eq('id', petId);
      if (sitId) await admin.from('pet_sits').delete().eq('id', sitId);
      await admin.from('rate_limit_hits').delete().in(
        'rate_key',
        users.map((u) => `invite-email:user:${u.userId}`),
      );
      for (const u of users) await deleteScratchUser(u.userId);
    }
  },
});
