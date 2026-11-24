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
