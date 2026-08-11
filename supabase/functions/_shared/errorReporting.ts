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
import * as Sentry from 'npm:@sentry/deno';

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
