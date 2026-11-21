// Supabase Edge Function: delete-pet
//
// Permanently deletes ONE pet the caller owns (or removes the caller's
// own access to a shared pet). This is a deliberately separate code
// path from delete-account — it never touches auth.users, never acts
// on any pet other than the one requested, and every mutation is
// scoped by pet_id + an explicit ownership check performed here.
//
// Must run server-side because reassigning ownership of a shared pet
// and notifying the other owner both require writing rows that belong
// to a different user than the caller (pet_co_owners.owner_id,
// notifications) — the RLS policies on those tables intentionally
// don't allow a regular user to do that with their own JWT.
//
// Request body: { pet_id: string }
//
// Behavior depends on the caller's relationship to the pet:
//   - Sole owner (created_by, no linked co-owners):
//       delete the `pets` row (every child table cascades on pet_id),
//       then its photo and scanned documents from Storage, except a
//       document also linked to another pet (spec 0075). -> mode: 'deleted'
//   - Primary owner, pet has a linked co-owner:
//       transfer_pet_ownership() (migration 0058, shared with
//       delete-account) passes the pet to the oldest linked co-owner in
//       one transaction: every other co-owner keeps access, the caller's
//       pet sits for this pet pass on (or the pet is taken out of a sit
//       that also covers the caller's other pets), and the new owner is
//       notified. The pet is NOT destroyed. -> mode: 'transferred'
//   - Co-owner (not primary):
//       only the caller's own pet_co_owners row is removed; the pet
//       and all its data are untouched. The primary owner gets an
//       in-app notification. -> mode: 'left'
//   - Caller has no relationship to the pet -> 403.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { reportError } from '../_shared/errorReporting.ts';
import { deletablePetPhotoPath } from '../_shared/petPhoto.ts';
import { removePaths } from '../_shared/storageFiles.ts';

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
    // ── Auth check ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const userId = user.id;

    // ── Parse & validate request body ──────────────────────────────────
    let petId: string | undefined;
    try {
      const body = await req.json();
      petId = body?.pet_id;
    } catch {
      // no/invalid JSON body
    }
    if (!petId || typeof petId !== 'string') {
      return json({ error: 'Missing pet_id' }, 400);
    }

    // All subsequent DB work uses the service-role client so it can
    // write notifications and reassign ownership for another user.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Prefer the caller's first name in notifications shown to the
    // other party — falling back to email only if they never set one
    // (there's no full profile/settings UI yet for editing this).
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('first_name')
      .eq('id', userId)
      .maybeSingle();
    const actorName = callerProfile?.first_name || user.email || 'A co-owner';

    const { data: pet, error: petError } = await admin
      .from('pets')
      .select('*')
      .eq('id', petId)
      .maybeSingle();

    if (petError) {
      console.error('Error fetching pet:', petError);
      return json({ error: 'Failed to look up pet' }, 500);
    }
    if (!pet) return json({ error: 'Pet not found' }, 404);

    const isPrimary = pet.created_by === userId;

    const { data: coOwners, error: coError } = await admin
      .from('pet_co_owners')
      .select('id, owner_id, co_owner_user_id, co_owner_email, created_at')
      .eq('pet_id', petId)
      .order('created_at', { ascending: true });

    if (coError) {
      console.error('Error fetching co-owners:', coError);
      return json({ error: 'Failed to look up co-owners for this pet' }, 500);
    }

    const myCoOwnerRow = (coOwners ?? []).find(c => c.co_owner_user_id === userId);

    if (!isPrimary && !myCoOwnerRow) {
      return json({ error: 'You do not have access to this pet' }, 403);
    }

    // ── Case: caller is a co-owner (not primary) — just leave ───────────
    if (!isPrimary) {
      const { error: leaveError } = await admin
        .from('pet_co_owners')
        .delete()
        .eq('pet_id', petId)
        .eq('co_owner_user_id', userId);

      if (leaveError) {
        console.error('Error removing co-owner row:', leaveError);
        return json({ error: 'Failed to remove your access to this pet' }, 500);
      }

      await admin.from('notifications').insert({
        user_id: pet.created_by,
        type: 'co_owner_removed',
        message: `${actorName} removed themselves from ${pet.name}. You still have full access.`,
      });

      return json({ success: true, mode: 'left', pet_name: pet.name });
    }

    // ── Case: caller is primary owner ────────────────────────────────────
    const linked = (coOwners ?? []).filter(c => c.co_owner_user_id != null);

    if (linked.length > 0) {
      // Pass the pet to the earliest linked co-owner; pet survives. One
      // database transaction (0058), so a failure leaves nothing half-done.
      const { data: newOwner, error: transferError } = await admin.rpc('transfer_pet_ownership', {
        p_pet_id: petId,
        p_from_user: userId,
        p_reason: 'pet_removed',
        p_handle_sits: true,
      });

      if (transferError || !newOwner) {
        console.error('Error transferring pet:', transferError);
        reportError(transferError ?? new Error('transfer_pet_ownership returned no new owner'), {
          function: 'delete-pet',
          step: 'transfer',
        });
        return json({ error: `Failed to transfer ownership of "${pet.name}"` }, 500);
      }

      return json({ success: true, mode: 'transferred', pet_name: pet.name });
    }

    // ── Sole owner — permanent delete ────────────────────────────────────

    // pet_sits.pet_ids is a uuid[] with no foreign key (Postgres can't
    // enforce referential integrity on array elements), so deleting the
    // pets row would otherwise leave this pet's id dangling inside any
    // pet_sits record it was part of — which crashes sitter-side pet
    // lookups (entities.Pet.get on a nonexistent id throws). Strip it
    // out (or drop the pet_sits row entirely if it becomes empty) BEFORE
    // deleting the pet, and abort the whole delete if this fails, so we
    // never end up with a pet gone but a dangling reference left behind.
    const { data: affectedSits, error: sitsLookupError } = await admin
      .from('pet_sits')
      .select('id, pet_ids')
      .contains('pet_ids', [petId]);

    if (sitsLookupError) {
      console.error('Error looking up pet_sits for pet:', sitsLookupError);
      return json({ error: 'Failed to check pet-sitting records for this pet' }, 500);
    }

    for (const sit of affectedSits ?? []) {
      const remainingPetIds = (sit.pet_ids ?? []).filter((id: string) => id !== petId);
      if (remainingPetIds.length === 0) {
        // This pet was the only one covered by the sit — remove the
        // whole record (pet_sit_logs/pet_sitter_access cascade from it).
        const { error: sitDeleteError } = await admin.from('pet_sits').delete().eq('id', sit.id);
        if (sitDeleteError) {
          console.error('Error deleting empty pet_sits record:', sitDeleteError);
          return json({ error: 'Failed to clean up pet-sitting records for this pet' }, 500);
        }
      } else {
        const { error: sitUpdateError } = await admin
          .from('pet_sits')
          .update({ pet_ids: remainingPetIds })
          .eq('id', sit.id);
        if (sitUpdateError) {
          console.error('Error updating pet_sits record:', sitUpdateError);
          return json({ error: 'Failed to clean up pet-sitting records for this pet' }, 500);
        }
      }
    }

    // Files to delete once the pet is gone: its photo, and each scanned
    // document not also linked to another pet (a scan can cover several
    // pets, spec 0061/0071). Looked up now, because the pet_documents rows
    // cascade away with the pet.
    const { data: docs, error: docsError } = await admin
      .from('pet_documents')
      .select('storage_path')
      .eq('pet_id', petId);
    if (docsError) {
      console.error('Error looking up pet documents:', docsError);
      return json({ error: 'Failed to look up documents for this pet' }, 500);
    }
    const docPaths = [...new Set((docs ?? []).map((d) => d.storage_path as string))];
    let sharedDocPaths = new Set<string>();
    if (docPaths.length > 0) {
      const { data: shared, error: sharedError } = await admin
        .from('pet_documents')
        .select('storage_path')
        .in('storage_path', docPaths)
        .neq('pet_id', petId);
      if (sharedError) {
        console.error('Error checking shared documents:', sharedError);
        return json({ error: 'Failed to look up documents for this pet' }, 500);
      }
      sharedDocPaths = new Set((shared ?? []).map((d) => d.storage_path as string));
    }

    const { error: deleteError } = await admin
      .from('pets')
      .delete()
      .eq('id', petId)
      .eq('created_by', userId);

    if (deleteError) {
      console.error('Error deleting pet:', deleteError);
      return json({ error: 'Failed to delete pet' }, 500);
    }

    const photoPath = deletablePetPhotoPath(pet);
    const filesToDelete = [
      ...(photoPath ? [photoPath] : []),
      ...docPaths.filter((p) => !sharedDocPaths.has(p) && !p.startsWith('shared/')),
    ];
    const removeError = await removePaths(admin, filesToDelete);
    if (removeError) {
      // Non-fatal: the pet is already gone and nobody can open these files
      // any more (the storage read rule follows the pet). Reported so a
      // leftover file can be cleaned up by hand.
      console.warn('Storage removal error (continuing):', removeError);
      reportError(new Error(`delete-pet storage cleanup: ${removeError}`), { function: 'delete-pet', step: 'remove_files' });
    }

    return json({ success: true, mode: 'deleted', pet_name: pet.name });

  } catch (err) {
    console.error('delete-pet unexpected error:', err);
    reportError(err, { function: 'delete-pet' });
    return json({ error: (err as Error).message ?? 'Unknown error' }, 500);
  }
});
