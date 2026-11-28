// Integration tests for spec 0086 (punch list PA-13, PA-18; migration
// 0064). Run against wysker-watch-dev.
//
//   * AC9: a signed-in person can't set or change their own consent record
//     (terms_accepted_at, terms_version, privacy_version) but can still
//     change marketing_opt_in. Logged-out callers and other users can't
//     touch it either; the service role (finish-account-setup) can.
//   * AC14: both invite-claim functions only link a confirmed email. An
//     unconfirmed account has no normal way to sign in, so this can't be
//     run as that account; it's a wording check on the newest migration
//     that defines each function (spec 0086, Before You Approve #9).
//   * AC16: after the migration, no unconfirmed account (other than test
//     scratch users and accounts under an hour old) has a password or a
//     consent record (FR9), 0064 contains the step that clears it, and
//     every allowlisted test/demo fixture account has consent recorded.
//
// Two scratch users are created and signed in once for the whole file
// (Supabase Auth's sign-in limit, see co_owner_access.test.ts). Each check
// starts from its own known profile state, set with the service role.
//
// Run: deno test --allow-net --allow-env --allow-read --node-modules-dir=none supabase/tests/account_setup_consent.test.ts

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  requireEnv,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';
import { PRIVACY_VERSION, TOS_VERSION } from '../functions/_shared/legalVersions.ts';

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

interface ConsentRow {
  terms_accepted_at: string | null;
  terms_version: string | null;
  privacy_version: string | null;
  marketing_opt_in: boolean;
}

async function readConsent(userId: string): Promise<ConsentRow> {
  const { data, error } = await adminClient()
    .from('profiles')
    .select('terms_accepted_at, terms_version, privacy_version, marketing_opt_in')
    .eq('id', userId)
    .single();
  if (error || !data) throw new Error(`profile read failed: ${error?.message}`);
  return data as ConsentRow;
}

// Service-role reset to a known state before each check.
async function setConsent(userId: string, row: Partial<ConsentRow>): Promise<void> {
  const { error } = await adminClient().from('profiles').update(row).eq('id', userId);
  if (error) throw new Error(`service-role profile update failed: ${error.message}`);
}

const NO_CONSENT: ConsentRow = {
  terms_accepted_at: null,
  terms_version: null,
  privacy_version: null,
  marketing_opt_in: false,
};

const RECORDED: ConsentRow = {
  terms_accepted_at: '2026-11-01T00:00:00+00:00',
  terms_version: TOS_VERSION,
  privacy_version: PRIVACY_VERSION,
  marketing_opt_in: false,
};

// One attempted change per consent column, from both starting states
// (writing a first record, and rewriting an existing one).
const CONSENT_CHANGES: { column: keyof ConsentRow; value: string }[] = [
  { column: 'terms_accepted_at', value: '2030-01-01T00:00:00+00:00' },
  { column: 'terms_version', value: 'a version nobody agreed to' },
  { column: 'privacy_version', value: 'a version nobody agreed to' },
];

