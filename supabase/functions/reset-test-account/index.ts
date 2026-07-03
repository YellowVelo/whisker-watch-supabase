// Supabase Edge Function: reset-test-account
//
// Wipes all pets and pet-related data for the CALLING user, but only
// if that user's profile is account_type = 'test'. Never deletes the
// login/auth row, never touches any other user's data (production or
// demo), and refuses outright for non-test accounts.
//
// This is a separate code path from both delete-account and
// delete-pet — it's a bulk "start fresh" action for internal test
// accounts, not a real user-facing deletion.
//
// Request body: none — always acts on the caller's own account.

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

function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/object/public/uploads/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
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

    // ── Guard: only account_type = 'test' may run this ──────────────────
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('account_type')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return json({ error: 'Failed to look up account' }, 500);
    }
    if (profile.account_type !== 'test') {
      return json({ error: 'This action is only available for test accounts.' }, 403);
    }

    // ── Delete all pets this user solely or co-owns as primary ──────────
    const { data: ownedPets, error: petsError } = await admin
      .from('pets')
      .select('id, photo_url')
      .eq('created_by', userId);

    if (petsError) {
      console.error('Error fetching owned pets:', petsError);
      return json({ error: 'Failed to look up pets' }, 500);
    }

    for (const pet of ownedPets ?? []) {
      if (pet.photo_url) {
        const path = storagePathFromPublicUrl(pet.photo_url);
        if (path) {
          const { error: removeError } = await admin.storage.from('uploads').remove([path]);
          if (removeError) console.warn('Storage removal error (continuing):', removeError.message);
        }
      }
    }

    const { error: deleteOwnedError } = await admin
      .from('pets')
      .delete()
      .eq('created_by', userId);

    if (deleteOwnedError) {
      console.error('Error deleting owned pets:', deleteOwnedError);
      return json({ error: 'Failed to delete pets' }, 500);
    }

    // ── Remove this test account as a co-owner on anyone else's pet ─────
    // (Edge case — a test account shouldn't normally be linked to a real
    // pet, but clean it up if it happened during testing.)
    const { error: coOwnerError } = await admin
      .from('pet_co_owners')
      .delete()
      .eq('co_owner_user_id', userId);

    if (coOwnerError) {
      console.warn('Error clearing co-owner links (continuing):', coOwnerError.message);
    }

    // ── Clean up any remaining Storage objects under this user's folder ─
    const { data: storageList, error: listError } = await admin.storage
      .from('uploads')
      .list(userId);

    if (listError) {
      console.warn('Storage list error (continuing):', listError.message);
    } else if (storageList && storageList.length > 0) {
      const paths = storageList.map(f => `${userId}/${f.name}`);
      const { error: removeError } = await admin.storage.from('uploads').remove(paths);
      if (removeError) console.warn('Storage cleanup error (continuing):', removeError.message);
    }

    return json({ success: true });

  } catch (err) {
    console.error('reset-test-account unexpected error:', err);
    return json({ error: (err as Error).message ?? 'Unknown error' }, 500);
  }
});
