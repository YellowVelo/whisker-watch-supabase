import * as Sentry from '@sentry/react';

// Production error/crash monitoring (spec 0052). Sentry.init() is skipped
// entirely when VITE_SENTRY_DSN is unset (e.g. local dev without a DSN
// configured) so this is a silent no-op rather than an error — monitoring
// must never be able to break the app itself.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export const sentryEnabled = !!dsn;

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
    // Error capture only — no performance tracing or session replay (spec
    // 0052 non-goals).
    tracesSampleRate: 0,
    beforeSend(event) {
      // Sandbox/test accounts are excluded from error monitoring, same
      // "not a real user" distinction analytics.js already makes via
      // account_type — keeps the dashboard to real-user signal only.
      if (event.tags?.account_type && event.tags.account_type !== 'production') {
        return null;
      }
      return event;
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

export { Sentry };
