// Supabase Edge Function: delete-account
//
// Permanently deletes the authenticated caller's account, satisfying
// Apple App Store guideline 5.1.1(v) and the Privacy Policy commitment.
//
// Must run server-side because deleting an auth.users row requires the
// service-role key, which must never be exposed to the browser.
//
// Request body: none — the user ID is always taken from the verified
// JWT, never from the request body, so a caller can never delete
// someone else's account by tampering with the payload.
//
// What happens, in order (spec 0075):
//   1. Auth check — reject any request without a valid session.
//   2. Guard: refuse for account_type 'test'/'demo' (see below).
//   3. List every file in the user's storage folder (all pages).
//   4. prepare_account_deletion() (migration 0058) does every database
//      step in ONE all-or-nothing transaction: pets the user is primary
//      owner of pass to their oldest linked co-owner (every other
//      co-owner keeps access); the user's co-owner links are removed and
//      the primary owners notified; pet sits and sitter invites they set
//      up pass to the pets' surviving owner, or end if no one owns all of
//      the sit's pets; beta/early-adopter signups are removed. It returns
//      the files to delete: the folder's files plus the photo and
//      documents of pets being deleted, minus any file a surviving pet
//      still uses (a transferred pet keeps its photo and documents).
//   5. Delete those files, 100 at a time.
//   6. Delete the auth.users row. This cascades: profile, pets with no
//      co-owner (and all their records), notifications, analytics events,
//      sitter invites addressed to this user. Records this user entered on
//      surviving pets are kept, with created_by cleared (0058).
//
// If step 4 fails, nothing has changed. If step 5 or 6 fails, the
// database work is already done but the account still exists; the caller
// gets an error and can simply try again: step 4 is safe to run twice
// (nothing is transferred or notified a second time), and the remaining
// files are listed afresh.
//
// The guard in step 2 exists because this function has no other
// protection against deleting the shared internal test/demo identities
// (unlike reset-sandbox-account, which exists specifically to wipe
// test/demo *data* without ever touching the login row). Losing one of
// those accounts to a misdirected call — a bad CI run, a manual test
// against the wrong project — would mean recreating it by hand in
// Supabase Auth and re-running the account_type allowlist migration.
// Production and owner accounts are unaffected by this guard.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { reportError } from '../_shared/errorReporting.ts';
import { listFolderPaths, removePaths } from '../_shared/storageFiles.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RETRY_HINT = 'Please try again. If it keeps failing, contact support.';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Every failure is sent to Sentry as well as the function log (spec 0068
// P1-6: early-return errors used to reach only the console).
function fail(step: string, detail: unknown, message: string) {
  console.error(`delete-account ${step}:`, detail);
  reportError(detail instanceof Error ? detail : new Error(`${step}: ${JSON.stringify(detail)}`), {
    function: 'delete-account',
    step,
  });
  return json({ error: message }, 500);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── 1. Auth check ────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    // Use the caller's own JWT to verify their identity.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const userId = user.id;

    // All subsequent work uses the service-role client so it can act on
    // rows across multiple users.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2. Guard: refuse for account_type 'test'/'demo' ───────────────────
    const { data: callerAccount, error: accountError } = await admin
      .from('profiles')
      .select('account_type')
      .eq('id', userId)
      .single();

    if (accountError || !callerAccount) {
      return fail('lookup_account', accountError, 'Failed to look up account');
    }
    if (callerAccount.account_type === 'test' || callerAccount.account_type === 'demo') {
      return json(
        { error: 'This account cannot be deleted this way. Use Reset Test/Demo Account in Menu instead.' },
        403,
      );
    }

    // ── 3. List the user's files ─────────────────────────────────────────
    let folderPaths: string[];
    try {
      folderPaths = await listFolderPaths(admin, userId);
    } catch (err) {
      return fail('list_files', err, `We couldn't delete your account. ${RETRY_HINT}`);
    }

    // ── 4. All database steps, in one transaction ────────────────────────
    const { data: prepared, error: prepareError } = await admin.rpc('prepare_account_deletion', {
      p_user_id: userId,
      p_folder_paths: folderPaths,
    });
    if (prepareError || !prepared) {
      return fail('prepare', prepareError, `We couldn't delete your account. ${RETRY_HINT}`);
    }

    // ── 5. Delete files ──────────────────────────────────────────────────
    const filesToDelete: string[] = prepared.files_to_delete ?? [];
    const removeError = await removePaths(admin, filesToDelete);
    if (removeError) {
      return fail('remove_files', removeError, `We couldn't finish deleting your account. ${RETRY_HINT}`);
    }

    // ── 6. Delete the auth.users row (must be last) ──────────────────────
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return fail('delete_user', deleteError, `We couldn't finish deleting your account. ${RETRY_HINT}`);
    }

    return json({ success: true });

  } catch (err) {
    console.error('delete-account unexpected error:', err);
    reportError(err, { function: 'delete-account' });
    return json({ error: (err as Error).message ?? 'Unknown error' }, 500);
  }
});
