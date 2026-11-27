import { supabase } from '@/api/supabaseClient';
import { functionErrorMessage, reportClientError } from '@/lib/errorMonitoring';

// Talks to the finish-account-setup Edge Function (spec 0086), the one
// place a new account gets its password and its Terms/Privacy consent.
// Used through FinishAccountSetupForm.jsx by /verify-email, /accept-invite
// and the consent screen. The server decides everything (whether a
// password is needed, the consent versions); this file only sends the
// person's answers and reads the reply.
//
// Both functions return a result object and never throw:
//   getAccountSetupStatus() -> { ok: true, needsPassword, needsConsent }
//                            | { ok: false, error, signedOut }
//   finishAccountSetup(...)  -> { ok: true }
//                            | { ok: false, error, passwordSaved, signedOut }
// `error` is always approved copy: one of the two password messages the
// server sends, or GENERIC_ERROR.

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// The server's own password messages (supabase/functions/_shared/
// passwordPolicy.ts), kept identical by accountSetup.test.js. These are
// the person's mistake, not a bug, so they aren't reported to Sentry.
export const PASSWORD_LENGTH_ERROR = 'Password must be between 8 and 128 characters';
export const PASSWORD_BREACHED_ERROR =
  'This password has appeared in a data breach. Please choose a different password.';
const EXPECTED_ERRORS = [PASSWORD_LENGTH_ERROR, PASSWORD_BREACHED_ERROR];

const FUNCTION_NAME = 'finish-account-setup';
const FEATURE = 'account_setup';

/**
 * `signedOut: true` means the server answered 401 (this browser's session
 * is missing or no longer valid). The dead session is cleared from this
 * browser, and the caller should send the person to /login. Not reported
 * to Sentry: an ended session is expected, not a bug.
 *
 * @returns {Promise<{ ok: true, needsPassword: boolean, needsConsent: boolean } | { ok: false, error: string, signedOut: boolean }>}
 */
export async function getAccountSetupStatus() {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { action: 'status' } });
    if (error?.context?.status === 401) {
      await clearLocalSession();
      return { ok: false, error: GENERIC_ERROR, signedOut: true };
    }
    if (error || !data || typeof data.needs_password !== 'boolean' || typeof data.needs_consent !== 'boolean') {
      reportClientError(error ?? new Error('finish-account-setup status: unexpected reply'), {
        feature: FEATURE,
        note: 'Account setup status check failed',
      });
      return { ok: false, error: GENERIC_ERROR, signedOut: false };
    }
    return { ok: true, needsPassword: data.needs_password, needsConsent: data.needs_consent };
  } catch (err) {
    reportClientError(err, { feature: FEATURE, note: 'Account setup status check failed' });
    return { ok: false, error: GENERIC_ERROR, signedOut: false };
  }
}

/**
 * Records consent (and the password, when the server asks for one).
 *
 * When `password` is sent and the server saves it, Supabase Auth ends
 * every session on the account, this one included (spec 0086 build note
 * 8). So this signs in again with the email (captured before the call)
 * and the new password before returning.
 *
 * Partial failure (planning decision 3): if the finish call fails in a
 * way that could have happened after the password was saved (anything
 * but a 400/401 refusal, which the server sends before changing
 * anything), this tries the same re-sign-in. If it works, the password
 * was saved: the result has `passwordSaved: true`, the new session is a
 * password session, and the caller should continue without password
 * fields (FinishAccountSetupForm does this and re-checks status).
 *
 * Signed out (`signedOut: true`): this browser no longer has a working
 * session, so the caller should send the person to /login (a full-page
 * load). Two cases: setup finished and the password was saved but the
 * re-sign-in failed (Supabase Auth had already ended this session), or
 * the server answered 401 (it only does that when the session's token is
 * missing or no longer valid, e.g. a retry after an earlier attempt saved
 * the password and ended the session). The dead session is cleared from
 * this browser first, so /login starts clean.
 *
 * `marketingOptIn` is sent only when it's a boolean; leaving it out keeps
 * the person's current setting (planning decision 4).
 *
 * @param {{ password?: string, acceptedTerms: boolean, marketingOptIn?: boolean }} args
 * @returns {Promise<{ ok: true } | { ok: false, error: string, passwordSaved: boolean, signedOut: boolean }>}
 */
