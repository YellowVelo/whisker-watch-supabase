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
//                            | { ok: false, error }
//   finishAccountSetup(...)  -> { ok: true }
//                            | { ok: false, error, passwordSaved }
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

/** @returns {Promise<{ ok: true, needsPassword: boolean, needsConsent: boolean } | { ok: false, error: string }>} */
export async function getAccountSetupStatus() {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { action: 'status' } });
    if (error || !data || typeof data.needs_password !== 'boolean' || typeof data.needs_consent !== 'boolean') {
      reportClientError(error ?? new Error('finish-account-setup status: unexpected reply'), {
        feature: FEATURE,
        note: 'Account setup status check failed',
      });
      return { ok: false, error: GENERIC_ERROR };
    }
    return { ok: true, needsPassword: data.needs_password, needsConsent: data.needs_consent };
  } catch (err) {
    reportClientError(err, { feature: FEATURE, note: 'Account setup status check failed' });
    return { ok: false, error: GENERIC_ERROR };
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
 * `marketingOptIn` is sent only when it's a boolean; leaving it out keeps
 * the person's current setting (planning decision 4).
 *
 * @param {{ password?: string, acceptedTerms: boolean, marketingOptIn?: boolean }} args
 * @returns {Promise<{ ok: true } | { ok: false, error: string, passwordSaved: boolean }>}
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
        return { ok: false, error: GENERIC_ERROR, passwordSaved: false };
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
      const refusedBeforeChanges = status === 400 || status === 401;
      if (sendsPassword && !refusedBeforeChanges) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInError) return { ok: false, error: result, passwordSaved: true };
      }
      return { ok: false, error: result, passwordSaved: false };
    }

    if (sendsPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        reportClientError(signInError, {
          feature: FEATURE,
          note: 'Sign-in after account setup failed',
        });
        // Setup itself finished, but this browser is now signed out. Shown
        // as the generic error; passwordSaved stays false because there's
        // no session to continue with.
        return { ok: false, error: GENERIC_ERROR, passwordSaved: false };
      }
    }
    return { ok: true };
  } catch (err) {
    reportClientError(err, { feature: FEATURE, note: 'Account setup finish failed' });
    return { ok: false, error: GENERIC_ERROR, passwordSaved: false };
  }
}