Deno.test('account setup consent (spec 0086)', async (t) => {
  let person: ScratchUser | null = null;
  let stranger: ScratchUser | null = null;
  try {
    person = await createScratchUser('consent-person');
    stranger = await createScratchUser('consent-stranger');
    const me = person;
    const other = stranger;

    for (const start of [{ label: 'no consent yet', row: NO_CONSENT }, { label: 'consent recorded', row: RECORDED }]) {
      for (const change of CONSENT_CHANGES) {
        await t.step(`AC9: a signed-in person can't change their own ${change.column} (${start.label})`, async () => {
          await setConsent(me.userId, start.row);
          const { error } = await me.client
            .from('profiles')
            .update({ [change.column]: change.value })
            .eq('id', me.userId);
          assertExists(error, `the update of ${change.column} should be refused`);
          const after = await readConsent(me.userId);
          assertEquals(after[change.column], start.row[change.column]);
        });
      }
    }

    await t.step('AC9: a signed-in person can turn marketing_opt_in on and off', async () => {
      await setConsent(me.userId, RECORDED);
      const on = await me.client.from('profiles').update({ marketing_opt_in: true }).eq('id', me.userId).select('id');
      assertEquals(on.error, null);
      assertEquals(on.data?.length, 1);
      assertEquals((await readConsent(me.userId)).marketing_opt_in, true);

      const off = await me.client.from('profiles').update({ marketing_opt_in: false }).eq('id', me.userId).select('id');
      assertEquals(off.error, null);
      assertEquals(off.data?.length, 1);
      const after = await readConsent(me.userId);
      assertEquals(after.marketing_opt_in, false);
      // The consent record itself is untouched by a marketing change.
      assertEquals(after.terms_version, RECORDED.terms_version);
      assertEquals(after.privacy_version, RECORDED.privacy_version);
    });

    await t.step('AC9: another signed-in user can\'t change someone else\'s consent or marketing', async () => {
      await setConsent(me.userId, NO_CONSENT);
      const { data } = await other.client
        .from('profiles')
        .update({ terms_accepted_at: '2030-01-01T00:00:00+00:00', terms_version: 'x', privacy_version: 'x', marketing_opt_in: true })
        .eq('id', me.userId)
        .select('id');
      assertEquals(data?.length ?? 0, 0);
      assertEquals(await readConsent(me.userId), NO_CONSENT);
    });

    await t.step('AC9: a logged-out caller can\'t change anyone\'s consent or marketing', async () => {
      await setConsent(me.userId, NO_CONSENT);
      const anon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await anon
        .from('profiles')
        .update({ terms_accepted_at: '2030-01-01T00:00:00+00:00', terms_version: 'x', privacy_version: 'x', marketing_opt_in: true })
        .eq('id', me.userId)
        .select('id');
      assertEquals(data?.length ?? 0, 0);
      assertEquals(await readConsent(me.userId), NO_CONSENT);
    });

    await t.step('AC9: the service role (finish-account-setup) can still record consent', async () => {
      await setConsent(me.userId, NO_CONSENT);
      const at = new Date().toISOString();
      await setConsent(me.userId, { terms_accepted_at: at, terms_version: TOS_VERSION, privacy_version: PRIVACY_VERSION });
      const after = await readConsent(me.userId);
      assertEquals(new Date(after.terms_accepted_at ?? '').toISOString(), at);
      assertEquals(after.terms_version, TOS_VERSION);
      assertEquals(after.privacy_version, PRIVACY_VERSION);
    });

    await t.step('a new account starts with no consent recorded, even if sign-up metadata claims it', async () => {
      const admin = adminClient();
      const email = `ci-scratch-${Date.now()}-metadata-consent@wyskerwatch.com`;
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          first_name: 'Scratch',
          terms_accepted_at: '2026-11-01T00:00:00Z',
          terms_version: TOS_VERSION,
          privacy_version: PRIVACY_VERSION,
          marketing_opt_in: true,
        },
      });
      if (error || !created?.user) throw new Error(`createUser failed: ${error?.message}`);
      try {
        assertEquals(await readConsent(created.user.id), NO_CONSENT);
        const { data: profile } = await admin.from('profiles').select('first_name').eq('id', created.user.id).single();
        assertEquals(profile?.first_name, 'Scratch');
      } finally {
        await deleteScratchUser(created.user.id);
      }
    });
  } finally {
    if (person) await deleteScratchUser(person.userId);
    if (stranger) await deleteScratchUser(stranger.userId);
  }
});