export async function finishAccountSetup({ password, acceptedTerms, marketingOptIn }) {
  const sendsPassword = typeof password === 'string' && password.length > 0;
  try {
    let email = null;
    if (sendsPassword) {
      const { data: sessionData } = await supabase.auth.getSession();
      email = sessionData?.session?.user?.email ?? null;
      if (!email) {
        reportClientError(new Error('finish-account-setup: no signed-in email before finish'), {
          feature: FEATURE,
          note: 'Account setup finish had no session email',
        });
        return { ok: false, error: GENERIC_ERROR, passwordSaved: false, signedOut: false };
      }
    }

    /** @type {Record<string, unknown>} */
    const body = { action: 'finish', accepted_terms: acceptedTerms === true };
    if (sendsPassword) body.password = password;
    if (typeof marketingOptIn === 'boolean') body.marketing_opt_in = marketingOptIn;

    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

    if (error || !data?.finished) {
      const message = await functionErrorMessage(error, data, GENERIC_ERROR);
      const expected = EXPECTED_ERRORS.includes(message);
      const result = expected ? message : GENERIC_ERROR;
      if (!expected) {
        reportClientError(error ?? new Error('finish-account-setup finish: unexpected reply'), {
          feature: FEATURE,
          note: 'Account setup finish failed',
        });
      }
      const status = error?.context?.status;
      if (status === 401) {
        await clearLocalSession();
        return { ok: false, error: result, passwordSaved: false, signedOut: true };
      }
      if (sendsPassword && status !== 400) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInError) return { ok: false, error: result, passwordSaved: true, signedOut: false };
      }
      return { ok: false, error: result, passwordSaved: false, signedOut: false };
    }

    if (sendsPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        reportClientError(signInError, {
          feature: FEATURE,
          note: 'Sign-in after account setup failed',
        });
        // Setup itself finished, but this browser is now signed out
        // (Supabase Auth ended this session when the password changed).
        // The caller sends the person to /login to sign in with the new
        // password.
        await clearLocalSession();
        return { ok: false, error: GENERIC_ERROR, passwordSaved: false, signedOut: true };
      }
    }
    return { ok: true };
  } catch (err) {
    reportClientError(err, { feature: FEATURE, note: 'Account setup finish failed' });
    return { ok: false, error: GENERIC_ERROR, passwordSaved: false, signedOut: false };
  }
}

// Removes a session the server has already ended from this browser only
// (scope 'local' makes no server call), so /login starts clean.
async function clearLocalSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (err) {
    reportClientError(err, { feature: FEATURE, note: 'Clearing an ended session failed' });
  }
}

/**
 * Which screen /verify-email and /accept-invite show once the link is
 * redeemed, from getAccountSetupStatus()'s result (spec 0086):
 *   'signedOut'   the session is gone: go to /login
 *   'error'       the status check failed: show the generic error
 *   'skip'        nothing left to do: go straight on (planning decision 2)
 *   'finish'      password needed: the full finish form
 *   'consentOnly' consent needed but no password (e.g. a password session
 *                 was already in this browser): the existing-account
 *                 consent copy with just the Terms checkbox
 *
 * @param {{ ok: boolean, needsPassword?: boolean, needsConsent?: boolean, signedOut?: boolean }} status
 * @returns {'signedOut' | 'error' | 'skip' | 'finish' | 'consentOnly'}
 */
export function setupScreenFor(status) {
  if (!status?.ok) return status?.signedOut ? 'signedOut' : 'error';
  if (status.needsPassword) return 'finish';
  if (status.needsConsent) return 'consentOnly';
  return 'skip';
}

/**
 * Where /accept-invite sends someone once they're done. A sitter invite
 * goes to the household Pet Sitter page (a sit can cover several pets);
 * a co-owner invite lands on Pets with that pet's card highlighted.
 *
 * @param {{ isSitterInvite: boolean, petId?: string | null }} args
 */
export function inviteDestination({ isSitterInvite, petId }) {
  if (isSitterInvite) return '/pet-sitter';
  return petId ? `/pets?highlight=${encodeURIComponent(petId)}` : '/';
}
