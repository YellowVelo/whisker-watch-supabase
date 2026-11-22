// Shared Sentry error reporting for Edge Functions (spec 0052).
//
// Usage in a function's top-level catch block (spec 0078):
//   import { serverError } from '../_shared/errorReporting.ts';
//   ...
//   } catch (err) {
//     return serverError(err, { function: 'ask-vet-assistant' }, corsHeaders);
//   }
// Use reportError() directly for a failure the function handles itself
// (it still answers with its own specific message).
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
//
// Spec 0078 (PA-34): Supabase may stop a function as soon as it replies,
// which can drop a report that is still being sent. So every report is
// followed by a flush (up to FLUSH_TIMEOUT_MS) that the runtime keeps alive
// in the background with EdgeRuntime.waitUntil, without delaying the reply.
// Outside Supabase's runtime (local Deno tests) there is no EdgeRuntime, so
// the flush simply runs on its own.
const FLUSH_TIMEOUT_MS = 2000;

type EdgeRuntimeGlobal = { waitUntil?: (promise: Promise<unknown>) => void };

export function reportError(err: unknown, tags: Record<string, string> = {}) {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      scope.setTag(key, value);
    }
    Sentry.captureException(err);
  });
  const flushing = Sentry.flush(FLUSH_TIMEOUT_MS).catch(() => false);
  const edgeRuntime = (globalThis as { EdgeRuntime?: EdgeRuntimeGlobal }).EdgeRuntime;
  edgeRuntime?.waitUntil?.(flushing);
}

// The one message any function sends back for an unexpected error (spec
// 0078, PA-35). The real detail goes to the function log and Sentry, never
// to the browser: Register, Beta signup and Early Adopters show whatever
// `error` says, so a raw database message would reach visitors. Same wording
// as the app's own AI error (src/lib/aiGuardrails.js aiErrorText).
export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// Logs, reports and answers an unexpected error in one step. Use it in a
// function's top-level catch. Intentional 4xx replies (bad input, rate
// limits, "not allowed") keep their own specific messages.
export function serverError(
  err: unknown,
  tags: Record<string, string>,
  corsHeaders: Record<string, string>,
): Response {
  console.error(`${tags.function ?? 'edge-function'} unexpected error:`, err);
  reportError(err, tags);
  return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
