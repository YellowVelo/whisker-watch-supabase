// Integration test for spec 0075 (punch list PA-06/07/14): the deletion
// database functions from migration 0058 are server-only. A browser
// (logged out, or signed in as anyone) must never be able to call them,
// since prepare_account_deletion acts on whatever user id it is given.
//
// The deletion behavior itself is tested through the deployed functions in
// supabase/functions/delete-account/index.test.ts and delete-pet/index.test.ts.
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/account_deletion.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminClient, createScratchUser, deleteScratchUser, requireEnv } from '../functions/_shared/testHelpers.ts';

Deno.test('account deletion functions refuse logged-out and signed-in callers', async () => {
  const victim = await createScratchUser('deletion-rpc-victim');
  const caller = await createScratchUser('deletion-rpc-caller');
  try {
    const { data: pet } = await victim.client.from('pets')
      .insert({ name: 'Scratch RPC Pet', created_by: victim.userId }).select('id').single();
    const anon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));

    for (const [who, client] of [['logged out', anon], ['signed in', caller.client]] as const) {
      const prep = await client.rpc('prepare_account_deletion', { p_user_id: victim.userId, p_folder_paths: [] });
      assert(prep.error, `${who}: prepare_account_deletion must be refused`);
      const transfer = await client.rpc('transfer_pet_ownership', {
        p_pet_id: pet!.id, p_from_user: victim.userId, p_reason: 'pet_removed', p_handle_sits: true,
      });
      assert(transfer.error, `${who}: transfer_pet_ownership must be refused`);
    }

    const { data: petAfter } = await adminClient().from('pets').select('created_by').eq('id', pet!.id).single();
    assertEquals(petAfter?.created_by, victim.userId, 'nothing changed');
  } finally {
    await deleteScratchUser(victim.userId);
    await deleteScratchUser(caller.userId);
  }
});
