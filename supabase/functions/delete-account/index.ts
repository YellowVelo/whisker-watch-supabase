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
// What happens, in order:
//   1. Auth check — reject any request without a valid session.
//   2. Find pets where this user is the primary owner (created_by).
//      - If co-owners exist: reassign created_by to the oldest co-owner,
//        delete the departing user's pet_co_owners rows, write an
//        in-app notification to the new primary owner.
//      - If sole-owned: leave as-is; the pet cascades when auth row goes.
//   3. Find pets where this user is a co-owner (not created_by).
//      Write an in-app notification to the primary owner, then the
//      pet_co_owners row cascades automatically in step 6.
//   4. Delete all Storage objects under uploads/{userId}/.
//   5. Delete the auth.users row (service-role). This is the last step —
//      it cascades: profiles, sole-owned pets and all their children,
//      remaining pet_co_owners rows, sitter access records.
//
// On any failure before step 5 the function returns an error without
// touching the auth row, so the account is never left half-deleted.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

    // All subsequent DB work uses the service-role client so it can
    // bypass RLS and act on rows across multiple users.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Prefer the caller's first name in notifications shown to the
    // other party — falling back to email only if they never set one
    // (there's no full profile/settings UI yet for editing this).
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('first_name')
      .eq('id', userId)
      .maybeSingle();
    const actorName = callerProfile?.first_name || user.email || 'A former co-owner';

    // ── 2. Handle pets where this user is the primary owner ──────────────
    const { data: ownedPets, error: petsError } = await admin
      .from('pets')
      .select('id, name')
      .eq('created_by', userId);

    if (petsError) {
      console.error('Error fetching owned pets:', petsError);
      return json({ error: 'Failed to look up owned pets' }, 500);
    }

    for (const pet of ownedPets ?? []) {
      // Find all co-owners for this pet, oldest tenure first.
      const { data: coOwners, error: coError } = await admin
        .from('pet_co_owners')
        .select('id, co_owner_user_id, co_owner_email, created_at')
        .eq('pet_id', pet.id)
        .order('created_at', { ascending: true });

      if (coError) {
        console.error(`Error fetching co-owners for pet ${pet.id}:`, coError);
        return json({ error: `Failed to look up co-owners for pet "${pet.name}"` }, 500);
      }

      // Filter to co-owners who have actually accepted (have a user_id linked).
      const linked = (coOwners ?? []).filter(c => c.co_owner_user_id != null);

      if (linked.length === 0) {
        // Sole-owned pet — will cascade-delete when auth row is removed. Nothing to do.
        continue;
      }

      // Transfer ownership to the earliest linked co-owner.
      const newOwner = linked[0];

      const { error: transferError } = await admin
        .from('pets')
        .update({ created_by: newOwner.co_owner_user_id })
        .eq('id', pet.id);

      if (transferError) {
        console.error(`Error transferring pet ${pet.id}:`, transferError);
        return json({ error: `Failed to transfer ownership of "${pet.name}"` }, 500);
      }

      // Remove the departing user's pet_co_owners rows for this pet.
      // (The cascade on auth.users deletion would do this too, but doing
      // it explicitly here keeps the state clean before the auth delete.)
      await admin
        .from('pet_co_owners')
        .delete()
        .eq('pet_id', pet.id)
        .eq('owner_id', userId);

      // Also update owner_id on remaining co-owner rows for this pet so
      // they correctly reference the new primary owner.
      await admin
        .from('pet_co_owners')
        .update({ owner_id: newOwner.co_owner_user_id })
        .eq('pet_id', pet.id)
        .neq('co_owner_user_id', newOwner.co_owner_user_id);

      // Write an in-app notification to the new primary owner.
      await admin.from('notifications').insert({
        user_id: newOwner.co_owner_user_id,
        type: 'ownership_transfer',
        message: `${actorName} deleted their account. You are now the sole owner of ${pet.name}.`,
      });
    }

    // ── 3. Handle pets where this user is a co-owner (not created_by) ───
    const { data: coOwnedRows, error: coOwnedError } = await admin
      .from('pet_co_owners')
      .select('pet_id, owner_id, pets(name)')
      .eq('co_owner_user_id', userId);

    if (coOwnedError) {
      console.error('Error fetching co-owned pets:', coOwnedError);
      return json({ error: 'Failed to look up co-owned pets' }, 500);
    }

    for (const row of coOwnedRows ?? []) {
      const petName = (row.pets as { name: string } | null)?.name ?? 'your pet';
      // Notify the primary owner that this co-owner is leaving.
      await admin.from('notifications').insert({
        user_id: row.owner_id,
        type: 'co_owner_removed',
        message: `${actorName} deleted their account and no longer has access to ${petName}.`,
      });
      // The pet_co_owners row itself cascades when the auth row is deleted (step 5).
    }

    // ── 4. Clean up Storage ──────────────────────────────────────────────
    // Delete all objects under uploads/{userId}/ in the uploads bucket.
    const { data: storageList, error: listError } = await admin.storage
      .from('uploads')
      .list(userId);

    if (listError) {
      // Non-fatal — log and continue. A missing/empty folder is fine.
      console.warn('Storage list error (continuing):', listError.message);
    } else if (storageList && storageList.length > 0) {
      const paths = storageList.map(f => `${userId}/${f.name}`);
      const { error: removeError } = await admin.storage
        .from('uploads')
        .remove(paths);
      if (removeError) {
        console.error('Storage removal error:', removeError);
        return json({ error: 'Failed to delete storage files' }, 500);
      }
    }

    // ── 5. Delete the auth.users row (must be last) ──────────────────────
    // This cascades: profiles, sole-owned pets (and all their child rows),
    // remaining pet_co_owners rows, pet_sitter_access rows.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('deleteUser error:', deleteError);
      return json({ error: 'Failed to delete account' }, 500);
    }

    return json({ success: true });

  } catch (err) {
    console.error('delete-account unexpected error:', err);
    return json({ error: (err as Error).message ?? 'Unknown error' }, 500);
  }
});
