// Supabase Edge Function: finish-account-setup (spec 0086, PA-13/PA-18)
//
// The one place a new account gets its password and its Terms/Privacy
// consent. Called by the finish page (/verify-email, /accept-invite) and
// the consent screen for signed-in accounts with no consent on record.
// Replaces confirm-email.
//
// Who is calling comes ONLY from the caller's own session token: it's
// checked with auth.getUser() first, and only then is its payload read
// for the `amr` claim. Nothing in the request body ever names an account.
//
// "Needs a password" (planning decision 7): the session signed in from an
// email link (JWT amr method 'otp': sign-up, invite or recovery link) AND
// no consent is recorded yet. Every other session must not send a
// password, so this is never a way to change a password. The stored
// password can't be used to decide this: Supabase stores a random one for
// every account once its link is clicked, so email_has_password() is true
// for all of them.
//
// Request body:
//   { action: 'status' }
//     -> { needs_password: boolean, needs_consent: boolean }
//   { action: 'finish', password?, accepted_terms: true, marketing_opt_in? }
//     -> { finished: true }
//
// 'finish' checks everything before changing anything: accepted_terms
// must be true, and the password must be present and pass
// _shared/passwordPolicy.ts (length, then breached) when needed, absent
// otherwise. Then, in order:
//   1. one admin.updateUserById: the password (when needed) and
//      email_confirm: true, so the account is confirmed only here;
//   2. the consent write, with the service role and the server's own
//      versions (_shared/legalVersions.ts). Only rows with no consent are
//      written, so an existing record is never replaced (AC8).
//      marketing_opt_in is written only when the request sends a boolean
//      (decision 4: omitted leaves the current setting alone);
//   3. admin.signOut(callerToken, 'others'): every other session on the
//      account ends (AC6).
//
// IMPORTANT for callers: when step 1 sets a password, Supabase Auth ends
// EVERY session on the account, including the caller's own (verified on
// dev, 2026-11-27). The caller's token and refresh token stop working the
// moment a password-setting finish succeeds, so the page must sign in
// again with the new password. A finish with no password (the consent-
// only screen) keeps the caller's session; only the others end.
//
// Partial failure (decision 3): if step 1 saved the password and step 2
// failed, the reply is an error and the caller's session has already
// ended. Signing in with the new password gives a password session
// (amr 'password'), so 'status' then says needs_password false,
// needs_consent true, and a finish without a password records consent.
//
// Errors use only the approved copy (spec 0086 "Errors"): the two
// password messages from passwordPolicy.ts, and the app's standard
// "Something went wrong. Please try again." for everything else. No raw
// error text ever reaches the browser (spec 0078).

import { createClient, isAuthSessionMissingError } from 'jsr:@supabase/supabase-js@2.119.2';
import { scopedCorsHeaders } from '../_shared/cors.ts';
import { GENERIC_ERROR, reportError, serverError } from '../_shared/errorReporting.ts';
import { PRIVACY_VERSION, TOS_VERSION } from '../_shared/legalVersions.ts';
import { PASSWORD_BREACHED_ERROR, isPasswordPwned, passwordLengthError } from '../_shared/passwordPolicy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FUNCTION_NAME = 'finish-account-setup';

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function genericError(status: number, cors: Record<string, string>): Response {
  return jsonResponse({ error: GENERIC_ERROR }, status, cors);
}

// Reads a JWT's payload. Only ever called on a token auth.getUser() has
// already accepted, so the signature has been checked by Supabase Auth.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// True when the session signed in from an email link: Supabase Auth puts
// { method: 'otp' } in amr for every sign-up, invite and recovery link
// session, and keeps it across refreshes (verified on dev, decision 7).
function sessionCameFromEmailLink(payload: Record<string, unknown>): boolean {
  const amr = payload.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (typeof entry === 'string') return entry === 'otp';
    if (entry && typeof entry === 'object') return (entry as { method?: unknown }).method === 'otp';
    return false;
  });
}

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

