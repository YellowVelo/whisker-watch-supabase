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
//       delete the pet's photo from Storage (if any), delete the
//       `pets` row. Every child table cascades on pet_id. -> mode: 'deleted'
//   - Primary owner, pet has a linked co-owner:
//       ownership transfers to the oldest linked co-owner (same
//       tie-break rule as delete-account); the pet is NOT destroyed.
//       The new owner gets an in-app notification. -> mode: 'transferred'
//   - Co-owner (not primary):
//       only the caller's own pet_co_owners row is removed; the pet
//       and all its data are untouched. The primary owner gets an
//       in-app notification. -> mode: 'left'
//   - Caller has no relationship to the pet -> 403.

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

// Pulls the storage object path out of a public URL produced by
// storageClient.js's uploadFile(), e.g.
// https://.../storage/v1/object/public/uploads/<userId>/<file> -> "<userId>/<file>"
function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/object/public/uploads/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
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
    const userEmail = user.email ?? 'A co-owner';

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

    const { data: pet, error: petError } = await admin
      .from('pets')
      .select('id, name, created_by, photo_url')
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
        message: `${userEmail} removed themselves from ${pet.name}. You still have full access.`,
      });

      return json({ success: true, mode: 'left', pet_name: pet.name });
    }

    // ── Case: caller is primary owner ────────────────────────────────────
    const linked = (coOwners ?? []).filter(c => c.co_owner_user_id != null);

    if (linked.length > 0) {
      // Transfer ownership to the earliest linked co-owner; pet survives.
      const newOwner = linked[0];

      const { error: transferError } = await admin
        .from('pets')
        .update({ created_by: newOwner.co_owner_user_id })
        .eq('id', petId);

      if (transferError) {
        console.error('Error transferring pet:', transferError);
        return json({ error: `Failed to transfer ownership of "${pet.name}"` }, 500);
      }

      // The promoted co-owner no longer needs a pet_co_owners row (they
      // are now created_by directly).
      await admin
        .from('pet_co_owners')
        .delete()
        .eq('id', newOwner.id);

      // Any remaining co-owners' rows should now point at the new owner.
      await admin
        .from('pet_co_owners')
        .update({ owner_id: newOwner.co_owner_user_id })
        .eq('pet_id', petId)
        .neq('co_owner_user_id', newOwner.co_owner_user_id);

      await admin.from('notifications').insert({
        user_id: newOwner.co_owner_user_id,
        type: 'ownership_transfer',
        message: `${userEmail} removed ${pet.name} from their account. You are now the sole owner.`,
      });

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

    if (pet.photo_url) {
      const path = storagePathFromPublicUrl(pet.photo_url);
      if (path) {
        const { error: removeError } = await admin.storage.from('uploads').remove([path]);
        if (removeError) {
          // Non-fatal — log and continue; an orphaned storage object is
          // preferable to blocking the delete entirely.
          console.warn('Storage removal error (continuing):', removeError.message);
        }
      }
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

    return json({ success: true, mode: 'deleted', pet_name: pet.name });

  } catch (err) {
    console.error('delete-pet unexpected error:', err);
    return json({ error: (err as Error).message ?? 'Unknown error' }, 500);
  }
});
