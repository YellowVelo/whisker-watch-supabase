// Spec 0084 QA: guards for the build and backup settings that keep source
// maps private (AC6, AC7) and keep the backup safe from its Sentry check-ins
// (AC8, AC9). These read the config files as text; the real proof is the
// live checks in QA_Test_Plan.md §5.12.
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('source maps stay private (spec 0084, AC6/AC7)', () => {
  it('public/.assetsignore keeps any .map file out of the published site', () => {
    const lines = read('public/.assetsignore').split(/\r?\n/).map((l) => l.trim());
    expect(lines).toContain('*.map');
  });

  it('vite.config.js only makes maps when there is a token, hides them, and deletes them after upload', () => {
    const config = read('vite.config.js');
    expect(config).toMatch(/const sentryUploadEnabled = !!process\.env\.SENTRY_AUTH_TOKEN/);
    expect(config).toMatch(/sourcemap:\s*sentryUploadEnabled \? 'hidden' : false/);
    expect(config).toMatch(/disable:\s*!sentryUploadEnabled/);
    expect(config).toMatch(/filesToDeleteAfterUpload:\s*\[\s*'\.\/dist\/\*\*\/\*\.map'\s*\]/);
    // The service worker is written after the upload step, so it must not make its own map.
    expect(config).toMatch(/workbox:\s*\{[^}]*sourcemap:\s*false/s);
    // A failed upload must not fail the build.
    expect(config).toMatch(/errorHandler:/);
  });

  it('the Sentry plugin is the last plugin, after VitePWA', () => {
    const config = read('vite.config.js');
    const pwa = config.indexOf('VitePWA({');
    const sentry = config.indexOf('sentryVitePlugin({');
    const pluginsEnd = config.indexOf('\n  ],', sentry);
    expect(pwa).toBeGreaterThan(-1);
    expect(sentry).toBeGreaterThan(pwa);
    expect(config.slice(sentry, pluginsEnd)).not.toMatch(/\n {4}[a-zA-Z]+\(\{/);
  });

  it('@sentry/vite-plugin is pinned to an exact version', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.devDependencies['@sentry/vite-plugin']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// Pulls one step's `run: |` script out of db-backup.yml by its name.
function stepBlock(yml, name) {
  const start = yml.indexOf(`- name: '${name}'`);
  if (start === -1) throw new Error(`step not found: ${name}`);
  const next = yml.indexOf('\n      - ', start + 1);
  return yml.slice(start, next === -1 ? undefined : next);
}

function runScript(block) {
  const lines = block.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+run: \|\s*$/.test(l));
  const body = lines.slice(at + 1);
  const indent = body.find((l) => l.trim())?.match(/^\s*/)?.[0].length ?? 0;
  return body.map((l) => l.slice(indent)).join('\n');
}

const hasBash = spawnSync('bash', ['-c', 'exit 0']).status === 0;

describe('backup Sentry check-ins (spec 0084, AC8/AC9)', () => {
  const yml = read('.github/workflows/db-backup.yml');
  const inProgress = stepBlock(yml, 'Sentry check-in: in progress');
  const result = stepBlock(yml, 'Sentry check-in: result');

  it('in-progress runs first, before checkout and the backup', () => {
    const steps = yml.indexOf('    steps:');
    expect(yml.indexOf("- name: 'Sentry check-in: in progress'")).toBeGreaterThan(steps);
    expect(yml.indexOf("- name: 'Sentry check-in: in progress'")).toBeLessThan(yml.indexOf('actions/checkout'));
    expect(yml.indexOf("- name: 'Sentry check-in: in progress'")).toBeLessThan(yml.indexOf('scripts/backup-db.sh'));
  });

  it('the result step is last, always runs, and sends ok only on success', () => {
    expect(yml.indexOf("- name: 'Sentry check-in: result'")).toBeGreaterThan(yml.indexOf('scripts/backup-db.sh'));
    expect(yml.slice(yml.indexOf("- name: 'Sentry check-in: result'")).match(/- name:/g)).toHaveLength(1);
    expect(result).toMatch(/if: always\(\)/);
    expect(result).toMatch(/CHECKIN_STATUS: \$\{\{ job\.status == 'success' && 'ok' \|\| 'error' \}\}/);
  });

  it('the address comes from the secret and is never printed', () => {
    expect(yml).toMatch(/SENTRY_CRON_URL: \$\{\{ secrets\.SENTRY_CRON_URL \}\}/);
    expect(yml).not.toMatch(/echo[^\n]*SENTRY_CRON_URL/);
    expect(yml).not.toMatch(/set -x/);
    for (const block of [inProgress, result]) {
      expect(block).not.toMatch(/continue-on-error:\s*false/);
      expect(runScript(block)).toMatch(/curl -fsS --max-time 10 -o \/dev\/null/);
    }
  });

  // Runs each step's real script with GitHub's shell flags (bash -eo pipefail)
  // and a stand-in curl that records the address and fails, like an
  // unreachable Sentry would.
  const cases = [
    ['https://o1.ingest.sentry.io/api/2/cron/nightly-database-backup/key/', 'https://o1.ingest.sentry.io/api/2/cron/nightly-database-backup/key/?status='],
    ['https://o1.ingest.sentry.io/api/2/cron/nightly-database-backup/key', 'https://o1.ingest.sentry.io/api/2/cron/nightly-database-backup/key/?status='],
    ['https://o1.ingest.sentry.io/api/2/cron/x/?sentry_key=abc', 'https://o1.ingest.sentry.io/api/2/cron/x/?sentry_key=abc&status='],
  ];

  for (const [label, block, status] of [
    ['in progress', inProgress, 'in_progress'],
    ['ok', result, 'ok'],
    ['error', result, 'error'],
  ]) {
    it.skipIf(!hasBash).each(cases)(`${label}: builds the right address from %s, and a failed check-in never fails the step`, (cronUrl, expected) => {
      const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cron-')), 'curl.log');
      const script = `curl() { for a in "$@"; do last="$a"; done; printf '%s\\n' "$last" >> "$CURL_LOG"; return 7; }\n${runScript(block)}`;
      const run = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
        env: { ...process.env, SENTRY_CRON_URL: cronUrl, CHECKIN_STATUS: status, CURL_LOG: log },
        encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      expect(fs.readFileSync(log, 'utf8').trim()).toBe(`${expected}${status}`);
    });

    it.skipIf(!hasBash)(`${label}: with no address set, sends nothing and passes`, () => {
      const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cron-')), 'curl.log');
      const script = `curl() { echo called >> "$CURL_LOG"; return 7; }\n${runScript(block)}`;
      const env = { ...process.env, CHECKIN_STATUS: status, CURL_LOG: log };
      delete env.SENTRY_CRON_URL;
      const run = spawnSync('bash', ['-eo', 'pipefail', '-c', script], { env, encoding: 'utf8' });
      expect(run.status).toBe(0);
      expect(fs.existsSync(log)).toBe(false);
    });
  }
});
