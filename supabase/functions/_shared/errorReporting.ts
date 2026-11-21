// Shared Sentry error reporting for Edge Functions (spec 0052).
//
// Usage in a function's top-level catch block:
//   import { reportError } from '../_shared/errorReporting.ts';
//   ...
//   } catch (err) {
//     console.error('...:', err);
//     reportError(err, { function: 'ask-vet-assistant' });
//     return new Response(...);
//   }
//
// SENTRY_DSN/SENTRY_ENVIRONMENT are Edge Function secrets, set per Supabase
// project (wysker-watch-dev / wysker-watch-staging / Whisker-Watch prod —
// same DSN value, different SENTRY_ENVIRONMENT — never set on the
// disposable wysker-watch-restore-scratch project). If SENTRY_DSN is
// unset, reportError() is a no-op — monitoring must never be able to
// break a function.
//
// The version is pinned on purpose (spec 0075, 2026-11-21). Unpinned, every
// deploy takes the newest release, and 11.16.0 (2026-11-20) crashes the
// function on startup when Sentry.init runs. Every request then fails with
// WORKER_ERROR, including requests that never report an error. 11.15.0 is
// the last version confirmed working on Supabase's Edge runtime. Before
// raising it, deploy a function using it to dev and call it once.
import * as Sentry from 'npm:@sentry/deno@11.15.0';

const dsn = Deno.env.get('SENTRY_DSN');
const environment = Deno.env.get('SENTRY_ENVIRONMENT') || 'development';

export const sentryEnabled = !!dsn;

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0,
  });
}

// Supabase can reuse a warm Edge Function instance across unrelated
// requests. Sentry's Deno SDK does not automatically separate scope
// between requests on a reused instance, so every report explicitly runs
// inside a fresh Sentry.withScope() — this is what stops one request's
// tags/context from ever being attributed to a different request's error.
export function reportError(err: unknown, tags: Record<string, string> = {}) {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      scope.setTag(key, value);
    }
    Sentry.captureException(err);
  });
}
