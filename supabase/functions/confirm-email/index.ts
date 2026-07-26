// Supabase Edge Function: confirm-email
//
// Authenticated endpoint called by src/pages/VerifyEmail.jsx immediately
// after it redeems a signup/resend confirmation link via
// supabase.auth.verifyOtp(). See
// docs/features/0021_Branded_Signup_Confirmation_Email_Specification_v1.md
// for why this extra step exists: a resent confirmation link uses a
// 'recovery'-type token (see sign-up/index.ts), and 'recovery' tokens are
// designed to let an existing user back in without re-checking
// confirmation status — they are not guaranteed to also flip
// auth.users.email_confirmed_at the way a 'signup'-type token does.
// Rather than depending on that unverified assumption, this function
// makes confirmation explicit and deterministic: it reads the CALLER'S
// OWN id from their session JWT (never an id supplied in the request
// body) and marks that same account confirmed. Safe to call every time
// VerifyEmail.jsx runs — a no-op if already confirmed.
//
// Request body: none required (the caller's identity comes from the
// Authorization header's session, established by verifyOtp() just
// before this is called).
//
// Response:
//   { confirmed: true }
//   { error: string }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { scopedCorsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Scoped, not the '*' invite-co-owner/invite-sitter use — this function
  // is part of the public sign-up flow (see sign-up/index.ts, same
  // feature) and should follow the same first-party-origin-only policy
  // rather than a second, inconsistent CORS convention.
  const corsHeaders = scopedCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Scoped to the caller's own session — used only to identify who is
    // calling, never to read/write anything beyond that.
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

    // The one privileged operation this function exists for: always
    // targets userData.user.id (derived from the verified JWT above),
    // never an id from the request body — a caller can only ever confirm
    // their own account.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userData.user.id, {
      email_confirm: true,
    });

    if (updateError) {
      console.error('updateUserById (email_confirm) error:', updateError);
      return new Response(JSON.stringify({ error: 'Unable to confirm this account right now' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ confirmed: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('confirm-email Edge Function error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
