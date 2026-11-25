// Edge Functions report to Sentry only from production (spec 0084, FR4,
// AC2). No network and no Sentry call: this checks the pure helper that
// decides it. Needs --allow-env, because errorReporting.ts reads
// SENTRY_DSN/SENTRY_ENVIRONMENT when it loads.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isReportingEnvironment } from '../functions/_shared/errorReporting.ts';

Deno.test('production reports', () => {
  assertEquals(isReportingEnvironment('production'), true);
});

Deno.test('every other environment sends nothing', () => {
  for (const env of ['development', 'staging', 'Production', '', undefined]) {
    assertEquals(isReportingEnvironment(env), false, `env ${JSON.stringify(env)}`);
  }
});

// QA additions (spec 0084, reviewer "sentryEnabled isn't directly tested").
// errorReporting.ts reads SENTRY_DSN/SENTRY_ENVIRONMENT once, when it loads,
// so each case loads its own copy (a distinct ?query makes Deno load it
// again) with the secrets set the way a project would have them. Still no
// network: Sentry only sends when an event is captured, and this file has
// no net permission.
const MODULE = new URL('../functions/_shared/errorReporting.ts', import.meta.url).href;
let copy = 0;

async function loadWith(env: { dsn?: string; environment?: string }) {
  if (env.dsn === undefined) Deno.env.delete('SENTRY_DSN');
  else Deno.env.set('SENTRY_DSN', env.dsn);
  if (env.environment === undefined) Deno.env.delete('SENTRY_ENVIRONMENT');
  else Deno.env.set('SENTRY_ENVIRONMENT', env.environment);
  try {
    return await import(`${MODULE}?qa=${++copy}`);
  } finally {
    Deno.env.delete('SENTRY_DSN');
    Deno.env.delete('SENTRY_ENVIRONMENT');
  }
}

const DSN = 'https://key@example.test/1';

Deno.test('sentryEnabled is off on dev, staging, unset and miscased environments even with a DSN', async () => {
  for (const environment of ['development', 'staging', 'Production', ' production', '', undefined]) {
    const mod = await loadWith({ dsn: DSN, environment });
    assertEquals(mod.sentryEnabled, false, `environment ${JSON.stringify(environment)}`);
  }
});

Deno.test('sentryEnabled is off in production with no DSN', async () => {
  for (const dsn of [undefined, '']) {
    const mod = await loadWith({ dsn, environment: 'production' });
    assertEquals(mod.sentryEnabled, false, `dsn ${JSON.stringify(dsn)}`);
  }
});

Deno.test('outside production, reportError and serverError send and flush nothing, and serverError still answers', async () => {
  const mod = await loadWith({ dsn: DSN, environment: 'staging' });
  const waited: Promise<unknown>[] = [];
  const g = globalThis as { EdgeRuntime?: unknown };
  g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => waited.push(p) };
  const originalError = console.error;
  console.error = () => {};
  try {
    mod.reportError(new Error('staging boom'), { function: 'qa' });
    const res: Response = mod.serverError(new Error('staging boom'), { function: 'qa' }, { 'X-Test': '1' });
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: mod.GENERIC_ERROR });
    assertEquals(waited.length, 0);
  } finally {
    console.error = originalError;
    delete g.EdgeRuntime;
  }
});

Deno.test('in production with a DSN, sentryEnabled is on and every report is flushed via EdgeRuntime.waitUntil', async () => {
  const mod = await loadWith({ dsn: DSN, environment: 'production' });
  assertEquals(mod.sentryEnabled, true);
  const waited: Promise<unknown>[] = [];
  const g = globalThis as { EdgeRuntime?: unknown };
  g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => waited.push(p) };
  try {
    mod.reportError(new Error('production boom'), { function: 'qa' }, 'warning');
    assertEquals(waited.length, 1);
    await Promise.all(waited);
  } finally {
    delete g.EdgeRuntime;
  }
});
