import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// accountSetup.js (spec 0086): what it sends to finish-account-setup and
// how it handles the reply. supabase and error reporting are stubbed.
const invoke = vi.fn();
const getSession = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
vi.mock('@/api/supabaseClient', () => ({
  supabase: { functions: { invoke }, auth: { getSession, signInWithPassword, signOut } },
}));
const reportClientError = vi.fn();
vi.mock('@/lib/errorMonitoring', async () => {
  const real = await vi.importActual('@/lib/errorMonitoring');
  return { ...real, reportClientError };
});

const {
  finishAccountSetup,
  getAccountSetupStatus,
  GENERIC_ERROR,
  PASSWORD_LENGTH_ERROR,
  PASSWORD_BREACHED_ERROR,
} = await import('./accountSetup');

// A supabase-js FunctionsHttpError look-alike: the function's JSON body
// sits unread on error.context (a Response).
function httpError(status, body) {
  return {
    error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify(body), { status }) },
    data: null,
  };
}

beforeEach(() => {
  invoke.mockReset();
  getSession.mockReset();
  signInWithPassword.mockReset();
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  reportClientError.mockReset();
  getSession.mockResolvedValue({ data: { session: { user: { email: 'owner@example.com' } } } });
  signInWithPassword.mockResolvedValue({ data: {}, error: null });
});

const sentBody = () => invoke.mock.calls[0][1].body;

describe('finishAccountSetup: request body', () => {
  it('leaves marketing_opt_in out when the caller passes no boolean (decision 4)', async () => {
    invoke.mockResolvedValue({ data: { finished: true }, error: null });
    await finishAccountSetup({ acceptedTerms: true });
    expect(invoke.mock.calls[0][0]).toBe('finish-account-setup');
    expect(sentBody()).toEqual({ action: 'finish', accepted_terms: true });
    expect('marketing_opt_in' in sentBody()).toBe(false);
  });

  it.each([true, false])('sends marketing_opt_in when it is the boolean %s', async (value) => {
    invoke.mockResolvedValue({ data: { finished: true }, error: null });
    await finishAccountSetup({ acceptedTerms: true, marketingOptIn: value });
    expect(sentBody().marketing_opt_in).toBe(value);
  });

  it('sends the password only when one is given', async () => {
    invoke.mockResolvedValue({ data: { finished: true }, error: null });
    await finishAccountSetup({ acceptedTerms: true, password: 'correct horse battery' });
    expect(sentBody().password).toBe('correct horse battery');
    invoke.mockClear();
    await finishAccountSetup({ acceptedTerms: true });
    expect('password' in sentBody()).toBe(false);
  });
});

