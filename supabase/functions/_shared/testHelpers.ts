// Shared helpers for Deno tests that exercise deployed Edge Functions
// over HTTP against a real (non-production) Supabase project.
//
// These tests are integration tests, not unit tests: they call the
// already-deployed function via `fetch`, the same way the real frontend
// does, rather than importing and invoking the handler in-process. This
// is deliberate — the whole point is to catch auth/RLS/deploy-config
// problems a pure in-process unit test would miss.
//
// Required environment variables (see .env.example and
// docs/features/requirements-database-backups.md for the sibling
// pattern of scoping secrets to a specific project):
//   SUPABASE_URL              - the target project's URL (must be
//                                wysker-watch-dev, never production)
//   SUPABASE_ANON_KEY          - that project's anon/publishable key
//   SUPABASE_SERVICE_ROLE_KEY  - that project's service-role key, used
//                                only to create/inspect/clean up scratch
//                                test data, never to bypass the guard
//                                behavior under test
//   TEST2_EMAIL / TEST2_PASSWORD - login for the allowlisted test2@
//                                account, used only to exercise the
//                                account_type='test' guard path

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. These tests need SUPABASE_URL, ` +
        `SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TEST2_EMAIL, and ` +
        `TEST2_PASSWORD set for wysker-watch-dev — see supabase/functions/_shared/testHelpers.ts.`,
    );
  }
  return value;
}

export function functionsUrl(functionName: string): string {
  return `${requireEnv('SUPABASE_URL')}/functions/v1/${functionName}`;
}

export function adminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

// A signed-in scratch user, plus the tools to act as them and clean them
// up afterward. `client` is scoped to this user's own session (RLS
// applies), matching how a real browser session behaves.
export interface ScratchUser {
  userId: string;
  email: string;
  accessToken: string;
  client: SupabaseClient;
}

let scratchCounter = 0;

// Creates a throwaway, pre-confirmed auth user with a random password and
// signs in as them. Email is deliberately outside the test1@/test2@/demo1@
// allowlist (classify_account_type) so it gets account_type='production' —
// these are synthetic accounts, not a fifth account type.
export async function createScratchUser(label: string): Promise<ScratchUser> {
  const admin = adminClient();
  scratchCounter += 1;
  const email = `ci-scratch-${Date.now()}-${scratchCounter}-${label}@wyskerwatch.com`;
  const password = crypto.randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    throw new Error(`Failed to create scratch user ${email}: ${createError?.message}`);
  }

  const anon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));
  const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn?.session) {
    throw new Error(`Failed to sign in scratch user ${email}: ${signInError?.message}`);
  }

  return {
    userId: created.user.id,
    email,
    accessToken: signedIn.session.access_token,
    client: anon,
  };
}

// Best-effort cleanup — a scratch user that a test already deleted via
// delete-account will 404 here, which is expected, not a failure.
export async function deleteScratchUser(userId: string): Promise<void> {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}

export async function signIn(email: string, password: string): Promise<ScratchUser> {
  const anon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'));
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !data.user) {
    throw new Error(`Failed to sign in ${email}: ${error?.message}`);
  }
  return {
    userId: data.user.id,
    email,
    accessToken: data.session.access_token,
    client: anon,
  };
}

export async function callFunction(
  functionName: string,
  accessToken: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(functionsUrl(functionName), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: requireEnv('SUPABASE_ANON_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
