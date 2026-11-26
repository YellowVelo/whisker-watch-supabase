import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  captureException: (...args) => captureException(...args),
}));

// errorMonitoring.js reads VITE_SENTRY_DSN once, when it's first imported,
// so each test imports a fresh copy with the DSN it needs. The environment
// defaults to 'production' when a DSN is given (spec 0084: only production
// reports), so the reportClientError tests below exercise the sending path.
async function loadModule({ dsn, environment } = {}) {
  vi.resetModules();
  // Always set both: vitest loads the local .env, which may have real values.
  vi.stubEnv('VITE_SENTRY_DSN', dsn ?? '');
  vi.stubEnv('VITE_SENTRY_ENVIRONMENT', environment ?? (dsn ? 'production' : ''));
  return import('./errorMonitoring.js');
}

beforeEach(() => {
  captureException.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('shouldSendEvent (spec 0078, PA-15)', () => {
  it("sends real users' and Lynn's own errors, and errors from before sign-in", async () => {
    const { shouldSendEvent } = await loadModule();
    expect(shouldSendEvent({ tags: { account_type: 'production' } })).toBe(true);
    expect(shouldSendEvent({ tags: { account_type: 'owner' } })).toBe(true);
    expect(shouldSendEvent({ tags: {} })).toBe(true);
    expect(shouldSendEvent({})).toBe(true);
  });

  it('drops test and demo accounts', async () => {
    const { shouldSendEvent } = await loadModule();
    expect(shouldSendEvent({ tags: { account_type: 'test' } })).toBe(false);
    expect(shouldSendEvent({ tags: { account_type: 'demo' } })).toBe(false);
  });
});

describe('shouldSendEvent network drops (spec 0084, AC3)', () => {
  const errorEvent = (value, type = 'TypeError', tags = {}) => ({
    tags,
    exception: { values: [{ type, value }] },
  });

  it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'drops "%s"',
    async (message) => {
      const { shouldSendEvent } = await loadModule();
      expect(shouldSendEvent(errorEvent(message))).toBe(false);
      expect(shouldSendEvent(errorEvent(`TypeError: ${message}`, 'Error', { account_type: 'production' }))).toBe(false);
    },
  );

  it("drops Supabase's AuthRetryableFetchError", async () => {
    const { shouldSendEvent } = await loadModule();
    expect(shouldSendEvent(errorEvent('{}', 'AuthRetryableFetchError'))).toBe(false);
  });

  it('drops when any exception in the chain is a network drop', async () => {
    const { shouldSendEvent } = await loadModule();
    const event = { exception: { values: [{ type: 'Error', value: 'wrapper' }, { type: 'TypeError', value: 'Load failed' }] } };
    expect(shouldSendEvent(event)).toBe(false);
  });

  it('keeps "Failed to fetch dynamically imported module" (a broken deploy, not a drop)', async () => {
    const { shouldSendEvent } = await loadModule();
    expect(
      shouldSendEvent(errorEvent('Failed to fetch dynamically imported module: https://wyskerwatch.com/assets/Home-abc.js')),
    ).toBe(true);
  });

  it('keeps ordinary errors', async () => {
    const { shouldSendEvent } = await loadModule();
    expect(shouldSendEvent(errorEvent('permission denied for table pets', 'Error'))).toBe(true);
    expect(shouldSendEvent({ exception: {} })).toBe(true);
  });
});

describe('only production reports (spec 0084, AC1)', () => {
  const DSN = 'https://key@example.test/1';

  it.each(['development', 'staging', ''])('sends nothing when the environment is "%s"', async (environment) => {
    const { reportClientError, sentryEnabled } = await loadModule({ dsn: DSN, environment });
    reportClientError(new Error('x'), { feature: 'home' });
    expect(sentryEnabled).toBe(false);
    expect(console.error).toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('sends when the environment is production and a DSN is set', async () => {
    const { reportClientError, sentryEnabled } = await loadModule({ dsn: DSN, environment: 'production' });
    reportClientError(new Error('x'), { feature: 'home' });
    expect(sentryEnabled).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('sends nothing in production without a DSN', async () => {
    const { reportClientError, sentryEnabled } = await loadModule({ environment: 'production' });
    reportClientError(new Error('x'), { feature: 'home' });
    expect(sentryEnabled).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });
});

// QA additions for spec 0084: malformed events, real-world message
// variants, and the two filters (account type, network drop) together.
describe('shouldSendEvent edge cases (spec 0084 QA)', () => {
  const errorEvent = (value, type = 'TypeError', tags = {}) => ({
    tags,
    exception: { values: [{ type, value }] },
  });

  it('never throws on malformed events, and keeps them', async () => {
    const { shouldSendEvent } = await loadModule();
    for (const event of [
      null,
      undefined,
      {},
      { exception: null },
      { exception: { values: null } },
      { exception: { values: {} } },
      { exception: { values: 'Failed to fetch' } },
      { exception: { values: [] } },
      { exception: { values: [null, undefined] } },
      { exception: { values: [{ type: 'TypeError' }] } },
      { exception: { values: [{ type: 'TypeError', value: 42 }] } },
      { exception: { values: [{ type: 'TypeError', value: { message: 'Failed to fetch' } }] } },
    ]) {
      expect(() => shouldSendEvent(event)).not.toThrow();
      expect(shouldSendEvent(event)).toBe(true);
    }
  });

  it("drops Chrome's newer \"Failed to fetch (host)\" wording", async () => {
    const { shouldSendEvent } = await loadModule();
    expect(shouldSendEvent(errorEvent('Failed to fetch (abc.supabase.co)'))).toBe(false);
  });

  it('drops AuthRetryableFetchError whatever its message', async () => {
    const { shouldSendEvent } = await loadModule();
    expect(shouldSendEvent(errorEvent('Load failed', 'AuthRetryableFetchError'))).toBe(false);
    expect(shouldSendEvent(errorEvent(undefined, 'AuthRetryableFetchError'))).toBe(false);
  });

  it('keeps other browsers\' "old copy after a deploy" errors', async () => {
    const { shouldSendEvent } = await loadModule();
    // Firefox and Safari word a failed dynamic import differently from Chrome.
    expect(shouldSendEvent(errorEvent('error loading dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(shouldSendEvent(errorEvent('Importing a module script failed.'))).toBe(true);
  });

  it('keeps a network-looking message that only appears outside the exception', async () => {
    const { shouldSendEvent } = await loadModule();
    // Only exception values are checked; a plain message event is kept.
    expect(shouldSendEvent({ message: 'Failed to fetch' })).toBe(true);
  });

  it('both filters together: test/demo always dropped, real deploy errors kept for real users', async () => {
    const { shouldSendEvent } = await loadModule();
    const dynamicImport = 'Failed to fetch dynamically imported module: https://x/assets/a.js';
    expect(shouldSendEvent(errorEvent(dynamicImport, 'TypeError', { account_type: 'production' }))).toBe(true);
    expect(shouldSendEvent(errorEvent(dynamicImport, 'TypeError', { account_type: 'owner' }))).toBe(true);
    expect(shouldSendEvent(errorEvent(dynamicImport, 'TypeError', { account_type: 'test' }))).toBe(false);
    expect(shouldSendEvent(errorEvent('Failed to fetch', 'TypeError', { account_type: 'owner' }))).toBe(false);
    expect(shouldSendEvent(errorEvent('boom', 'Error', { account_type: 'demo' }))).toBe(false);
  });
});

describe('production-only setup (spec 0084 QA, AC1)', () => {
  const DSN = 'https://key@example.test/1';
  // The mocked @sentry/react functions are shared across module reloads.
  beforeEach(() => vi.clearAllMocks());

  it.each(['Production', 'PRODUCTION', ' production', 'production ', 'prod', 'preview'])(
    'treats "%s" as not production',
    async (environment) => {
      const { reportClientError, sentryEnabled, Sentry } = await loadModule({ dsn: DSN, environment });
      reportClientError(new Error('x'), { feature: 'home' });
      expect(sentryEnabled).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
      expect(captureException).not.toHaveBeenCalled();
    },
  );

  it('outside production, account-type tagging is a no-op (logout/login does nothing)', async () => {
    const { setSentryAccountType, clearSentryAccountType, Sentry } = await loadModule({ dsn: DSN, environment: 'staging' });
    setSentryAccountType('production');
    clearSentryAccountType();
    expect(Sentry.setTag).not.toHaveBeenCalled();
  });

  it('in production, account-type tagging still works', async () => {
    const { setSentryAccountType, clearSentryAccountType, Sentry } = await loadModule({ dsn: DSN, environment: 'production' });
    setSentryAccountType('owner');
    clearSentryAccountType();
    expect(Sentry.setTag).toHaveBeenNthCalledWith(1, 'account_type', 'owner');
    expect(Sentry.setTag).toHaveBeenNthCalledWith(2, 'account_type', undefined);
  });

  it("in production, Sentry.init gets the 'production' tag and a beforeSend that applies both filters", async () => {
    const { Sentry } = await loadModule({ dsn: DSN, environment: 'production' });
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const options = Sentry.init.mock.calls[0][0];
    expect(options.dsn).toBe(DSN);
    expect(options.environment).toBe('production');
    expect(options.tracesSampleRate).toBe(0);
    const real = { exception: { values: [{ type: 'Error', value: 'boom' }] } };
    expect(options.beforeSend(real)).toBe(real);
    expect(options.beforeSend({ exception: { values: [{ type: 'TypeError', value: 'Load failed' }] } })).toBeNull();
    expect(options.beforeSend({ ...real, tags: { account_type: 'test' } })).toBeNull();
  });
});

describe('reportClientError (spec 0078, PA-15)', () => {
  it('logs and reports with the feature tag and note', async () => {
    const { reportClientError } = await loadModule({ dsn: 'https://key@example.test/1' });
    const err = new Error('load failed');
    reportClientError(err, { feature: 'home', note: 'Could not load pets' });
    expect(console.error).toHaveBeenCalledWith('Could not load pets:', err);
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { feature: 'home' },
      extra: { note: 'Could not load pets' },
    });
  });

  it("wraps Supabase's plain error objects so Sentry shows their message", async () => {
    const { reportClientError } = await loadModule({ dsn: 'https://key@example.test/1' });
    const pgError = { message: 'permission denied for table pets', code: '42501' };
    reportClientError(pgError, { feature: 'pets', kind: 'x' });
    const [sent, context] = captureException.mock.calls[0];
    expect(sent).toBeInstanceOf(Error);
    expect(sent.message).toBe('permission denied for table pets');
    expect(sent.name).toBe('Error 42501');
    expect(context.tags).toEqual({ feature: 'pets', kind: 'x' });
    expect(context.extra.original).toBe(pgError);
  });

  it('only logs when no Sentry DSN is set', async () => {
    const { reportClientError } = await loadModule();
    reportClientError(new Error('x'), { feature: 'home' });
    expect(console.error).toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('functionErrorMessage (spec 0078)', () => {
  const FALLBACK = "We couldn't delete this pet. Please try again.";
  const httpError = (status, body) => ({
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status }),
  });

  it("shows the server's own reason", async () => {
    const { functionErrorMessage } = await loadModule();
    expect(await functionErrorMessage(httpError(404, { error: 'Pet not found' }), null, FALLBACK)).toBe('Pet not found');
    expect(
      await functionErrorMessage(httpError(500, { error: { code: 'x', message: 'Report failed' } }), null, FALLBACK),
    ).toBe('Report failed');
  });

  it('falls back, and never shows the "non-2xx" wording', async () => {
    const { functionErrorMessage } = await loadModule();
    const noBody = { message: 'Edge Function returned a non-2xx status code', context: new Response('oops', { status: 500 }) };
    expect(await functionErrorMessage(noBody, null, FALLBACK)).toBe(FALLBACK);
    expect(await functionErrorMessage(new Error('Failed to fetch'), null, FALLBACK)).toBe(FALLBACK);
    expect(await functionErrorMessage(null, { success: false }, FALLBACK)).toBe(FALLBACK);
  });

  it("uses a 200 reply's own error when there's no HTTP error", async () => {
    const { functionErrorMessage } = await loadModule();
    expect(await functionErrorMessage(null, { error: 'Only for test accounts.' }, FALLBACK)).toBe('Only for test accounts.');
  });
});

describe('no console.error left in the app (spec 0078, AC7)', () => {
  it('every error goes through reportClientError', () => {
    const srcDir = path.resolve(__dirname, '..');
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name) && entry.name !== 'errorMonitoring.js') {
          if (fs.readFileSync(full, 'utf8').includes('console.error(')) offenders.push(path.relative(srcDir, full));
        }
      }
    };
    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
