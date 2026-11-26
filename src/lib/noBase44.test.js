import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Spec 0081 FR26 / AC13: the name of the platform this app was first built
// on appears nowhere in app or server code. Migrations and docs are exempt:
// they record history. The name is assembled from two halves so this file
// doesn't match itself.
const OLD_PLATFORM = ['base', '44'].join('');
const OLD_PLATFORM_RE = new RegExp(OLD_PLATFORM, 'i');

const ROOT = path.resolve(__dirname, '..', '..');

// Folders scanned in full (every file, any extension).
const SCANNED_DIRS = ['src', 'supabase/functions', 'supabase/tests', 'e2e', 'scripts'];

// Root config files, plus package.json.
const SCANNED_FILES = [
  'package.json',
  'components.json',
  'eslint.config.js',
  'index.html',
  'jsconfig.json',
  'playwright.config.js',
  'postcss.config.js',
  'pwa-assets.config.js',
  'tailwind.config.js',
  'vite.config.js',
  'vitest.config.js',
  'wrangler.jsonc',
  'supabase/config.toml',
];

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|xlsx|xls|zip|woff2?|ttf)$/i;

function mentionsOldPlatform(text) {
  return OLD_PLATFORM_RE.test(text);
}

function filesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!BINARY.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe('no leftover mentions of the old platform (spec 0081, FR26/AC13)', () => {
  it('the matcher catches any capitalization and ignores lookalikes', () => {
    expect(mentionsOldPlatform('// Built on ' + 'Base' + '44')).toBe(true);
    expect(mentionsOldPlatform('BASE' + '44')).toBe(true);
    expect(mentionsOldPlatform('import x from "@' + 'base' + '44/sdk"')).toBe(true);
    expect(mentionsOldPlatform('base64')).toBe(false);
    expect(mentionsOldPlatform('base 4')).toBe(false);
  });

  it('every scanned folder and file exists, so a rename cannot silently skip it', () => {
    for (const rel of [...SCANNED_DIRS, ...SCANNED_FILES]) {
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} should exist`).toBe(true);
    }
  });

  it('nothing in src/, supabase/functions/, supabase/tests/, e2e/, scripts/ or the root config files mentions it', () => {
    const files = [
      ...SCANNED_DIRS.flatMap((d) => filesUnder(path.join(ROOT, d))),
      ...SCANNED_FILES.map((f) => path.join(ROOT, f)),
    ];
    // This file is among them, and must pass too.
    expect(files).toContain(path.resolve(__filename));
    const offenders = files
      .filter((f) => mentionsOldPlatform(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it('the repo-root folder exported from the old platform is gone', () => {
    expect(fs.existsSync(path.join(ROOT, OLD_PLATFORM))).toBe(false);
  });
});
