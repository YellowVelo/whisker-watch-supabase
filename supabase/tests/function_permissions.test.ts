// Integration tests for spec 0077 (punch list PA-05, PA-29): who may run
// each database function (migration 0059). Run against wysker-watch-dev.
//
// Every function in public is in exactly one group:
//   - server-only: only the service role. Logged-out and signed-in callers
//     must get "permission denied" (42501), not a different error, so a
//     function that became callable but choked on dummy arguments can't
//     pass by accident.
//   - signed-in only: refused logged out, still works signed in.
//   - triggers: never callable directly (any error will do; PostgREST
//     doesn't even expose them).
// Two scratch users are created and signed in once for the whole file
// (Supabase Auth's sign-in limit — see co_owner_access.test.ts).
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/function_permissions.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  requireEnv,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

const ZERO = '00000000-0000-0000-0000-000000000000';

// Dummy arguments: just enough for PostgREST to find each function.
const SERVER_ONLY: Record<string, Record<string, unknown>> = {
  claim_email_idempotency_key: { p_idempotency_key: 'x', p_recipient_email: 'x@example.com', p_template_name: 'x' },
  process_resend_webhook_event: {
    p_event_id: 'x', p_event_type: 'email.delivered', p_provider_message_id: 'x',
    p_email: 'x@example.com', p_occurred_at: new Date().toISOString(),
  },
  email_has_password: { p_email: 'x@example.com' },
  compute_daily_analytics_summary: { target_date: '2026-01-01' },
  generate_vaccination_due_notifications: {},
  classify_account_type: { p_email: 'x@example.com' },
  check_and_record_rate_limit: { p_key: 'spec0077-probe', p_limit: 1, p_window_seconds: 1 },
  check_and_record_rate_limits: { p_keys: ['spec0077-probe'], p_limits: [1], p_window_seconds: 1 },
  check_and_record_rate_limits_windowed: { p_keys: ['spec0080-probe'], p_limits: [1], p_windows: [1] },
  get_auth_user_confirmation_state: { p_email: 'x@example.com' },
  prepare_account_deletion: { p_user_id: ZERO, p_folder_paths: [] },
  transfer_pet_ownership: { p_pet_id: ZERO, p_from_user: ZERO, p_reason: 'x', p_handle_sits: false },
  deletion_display_name: { p_user_id: ZERO, p_fallback: 'x' },
  deletion_hand_over_sit: { p_pet_sit_id: ZERO, p_new_owner: ZERO },
  deletion_sit_label: { p_pet_sit_id: ZERO },
  deletion_user_owns_pet: { p_pet_id: ZERO, p_user_id: ZERO },
};

const SIGNED_IN_ONLY: Record<string, Record<string, unknown>> = {
  is_pet_owner: { p_pet_id: ZERO, p_user_id: ZERO },
  is_pet_sitter: { p_pet_id: ZERO, p_user_id: ZERO },
  is_pet_sit_sitter: { p_pet_sit_id: ZERO, p_user_id: ZERO },
  is_primary_pet_owner: { p_pet_id: ZERO, p_user_id: ZERO },
  caller_owns_every_pet: { p_pet_ids: [ZERO] },
  caller_owns_pet_sit: { p_pet_sit_id: ZERO },
  pet_in_sit: { p_pet_sit_id: ZERO, p_pet_id: ZERO },
  pet_sit_is_open: { p_pet_sit_id: ZERO },
  claim_pending_co_owner_invites: {},
  claim_pending_sitter_invites: {},
  save_daily_check_ins: { payloads: [] },
};

const TRIGGERS = ['handle_new_user', 'set_updated_at', 'protect_privileged_profile_fields', 'validate_profile_timezone'];

function anonClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));
}

let a: ScratchUser;
let b: ScratchUser;

