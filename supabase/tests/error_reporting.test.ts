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
