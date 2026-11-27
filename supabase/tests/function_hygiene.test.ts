// Code checks for every Edge Function (spec 0078, punch list PA-62/PA-35).
// No network and no logins: this reads the source files only.
//
// 1. Every npm:/jsr: import names an exact x.y.z version. An unpinned
//    @sentry/deno picked up a broken release on deploy and crashed sign-up
//    on staging and prod for 22 hours on 2026-11-21 (spec 0075).
// 2. No function sends a raw error message back to the browser. Unexpected
//    errors go through serverError() (_shared/errorReporting.ts), which
//    reports the detail to Sentry and answers with a plain message.
// 3. serverError() itself answers 500, with the plain message and the
//    caller's CORS headers.
// 4. ask-vet-assistant never reads storage with the service-role client, so
//    storage's own rules always decide who can scan a file (spec 0082).
// 5. generate-vet-report no longer reads the retired wellness_scores table
//    or shows a Health Score (spec 0080).
// 6. ask-vet-assistant and generate-vet-report no longer mention the
//    retired symptom_logs or food_logs tables (spec 0081).
// 7. generate-vet-report and ask-vet-assistant judge medications with the
//    shared "is it current?" rule on the caller's calendar (spec 0087).
//
// Run: deno test --allow-read --allow-env --node-modules-dir=none supabase/tests/function_hygiene.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { GENERIC_ERROR, serverError } from '../functions/_shared/errorReporting.ts';

const FUNCTIONS_DIR = new URL('../functions/', import.meta.url);

// send-email is ops-only (only the server's Secret key can call it, never a
// browser), and its callers branch on the email service's error code and
// message, so it keeps returning them.
const RAW_MESSAGE_ALLOWED = new Set(['send-email']);

async function listTsFiles(dir: URL): Promise<URL[]> {
  const files: URL[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
    if (entry.isDirectory) files.push(...(await listTsFiles(url)));
    else if (entry.name.endsWith('.ts')) files.push(url);
  }
  return files;
}

async function listFunctionNames(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (entry.isDirectory && entry.name !== '_shared') names.push(entry.name);
  }
  return names.sort();
}

Deno.test('every npm:/jsr: import under supabase/ names an exact version', async () => {
  const roots = [FUNCTIONS_DIR, new URL('./', import.meta.url)];
  const offenders: string[] = [];
  for (const root of roots) {
    for (const file of await listTsFiles(root)) {
      const source = await Deno.readTextFile(file);
      for (const match of source.matchAll(/['"]((?:npm|jsr):[^'"]+)['"]/g)) {
        const specifier = match[1];
        // npm:@scope/name@1.2.3/sub or npm:name@1.2.3 — the version is
        // the part after the last "@" that follows the package name.
        const versionMatch = specifier.match(/^(?:npm|jsr):(?:@[^/@]+\/)?[^/@]+@([^/]+)/);
        if (!versionMatch || !/^\d+\.\d+\.\d+$/.test(versionMatch[1])) {
          offenders.push(`${file.pathname.split('/supabase/')[1]}: ${specifier}`);
        }
      }
    }
  }
  assertEquals(offenders, [], `Imports without an exact x.y.z version:\n${offenders.join('\n')}`);
});