Deno.test({
  name: 'function permissions (spec 0077)',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    a = await createScratchUser('fnperm-a');
    b = await createScratchUser('fnperm-b');
    try {
      await t.step('AC1: logged-out callers are refused every server-only and signed-in-only function', async () => {
        const anon = anonClient();
        for (const [fn, args] of Object.entries({ ...SERVER_ONLY, ...SIGNED_IN_ONLY })) {
          const { error } = await anon.rpc(fn, args);
          assertEquals(error?.code, '42501', `${fn} must be refused logged out (got ${error?.code} ${error?.message})`);
        }
      });

      await t.step('AC2: signed-in callers are refused every server-only function', async () => {
        for (const [fn, args] of Object.entries(SERVER_ONLY)) {
          const { error } = await a.client.rpc(fn, args);
          assertEquals(error?.code, '42501', `${fn} must be refused signed in (got ${error?.code} ${error?.message})`);
        }
      });

      await t.step('AC1/AC2: trigger functions are never callable directly', async () => {
        for (const fn of TRIGGERS) {
          const { error: anonError } = await anonClient().rpc(fn, {});
          assert(anonError, `${fn} must not be callable logged out`);
          const { error: userError } = await a.client.rpc(fn, {});
          assert(userError, `${fn} must not be callable signed in`);
        }
      });

      await t.step('AC2: signed-in-only functions still work signed in', async () => {
        for (const [fn, args] of Object.entries(SIGNED_IN_ONLY)) {
          const { error } = await a.client.rpc(fn, args);
          assertEquals(error, null, `${fn} must still work signed in (got ${error?.code} ${error?.message})`);
        }
      });

      await t.step('AC3: a signed-in user cannot fake a bounce', async () => {
        const victim = `spec0077-victim-${Date.now()}@example.com`;
        const { error } = await a.client.rpc('process_resend_webhook_event', {
          p_event_id: `fake-${crypto.randomUUID()}`,
          p_event_type: 'email.bounced',
          p_provider_message_id: 'fake',
          p_email: victim,
          p_occurred_at: new Date().toISOString(),
        });
        assertEquals(error?.code, '42501');
        const { data } = await adminClient().from('email_suppressions').select('email').eq('email', victim);
        assertEquals(data?.length ?? 0, 0, 'no suppression row may be written');
      });

      await t.step('AC5: is_pet_owner only answers about the caller', async () => {
        const { data: petA, error: petError } = await a.client
          .from('pets')
          .insert({ name: 'Scratch Perm Pet A', created_by: a.userId })
          .select('id')
          .single();
        if (petError || !petA) throw new Error(`pet insert failed: ${petError?.message}`);
        try {
          const { data: own } = await a.client.rpc('is_pet_owner', { p_pet_id: petA.id, p_user_id: a.userId });
          assertEquals(own, true, 'owner asking about themselves');
          const { data: other } = await b.client.rpc('is_pet_owner', { p_pet_id: petA.id, p_user_id: a.userId });
          assertEquals(other, false, 'B asking about A must get false');
        } finally {
          await adminClient().from('pets').delete().eq('id', petA.id);
        }
      });

      await t.step('AC6: new-user and updated_at triggers still run', async () => {
        const { data: profile } = await adminClient()
          .from('profiles')
          .select('account_type')
          .eq('id', a.userId)
          .single();
        assertEquals(profile?.account_type, 'production', 'handle_new_user + classify_account_type ran');

        const { data: pet, error: petError } = await a.client
          .from('pets')
          .insert({ name: 'Scratch Perm Pet Updated', created_by: a.userId })
          .select('id, updated_at')
          .single();
        if (petError || !pet) throw new Error(`pet insert failed: ${petError?.message}`);
        try {
          await new Promise((r) => setTimeout(r, 1100));
          const { data: after, error: updateError } = await a.client
            .from('pets')
            .update({ name: 'Scratch Perm Pet Renamed' })
            .eq('id', pet.id)
            .select('updated_at')
            .single();
          assertEquals(updateError, null);
          assert(new Date(after!.updated_at) > new Date(pet.updated_at), 'set_updated_at ran');
        } finally {
          await adminClient().from('pets').delete().eq('id', pet.id);
        }
      });
    } finally {
      await deleteScratchUser(a.userId);
      await deleteScratchUser(b.userId);
    }
  },
});
