// Supabase Edge Function: reset-sandbox-account
//
// Wipes all pets and pet-related data for the CALLING user, but only
// if that user's profile is account_type = 'test' or 'demo'. Never
// deletes the login/auth row, never touches any other user's data,
// and refuses outright for production accounts. Demo accounts use
// this same wipe before reseeding via SEED_SCENARIOS (see
// src/lib/seedTestData.js), same as test accounts do.
//
// Named "sandbox" (not "test") because it now covers both internal
// account types — a name that only mentioned "test" would be
// actively misleading about what it does for demo accounts.
//
// This is a separate code path from both delete-account and
// delete-pet — it's a bulk "start fresh" action for internal test
// and demo accounts, not a real user-facing deletion.
//
// Request body: none — always acts on the caller's own account.

import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { serverError } from '../_shared/errorReporting.ts';
import { deletableFilePaths, deletablePetPhotoPath } from '../_shared/petPhoto.ts';
import { listFolderPaths, removePaths } from '../_shared/storageFiles.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const userId = user.id;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Guard: only account_type = 'test' or 'demo' may run this ────────
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('account_type')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return json({ error: 'Failed to look up account' }, 500);
    }
    if (profile.account_type !== 'test' && profile.account_type !== 'demo') {
      return json({ error: 'This action is only available for test or demo accounts.' }, 403);
    }

    // ── Delete all pets this user solely or co-owns as primary ──────────
    const { data: ownedPets, error: petsError } = await admin
      .from('pets')
      .select('*')
      .eq('created_by', userId);

    if (petsError) {
      console.error('Error fetching owned pets:', petsError);
      return json({ error: 'Failed to look up pets' }, 500);
    }

    // Remembered before the delete: the wiped pets' ids (excluded from the
    // in-use check below) and their photo paths (a photo can sit outside
    // this user's folder, e.g. one a co-owner uploaded).
    const wipedPetIds = (ownedPets ?? []).map((p) => p.id as string);
    const wipedPhotoPaths = (ownedPets ?? []).map((p) => deletablePetPhotoPath(p));

    const { error: deleteOwnedError } = await admin
      .from('pets')
      .delete()
      .eq('created_by', userId);

    if (deleteOwnedError) {
      console.error('Error deleting owned pets:', deleteOwnedError);
      return json({ error: 'Failed to delete pets' }, 500);
    }

    // ── Remove this account as a co-owner on anyone else's pet ──────────
    // (Edge case — a test/demo account shouldn't normally be linked to a
    // real pet, but clean it up if it happened during testing.)
    const { error: coOwnerError } = await admin
      .from('pet_co_owners')
      .delete()
      .eq('co_owner_user_id', userId);

    if (coOwnerError) {
      console.warn('Error clearing co-owner links (continuing):', coOwnerError.message);
    }

    // ── Delete pet-sitting periods this account created as the owner ────
    // pet_sits.pet_ids is a plain uuid[] column, not a foreign key to
    // pets — deleting the owned pets above does NOT cascade-delete a
    // pet_sits row that references them, so it has to be done explicitly
    // here. pet_sit_logs and pet_sitter_access both have `on delete
    // cascade` foreign keys to pet_sits.id, so removing the pet_sits row
    // takes those with it in one step.
    const { error: petSitsError } = await admin
      .from('pet_sits')
      .delete()
      .eq('created_by', userId);

    if (petSitsError) {
      console.error('Error deleting pet sits:', petSitsError);
      return json({ error: 'Failed to delete pet sits' }, 500);
    }

    // ── Delete the wiped pets' photos and this user's folder ────────────
    // Every page of the folder, not just the first 100 (shared helpers,
    // spec 0075). Every file, folder or photo, goes through the same rule
    // as account deletion (migration 0058 step (e), spec 0083 FR3): it's
    // kept if a pet outside this wipe still uses it as its photo or a
    // scanned document, e.g. a photo this account uploaded for someone
    // else's pet it co-owns. The wiped pets are excluded so they don't
    // count against each other. Looked up in batches, not one query per
    // file. On a lookup error every file is kept and the error reported.
    let folderPaths: string[] = [];
    try {
      folderPaths = await listFolderPaths(admin, userId);
    } catch (err) {
      console.warn('Storage list error (continuing):', (err as Error).message);
    }
    try {
      const filesToDelete = await deletableFilePaths(admin, [...wipedPhotoPaths, ...folderPaths], wipedPetIds);
      const removeError = await removePaths(admin, filesToDelete);
      if (removeError) console.warn('Storage cleanup error (continuing):', removeError);
    } catch (err) {
      console.warn('Storage cleanup error (continuing):', (err as Error).message);
    }

    return json({ success: true });

  } catch (err) {
    return serverError(err, { function: 'reset-sandbox-account' }, corsHeaders);
  }
});