Deno.serve(async (req) => {
  const cors = scopedCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const token = bearerToken(req.headers.get('Authorization'));
    if (!token) {
      return genericError(401, cors);
    }

    // Identify the caller from their own token, checked by Supabase Auth.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) {
      return genericError(401, cors);
    }
    const payload = decodeJwtPayload(token);
    if (!payload || payload.sub !== user.id) {
      return genericError(401, cors);
    }
    const userId = user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return genericError(400, cors);
    }
    const { action, password, accepted_terms: acceptedTerms, marketing_opt_in: marketingOptIn } =
      body as Record<string, unknown>;
    if (action !== 'status' && action !== 'finish') {
      return genericError(400, cors);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Consent on record? Read with the service role, by the caller's id.
    // A missing profile row counts as no consent.
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('terms_accepted_at')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      console.error('profiles consent lookup error:', profileError);
      reportError(new Error('finish-account-setup: profiles consent lookup failed'), {
        function: FUNCTION_NAME,
        step: 'consent_lookup',
      });
      return genericError(500, cors);
    }
    const needsConsent = !profile?.terms_accepted_at;
    const needsPassword = needsConsent && sessionCameFromEmailLink(payload);

    if (action === 'status') {
      return jsonResponse({ needs_password: needsPassword, needs_consent: needsConsent }, 200, cors);
    }

    // action === 'finish'. Every check happens before anything changes.
    if (acceptedTerms !== true) {
      return genericError(400, cors);
    }
    if (marketingOptIn !== undefined && marketingOptIn !== null && typeof marketingOptIn !== 'boolean') {
      return genericError(400, cors);
    }
    const passwordSent = password !== undefined && password !== null;

    let newPassword: string | undefined;
    if (needsPassword) {
      const lengthError = passwordLengthError(password);
      if (lengthError || typeof password !== 'string') {
        return jsonResponse({ error: lengthError ?? GENERIC_ERROR }, 400, cors);
      }
      if (await isPasswordPwned(password)) {
        return jsonResponse({ error: PASSWORD_BREACHED_ERROR }, 400, cors);
      }
      newPassword = password;
    } else if (passwordSent) {
      // Never a way to change a password (AC13).
      return genericError(400, cors);
    }

    // 1. Password (when needed) and confirmation, in one call.
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      ...(newPassword ? { password: newPassword } : {}),
      email_confirm: true,
    });
    if (updateError) {
      console.error('updateUserById (finish) error:', updateError);
      reportError(new Error(`finish-account-setup: updateUserById failed (${updateError.code ?? 'no code'})`), {
        function: FUNCTION_NAME,
        step: 'update_user',
      });
      return genericError(502, cors);
    }

    // 2. Consent, written once. An existing record is kept (AC8).
    const consent: Record<string, unknown> = {
      terms_accepted_at: new Date().toISOString(),
      terms_version: TOS_VERSION,
      privacy_version: PRIVACY_VERSION,
    };
    if (typeof marketingOptIn === 'boolean') {
      consent.marketing_opt_in = marketingOptIn;
    }
    const { data: written, error: consentError } = await adminClient
      .from('profiles')
      .update(consent)
      .eq('id', userId)
      .is('terms_accepted_at', null)
      .select('id');
    if (consentError) {
      console.error('profiles consent write error:', consentError);
      reportError(new Error('finish-account-setup: consent write failed'), {
        function: FUNCTION_NAME,
        step: 'consent_write',
      });
      return genericError(500, cors);
    }
    if (!written || written.length === 0) {
      // Nothing written: either consent was already on record (fine, the
      // original is kept) or there is no profile row (not fine).
      const { data: recheck, error: recheckError } = await adminClient
        .from('profiles')
        .select('terms_accepted_at')
        .eq('id', userId)
        .maybeSingle();
      if (recheckError || !recheck?.terms_accepted_at) {
        console.error('profiles consent write matched no row:', recheckError);
        reportError(new Error('finish-account-setup: consent write matched no profile row'), {
          function: FUNCTION_NAME,
          step: 'consent_write',
        });
        return genericError(500, cors);
      }
    }

    // 3. End every other session on the account (AC6). When a password
    // was just set, Supabase Auth has already ended EVERY session on the
    // account, the caller's included (verified on dev), so this call finds
    // no session for the token; that's the outcome we want, not a failure.
    const { error: signOutError } = await adminClient.auth.admin.signOut(token, 'others');
    if (signOutError && !(newPassword && isAuthSessionMissingError(signOutError))) {
      console.error('admin.signOut (others) error:', signOutError);
      reportError(new Error('finish-account-setup: signing out other sessions failed'), {
        function: FUNCTION_NAME,
        step: 'sign_out_others',
      });
      return genericError(502, cors);
    }

    return jsonResponse({ finished: true }, 200, cors);
  } catch (err) {
    return serverError(err, { function: FUNCTION_NAME }, cors);
  }
});
