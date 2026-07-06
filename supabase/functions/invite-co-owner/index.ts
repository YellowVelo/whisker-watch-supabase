// Supabase Edge Function: invite-co-owner
//
// Sends an invite email to a new co-owner after the pet_co_owners record
// has already been created by the client.
//
// For users who don't yet have a Whisker Watch account, Supabase's
// built-in "invite user" auth flow sends them a signup link via the
// project's configured SMTP. For users who already have an account the
// invite email is skipped — they'll see the shared pet on their next
// login because the pet_co_owners row already exists.
//
// The invite email template is customisable in the Supabase dashboard
// under Authentication → Email Templates → Invite.
//
// Request body:
//   {
//     coOwnerEmail: string,   // required — who to invite
//     petName: string,        // required — shown in the email subject/body
//     petId: string,          // required — used to build the redirect URL
//   }
//
// Response:
//   { sent: true }                        — new user, invite email sent
//   { sent: false, reason: 'exists' }     — already a Whisker Watch user
//   { error: string }                     — something went wrong

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller is an authenticated Supabase user.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { coOwnerEmail, petName, petId } = await req.json();
    if (!coOwnerEmail || !petName || !petId) {
      return new Response(JSON.stringify({ error: 'coOwnerEmail, petName, and petId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the service-role client for admin operations (inviting users).
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Test/demo accounts must never send real production email. The
    // pet_co_owners record already exists by the time this function
    // runs, so the sharing flow still works end-to-end for testing —
    // we just skip the actual outbound email.
    const { data: inviterProfile } = await adminClient
      .from('profiles')
      .select('account_type, first_name')
      .eq('id', userData.user.id)
      .single();
    if (inviterProfile?.account_type === 'test' || inviterProfile?.account_type === 'demo') {
      return new Response(JSON.stringify({ sent: false, reason: 'test_or_demo_account' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Redirect the invited user to the pet's profile after they sign up.
    const redirectTo = `${SUPABASE_URL.replace('https://', 'https://').replace('.supabase.co', '')}/pet/${petId}`;
    // Use the app's own URL if set as a secret, otherwise fall back to a
    // generic redirect — the pet_co_owners record is what actually grants
    // access, so the exact landing URL is secondary.
    const appUrl = Deno.env.get('APP_URL') ?? 'https://whiskerwatch.app';
    const petRedirectUrl = `${appUrl}/pet/${petId}`;

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      coOwnerEmail,
      {
        redirectTo: petRedirectUrl,
        data: {
          // These values are available as {{ .Data.pet_name }} etc. in the
          // Supabase email template editor, so you can personalise the body.
          pet_name: petName,
          invited_by: inviterProfile?.first_name || userData.user.email,
        },
      },
    );

    if (inviteError) {
      // Supabase returns a 422 when the email already belongs to an
      // existing user. In that case the access record is already in place,
      // so we surface a clean "already has account" result rather than an
      // error — the co-owner will see the pet on their next login.
      if (
        inviteError.message?.toLowerCase().includes('already registered') ||
        inviteError.status === 422
      ) {
        return new Response(JSON.stringify({ sent: false, reason: 'exists' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.error('inviteUserByEmail error:', inviteError);
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Edge Function error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