// The SQL text of the newest migration's definition of a function.
async function newestDefinition(functionName: string): Promise<{ file: string; body: string }> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && entry.name.endsWith('.sql')) files.push(entry.name);
  }
  files.sort();
  const header = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(`, 'i');
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = await Deno.readTextFile(new URL(file, MIGRATIONS_DIR));
    const match = header.exec(sql);
    if (!match) continue;
    // The function body runs to the closing $$; of its dollar quote.
    const start = match.index;
    const open = sql.indexOf('$$', start);
    const close = sql.indexOf('$$', open + 2);
    found = { file, body: sql.slice(start, close + 2) };
  }
  if (!found) throw new Error(`no migration defines public.${functionName}`);
  return found;
}

for (const fn of ['claim_pending_co_owner_invites', 'claim_pending_sitter_invites']) {
  Deno.test(`AC14: ${fn}() links invites only for a confirmed email`, async () => {
    const { file, body } = await newestDefinition(fn);
    assert(file >= '0064', `newest definition is in ${file}, expected 0064 or later`);
    const lookup = /select\s+email\s+from\s+auth\.users\s+where\s+id\s*=\s*auth\.uid\(\)\s+and\s+email_confirmed_at\s+is\s+not\s+null/i;
    assert(lookup.test(body), `${file}: the caller lookup must require email_confirmed_at is not null`);
    assert(/security\s+definer/i.test(body), `${file}: must stay security definer`);
    assert(/set\s+search_path\s*=\s*public/i.test(body), `${file}: must keep search_path = public`);
  });
}

// AC16 checks only what migration 0064 is responsible for, not a global
// invariant over shared dev. Other test files deliberately create the very
// accounts these checks forbid (finish-account-setup/index.test.ts makes an
// unconfirmed account with a password; invite_emails.test.ts and others set
// scratch users to account_type 'test' without consent; the sign-up tests
// create unconfirmed accounts), dev's public sign-up is open, and the
// edge-functions CI job has no concurrency group. A whole-project scan
// would flake whenever another run is in flight or a killed run left
// scratch users behind.

// The fixed fixture accounts on the allowlist: every address
// classify_account_type() maps to 'test' or 'demo' (newest definition:
// migration 0053). Migration 0064 fills consent for exactly these. Keep in
// step with any later allowlist migration.
const ALLOWLIST_FIXTURE_EMAILS = [
  'test1@wyskerwatch.com',
  'test2@wyskerwatch.com',
  'test3@wyskerwatch.com',
  'test4@wyskerwatch.com',
  'coowner1@wyskerwatch.com',
  'coowner2@wyskerwatch.com',
  'petsitter1@wyskerwatch.com',
  'petsitter2@wyskerwatch.com',
  'demo1@wyskerwatch.com',
];

// Addresses this repo's Deno tests create for themselves
// (_shared/testHelpers.ts createScratchUser and every scratchEmail helper
// use `ci-scratch-<time>-...@wyskerwatch.com`).
const SCRATCH_EMAIL = /^ci-scratch-.*@wyskerwatch\.com$/i;

// Only accounts older than this are checked by the password half. Excluding
// the scratch pattern covers this repo's tests; the age cut-off also covers
// anything another in-flight run (or a sign-up on dev's open page) made
// after the migration ran, which 0064's one-time wipe can't have touched.
const MIN_ACCOUNT_AGE_MS = 60 * 60 * 1000;

// Unconfirmed accounts older than MIN_ACCOUNT_AGE_MS, scratch users left out.
async function oldUnconfirmedAccounts(): Promise<{ id: string; email: string }[]> {
  const admin = adminClient();
  const cutoff = Date.now() - MIN_ACCOUNT_AGE_MS;
  const unconfirmed: { id: string; email: string }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const user of data.users) {
      if (user.email_confirmed_at || !user.email) continue;
      if (SCRATCH_EMAIL.test(user.email)) continue;
      if (new Date(user.created_at).getTime() > cutoff) continue;
      unconfirmed.push({ id: user.id, email: user.email });
    }
    if (data.users.length < 1000) break;
  }
  return unconfirmed;
}

Deno.test('AC16: no unconfirmed account has a password', async () => {
  // listUsers shows confirmation but not passwords; email_has_password()
  // (server-only, migration 0020) answers the password half.
  const admin = adminClient();
  const unconfirmed = (await oldUnconfirmedAccounts()).map((user) => user.email);
  const withPassword: string[] = [];
  for (const email of unconfirmed) {
    const { data, error } = await admin.rpc('email_has_password', { p_email: email });
    if (error) throw new Error(`email_has_password failed: ${error.message}`);
    if (data === true) withPassword.push(email);
  }
  assertEquals(withPassword, [], 'unconfirmed accounts that still have a password');
});

Deno.test('AC16 (FR9): no unconfirmed account has consent recorded', async () => {
  // Consent on an unconfirmed account came from whoever filled in the old
  // sign-up form. 0064 clears it so the inbox owner gets the finish page
  // instead of reaching the app with a wiped password.
  const ids = (await oldUnconfirmedAccounts()).map((user) => user.id);
  const withConsent: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await adminClient()
      .from('profiles')
      .select('email, terms_accepted_at, terms_version, privacy_version')
      .in('id', ids.slice(i, i + 100));
    if (error) throw new Error(`profiles read failed: ${error.message}`);
    for (const row of data ?? []) {
      if (row.terms_accepted_at !== null || row.terms_version !== null || row.privacy_version !== null) {
        withConsent.push(row.email);
      }
    }
  }
  assertEquals(withConsent, [], 'unconfirmed accounts that still have consent recorded');
});

Deno.test('AC16 (FR9): migration 0064 clears consent on unconfirmed accounts before the trigger change', async () => {
  const sql = await Deno.readTextFile(new URL('0064_account_setup_consent.sql', MIGRATIONS_DIR));
  const clearing = /update\s+public\.profiles\s+p\s+set\s+terms_accepted_at\s*=\s*null\s*,\s*terms_version\s*=\s*null\s*,\s*privacy_version\s*=\s*null\s+from\s+auth\.users\s+u\s+where\s+u\.id\s*=\s*p\.id\s+and\s+u\.email_confirmed_at\s+is\s+null/i;
  const match = clearing.exec(sql);
  assert(match, '0064 must clear terms_accepted_at, terms_version and privacy_version where email_confirmed_at is null');
  const trigger = sql.search(/create\s+or\s+replace\s+function\s+public\.protect_privileged_profile_fields/i);
  assert(trigger > 0, '0064 must redefine protect_privileged_profile_fields()');
  assert(match.index < trigger, 'the clearing step must come before the protect-trigger redefinition');
});

Deno.test('AC16: every test/demo fixture account has consent recorded', async () => {
  // Only the fixed allowlist accounts; scratch users other tests set to
  // 'test' are not fixtures. An address with no account on this project
  // simply returns no row and is skipped.
  const { data, error } = await adminClient()
    .from('profiles')
    .select('email, account_type, terms_accepted_at')
    .in('email', ALLOWLIST_FIXTURE_EMAILS);
  if (error) throw new Error(`profiles read failed: ${error.message}`);
  const missing = (data ?? []).filter((row) => row.terms_accepted_at === null).map((row) => row.email);
  assertEquals(missing, [], 'allowlisted fixture accounts with no consent recorded');
});
