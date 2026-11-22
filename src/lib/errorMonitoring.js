import * as Sentry from '@sentry/react';

// Production error/crash monitoring (spec 0052). Sentry.init() is skipped
// entirely when VITE_SENTRY_DSN is unset (e.g. local dev without a DSN
// configured) so this is a silent no-op rather than an error — monitoring
// must never be able to break the app itself.
const dsn = import.meta.env.VITE_SENTRY_DSN;

// Accounts whose errors stay out of the dashboard: e2e runs (test) and the
// shared demo login (demo). Everyone else reports, including Lynn's own
// 'owner' account (spec 0078, PA-15; before that, only 'production' did),
// and errors from before sign-in, when account_type isn't known yet.
// Edge Functions don't filter at all (_shared/errorReporting.ts).
const EXCLUDED_ACCOUNT_TYPES = new Set(['test', 'demo']);

export function shouldSendEvent(event) {
  return !EXCLUDED_ACCOUNT_TYPES.has(event?.tags?.account_type);
}

export const sentryEnabled = !!dsn;

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
    // Error capture only — no performance tracing or session replay (spec
    // 0052 non-goals).
    tracesSampleRate: 0,
    beforeSend(event) {
      return shouldSendEvent(event) ? event : null;
    },
  });
}

// Called once AuthContext resolves the signed-in user's account_type.
export function setSentryAccountType(accountType) {
  if (!sentryEnabled) return;
  Sentry.setTag('account_type', accountType);
}

// Called on logout so a stale tag from the previous session can't leak
// into an error reported before the next user's account_type is known.
export function clearSentryAccountType() {
  if (!sentryEnabled) return;
  Sentry.setTag('account_type', undefined);
}

// The app's one way to record an error (spec 0078, PA-15). It logs to the
// console exactly as before, and reports to Sentry with a `feature` tag so
// the dashboard can be filtered by screen. Use it instead of console.error.
//   reportClientError(err, { feature: 'home_load' });
//   reportClientError(err, { feature: 'pet_edit', note: 'Failed to save pet' });
// `note` is a short human description, logged and sent as extra context.
// Any other keys become Sentry tags (keep them short).
// Supabase returns plain error objects, not Error instances; those are
// wrapped so Sentry shows their message instead of "Object captured as
// exception".
/**
 * @param {unknown} err
 * @param {{ feature?: string, note?: string, [tag: string]: string | undefined }} [options]
 */
export function reportClientError(err, { feature = 'unknown', note, ...tags } = {}) {
  if (note) console.error(`${note}:`, err);
  else console.error(err);
  if (!sentryEnabled) return;
  Sentry.captureException(toError(err), {
    tags: { feature, ...tags },
    extra: { ...(note ? { note } : {}), ...(err instanceof Error ? {} : { original: err }) },
  });
}

function toError(err) {
  if (err instanceof Error) return err;
  const message =
    (err && typeof err === 'object' && typeof err.message === 'string' && err.message) ||
    (typeof err === 'string' ? err : null) ||
    safeStringify(err);
  const wrapped = new Error(message);
  if (err && typeof err === 'object' && typeof err.code === 'string') wrapped.name = `Error ${err.code}`;
  return wrapped;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// The server's own reason when an Edge Function call fails (spec 0078).
// supabase-js puts its generic "Edge Function returned a non-2xx status
// code" on error.message and leaves the function's { error } body unread
// on error.context (a Response), so this reads the body, then a 200 reply's
// data.error, then the screen's fallback. It never returns the library's
// own wording. Body shapes: { error: 'text' } (most functions) or
// { error: { message } } (send-email, generate-vet-report).
export async function functionErrorMessage(error, data, fallback) {
  const fromBody = await readErrorBody(error?.context);
  return pickMessage(fromBody) ?? pickMessage(data?.error) ?? fallback;
}

async function readErrorBody(response) {
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = await (typeof response.clone === 'function' ? response.clone() : response).json();
    return body?.error ?? null;
  } catch {
    return null;
  }
}

function pickMessage(value) {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && typeof value.message === 'string' && value.message.trim()) {
    return value.message;
  }
  return null;
}

export { Sentry };