describe('finishAccountSetup: signing in again (build note 8)', () => {
  it('signs in again with the email captured before the call and the new password', async () => {
    const order = [];
    getSession.mockImplementation(async () => {
      order.push('getSession');
      return { data: { session: { user: { email: 'owner@example.com' } } } };
    });
    invoke.mockImplementation(async () => {
      order.push('invoke');
      return { data: { finished: true }, error: null };
    });
    signInWithPassword.mockImplementation(async () => {
      order.push('signIn');
      return { data: {}, error: null };
    });
    const result = await finishAccountSetup({ acceptedTerms: true, password: 'correct horse battery' });
    expect(result).toEqual({ ok: true });
    expect(order).toEqual(['getSession', 'invoke', 'signIn']);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'correct horse battery' });
  });

  it('does not sign in again when no password was set', async () => {
    invoke.mockResolvedValue({ data: { finished: true }, error: null });
    const result = await finishAccountSetup({ acceptedTerms: true });
    expect(result).toEqual({ ok: true });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('marks signedOut, clears the ended session and reports when setup finished but the re-sign-in failed', async () => {
    invoke.mockResolvedValue({ data: { finished: true }, error: null });
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const result = await finishAccountSetup({ acceptedTerms: true, password: 'correct horse battery' });
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR, passwordSaved: false, signedOut: true });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(reportClientError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ feature: 'account_setup' }));
  });

  it('does not mark signedOut after a successful finish and re-sign-in', async () => {
    invoke.mockResolvedValue({ data: { finished: true }, error: null });
    const result = await finishAccountSetup({ acceptedTerms: true, password: 'correct horse battery' });
    expect(result).toEqual({ ok: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('refuses to send a password when no signed-in email is known', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const result = await finishAccountSetup({ acceptedTerms: true, password: 'correct horse battery' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(GENERIC_ERROR);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('finishAccountSetup: errors', () => {
  it.each([PASSWORD_LENGTH_ERROR, PASSWORD_BREACHED_ERROR])('shows the server password message "%s" without reporting it', async (msg) => {
    invoke.mockResolvedValue(httpError(400, { error: msg }));
    const result = await finishAccountSetup({ acceptedTerms: true, password: 'short' });
    expect(result).toEqual({ ok: false, error: msg, passwordSaved: false, signedOut: false });
    expect(reportClientError).not.toHaveBeenCalled();
    // A 400 is refused before anything changes, so no re-sign-in attempt.
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('never shows the library wording or unknown server text; reports it', async () => {
    invoke.mockResolvedValue(httpError(400, { error: 'some raw internal detail' }));
    const result = await finishAccountSetup({ acceptedTerms: true });
    expect(result.error).toBe(GENERIC_ERROR);
    expect(result.error).not.toContain('non-2xx');
    expect(reportClientError).toHaveBeenCalledTimes(1);
  });

  it('marks passwordSaved when a server failure came after the password was saved (decision 3)', async () => {
    invoke.mockResolvedValue(httpError(500, { error: GENERIC_ERROR }));
    const result = await finishAccountSetup({ acceptedTerms: true, password: 'correct horse battery' });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'correct horse battery' });
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR, passwordSaved: true, signedOut: false });
    expect(reportClientError).toHaveBeenCalled();
  });

  it('does not mark passwordSaved when the new password does not sign in', async () => {
    invoke.mockResolvedValue(httpError(502, { error: GENERIC_ERROR }));
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const result = await finishAccountSetup({ acceptedTerms: true, password: 'correct horse battery' });
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR, passwordSaved: false, signedOut: false });
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([
    ['with a password', 'correct horse battery'],
    ['without a password', undefined],
  ])('marks signedOut and clears the session on a 401 (%s): the session is gone', async (_label, password) => {
    invoke.mockResolvedValue(httpError(401, { error: GENERIC_ERROR }));
    const result = await finishAccountSetup({ acceptedTerms: true, password });
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR, passwordSaved: false, signedOut: true });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    // A 401 is refused before anything changes, so no re-sign-in attempt.
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns the generic error if the call throws', async () => {
    invoke.mockRejectedValue(new Error('network down'));
    const result = await finishAccountSetup({ acceptedTerms: true });
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR, passwordSaved: false, signedOut: false });
    expect(reportClientError).toHaveBeenCalled();
  });
});

describe('getAccountSetupStatus', () => {
  it('asks for status and maps the reply', async () => {
    invoke.mockResolvedValue({ data: { needs_password: true, needs_consent: true }, error: null });
    expect(await getAccountSetupStatus()).toEqual({ ok: true, needsPassword: true, needsConsent: true });
    expect(invoke).toHaveBeenCalledWith('finish-account-setup', { body: { action: 'status' } });
  });

  it('returns the generic error and reports a failure', async () => {
    invoke.mockResolvedValue(httpError(401, { error: GENERIC_ERROR }));
    expect(await getAccountSetupStatus()).toEqual({ ok: false, error: GENERIC_ERROR });
    expect(reportClientError).toHaveBeenCalled();
  });
});

describe('app/server parity: password messages (spec 0086)', () => {
  const policy = readFileSync(
    fileURLToPath(new URL('../../supabase/functions/_shared/passwordPolicy.ts', import.meta.url)),
    'utf8',
  );
  it('uses the server breached-password text', () => {
    expect(policy).toContain(`'${PASSWORD_BREACHED_ERROR}'`);
  });
  it('uses the server length text (8 to 128)', () => {
    expect(policy).toContain('MIN_PASSWORD_LENGTH = 8;');
    expect(policy).toContain('MAX_PASSWORD_LENGTH = 128;');
    expect(PASSWORD_LENGTH_ERROR).toBe('Password must be between 8 and 128 characters');
    expect(policy).toContain('`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`');
  });
});