Deno.test('no function sends a raw error message to the browser', async () => {
  const offenders: string[] = [];
  for (const name of await listFunctionNames()) {
    if (RAW_MESSAGE_ALLOWED.has(name)) continue;
    const source = await Deno.readTextFile(new URL(`${name}/index.ts`, FUNCTIONS_DIR));
    source.split('\n').forEach((line, i) => {
      const isReply = /JSON\.stringify\(|json\(|jsonResponse\(|jsonError\(/.test(line);
      if (isReply && /\b\w*(err|Err|error|Error)\??\.message\b/.test(line)) {
        offenders.push(`${name}/index.ts:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assertEquals(offenders, [], `Replies containing a raw error message:\n${offenders.join('\n')}`);
});

Deno.test('every function reports unexpected errors to Sentry', async () => {
  const missing: string[] = [];
  for (const name of await listFunctionNames()) {
    const source = await Deno.readTextFile(new URL(`${name}/index.ts`, FUNCTIONS_DIR));
    if (!/\b(serverError|reportError)\(/.test(source)) missing.push(name);
  }
  assertEquals(missing, [], `Functions that never report to Sentry: ${missing.join(', ')}`);
});

Deno.test('ask-vet-assistant never reads storage with the service-role client', async () => {
  const source = await Deno.readTextFile(new URL('ask-vet-assistant/index.ts', FUNCTIONS_DIR));
  assert(!/adminClient\s*\.\s*storage/.test(source), "ask-vet-assistant must download files with the caller's client, not adminClient");
  // Every storage call must go through the caller's own client, whatever the
  // other client is named.
  const storageOwners = [...source.matchAll(/(\w+)\s*\.\s*storage\b/g)].map((m) => m[1]);
  const notCaller = storageOwners.filter((name) => name !== 'supabaseClient');
  assertEquals(notCaller, [], `storage used on a client other than supabaseClient: ${notCaller.join(', ')}`);
  assert(storageOwners.length > 0, 'expected ask-vet-assistant to read files through supabaseClient.storage');
});

Deno.test('serverError answers 500 with the plain message and CORS headers', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = serverError(new Error('relation "pets" does not exist'), { function: 'test' }, {
      'Access-Control-Allow-Origin': 'https://example.test',
    });
    assertEquals(res.status, 500);
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://example.test');
    assertEquals(res.headers.get('Content-Type'), 'application/json');
    const body = await res.json();
    assertEquals(body, { error: GENERIC_ERROR });
    assert(!JSON.stringify(body).includes('pets'));
  } finally {
    console.error = originalError;
  }
});

Deno.test('generate-vet-report no longer reads wellness_scores or shows a Health Score (spec 0080, FR14/AC10)', async () => {
  const source = await Deno.readTextFile(new URL('generate-vet-report/index.ts', FUNCTIONS_DIR));
  assert(!/wellness_scores/.test(source), 'generate-vet-report/index.ts still mentions wellness_scores');
  assert(!/health[ _]score/i.test(source), 'generate-vet-report/index.ts still mentions Health Score');
});

Deno.test('ask-vet-assistant and generate-vet-report never read symptom_logs or food_logs (spec 0081, FR5/FR16)', async () => {
  const offenders: string[] = [];
  const files = [
    ...(await listTsFiles(new URL('ask-vet-assistant/', FUNCTIONS_DIR))),
    ...(await listTsFiles(new URL('generate-vet-report/', FUNCTIONS_DIR))),
    new URL('_shared/weight.ts', FUNCTIONS_DIR),
  ];
  assert(files.length >= 3, 'expected to find the two functions\' source files');
  for (const file of files) {
    const source = await Deno.readTextFile(file);
    for (const table of ['symptom_logs', 'food_logs']) {
      if (source.includes(table)) offenders.push(`${file.pathname.split('/supabase/')[1]}: ${table}`);
    }
  }
  assertEquals(offenders, [], `Retired tables still mentioned:\n${offenders.join('\n')}`);
});

// Spec 0087 QA: wiring checks for the "is it current?" rule. The rule itself
// is unit-tested (current_items.test.ts, src/lib/aiServerParity.test.js) and
// loadActiveMedications is tested against dev (ai_context.test.ts); these
// catch the call sites drifting back to `m.active` or to UTC's "today".
Deno.test('generate-vet-report marks and orders medications by the current rule on the owner\'s calendar (spec 0087 FR8)', async () => {
  const source = await Deno.readTextFile(new URL('generate-vet-report/index.ts', FUNCTIONS_DIR));
  assert(
    /import\s*\{[^}]*\bmedicationStatus\b[^}]*\bsortCurrentFirst\b[^}]*\}\s*from\s*'\.\.\/_shared\/currentItems\.ts'/.test(source) ||
      /import\s*\{[^}]*\bsortCurrentFirst\b[^}]*\bmedicationStatus\b[^}]*\}\s*from\s*'\.\.\/_shared\/currentItems\.ts'/.test(source),
    'generate-vet-report must import medicationStatus and sortCurrentFirst from _shared/currentItems.ts',
  );
  const todayMatch = source.match(/const\s+(\w+)\s*=\s*dateStrInTimezone\(\s*profile\?\.timezone\s*,\s*0\s*\)/);
  assert(todayMatch, "today for the Medications table must be dateStrInTimezone(profile?.timezone, 0)");
  const todayVar = todayMatch[1];
  assert(
    new RegExp(String.raw`sortCurrentFirst\(\s*medications\b[^)]*,\s*` + todayVar + String.raw`\s*\)`).test(source),
    'medication rows must be ordered with sortCurrentFirst(medications, <owner today>)',
  );
  assert(
    new RegExp(String.raw`medicationStatus\(\s*m\s*,\s*` + todayVar + String.raw`\s*\)`).test(source),
    "the Status column must come from medicationStatus(m, <owner today>)",
  );
  assert(!/m\.active\s*\?\s*'Active'/.test(source), "Status column still reads m.active directly");
  assert(!/order\(\s*'active'/.test(source), "medications are still ordered by the raw active switch");
});

Deno.test('ask-vet-assistant passes the caller\'s today to loadActiveMedications in pet_chat and pet_insights (spec 0087 FR2/FR7)', async () => {
  const source = await Deno.readTextFile(new URL('ask-vet-assistant/index.ts', FUNCTIONS_DIR));
  const calls = [...source.matchAll(/loadActiveMedications\(([^)]*\([^)]*\)[^)]*|[^)]*)\)/g)].map((m) => m[1]);
  assert(calls.length >= 2, `expected at least 2 loadActiveMedications calls, found ${calls.length}`);
  for (const args of calls) {
    assert(
      /^\s*client\s*,\s*req\.pet_id\s*,\s*dateStrInTimezone\(\s*timezone\s*,\s*0\s*\)\s*$/.test(args),
      `loadActiveMedications called without the caller's today: (${args})`,
    );
  }
  for (const task of ['pet_chat', 'pet_insights']) {
    const start = source.indexOf(`case '${task}':`);
    assert(start >= 0, `case '${task}' not found`);
    const next = source.indexOf('case \'', start + 1);
    const block = source.slice(start, next < 0 ? undefined : next);
    const tzAt = block.search(/const\s+timezone\s*=\s*await\s+loadCallerTimezone\(\s*client\s*,\s*userId\s*\)/);
    const medsAt = block.indexOf('loadActiveMedications(');
    assert(medsAt >= 0, `${task} no longer loads medications`);
    assert(tzAt >= 0 && tzAt < medsAt, `${task} must load the caller's time zone before its medications`);
  }
});

Deno.test('ask-vet-assistant loadActiveMedications filters by the shared current rule (spec 0087 FR7)', async () => {
  const source = await Deno.readTextFile(new URL('ask-vet-assistant/context.ts', FUNCTIONS_DIR));
  assert(/import\s*\{\s*isCurrentItem\s*\}\s*from\s*'\.\.\/_shared\/currentItems\.ts'/.test(source), 'context.ts must import isCurrentItem');
  const fnStart = source.indexOf('export async function loadActiveMedications(');
  assert(fnStart >= 0, 'loadActiveMedications not found');
  const rest = source.slice(fnStart);
  const end = rest.search(/\r?\n\}\r?\n/);
  assert(end > 0, 'could not find the end of loadActiveMedications');
  const body = rest.slice(0, end);
  assert(/select\('[^']*\bend_date\b[^']*'\)/.test(body), 'loadActiveMedications must select end_date');
  assert(/isCurrentItem\(\s*m\s*,\s*todayStr\s*\)/.test(body), 'loadActiveMedications must filter with isCurrentItem(m, todayStr)');
});
