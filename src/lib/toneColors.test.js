import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tint, PALETTE_SOFT } from './toneColors';

describe('tint (spec 0079 Part B)', () => {
  it('builds an rgb() color from the shared channel variable, keeping the exact strength', () => {
    expect(tint('teal', 0.15)).toBe('rgb(var(--tone-good-rgb) / 0.15)');
    expect(tint('amber', 0.12)).toBe('rgb(var(--tone-warn-rgb) / 0.12)');
    expect(tint('red', 0.08)).toBe('rgb(var(--tone-bad-rgb) / 0.08)');
    expect(tint('gray', 0.5)).toBe('rgb(var(--tone-neutral-rgb) / 0.5)');
    expect(tint('sky', 0.16)).toBe('rgb(var(--accent-sky-rgb) / 0.16)');
  });

  it('PALETTE_SOFT is the 15% strength of each color', () => {
    expect(PALETTE_SOFT).toEqual({
      sky: 'rgb(var(--accent-sky-rgb) / 0.15)',
      teal: 'rgb(var(--tone-good-rgb) / 0.15)',
      amber: 'rgb(var(--tone-warn-rgb) / 0.15)',
      red: 'rgb(var(--tone-bad-rgb) / 0.15)',
      gray: 'rgb(var(--tone-neutral-rgb) / 0.15)',
    });
  });

  it('refuses a color that is not in the palette', () => {
    expect(() => tint('purple', 0.15)).toThrow();
  });

  it('index.css defines each channel variable once, and it matches index.css\'s own hex variable', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf8');
    const readOnce = (name) => {
      const defs = [...css.matchAll(new RegExp(`(?<![\\w-])${name}\\s*:\\s*([^;]+);`, 'g'))];
      expect(defs, `${name} should be defined exactly once in index.css`).toHaveLength(1);
      return defs[0][1].trim();
    };
    const pairs = ['--tone-good', '--tone-warn', '--tone-bad', '--tone-neutral', '--accent-sky'];
    for (const hexVar of pairs) {
      const hex = readOnce(hexVar);
      expect(hex, `${hexVar} should be a 6-digit hex color`).toMatch(/^#[0-9a-f]{6}$/i);
      const fromHex = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
      const channels = readOnce(`${hexVar}-rgb`).split(/\s+/).map(Number).join(' ');
      expect(channels, `${hexVar}-rgb should match ${hexVar} (${hex})`).toBe(fromHex);
    }
  });
});

// Spec 0079 AC7/AC8: the five palette colors live only in src/index.css.
// A hand-typed rgba()/rgb() or hex copy anywhere else in app code fails here.
const TRIPLES = ['76,199,176', '244,199,107', '229,115,115', '169,174,181', '111,183,255'];
const HEXES = ['4CC7B0', 'F4C76B', 'E57373', 'A9AEB5', '6FB7FF'];
const TRIPLE_RE = new RegExp(
  `rgba?\\(\\s*(?:${TRIPLES.map((t) => t.split(',').join('(?:\\s*,\\s*|\\s+)')).join('|')})`,
  'i',
);
// 6-digit (#4CC7B0) or 8-digit with alpha (#4CC7B026).
const HEX_RE = new RegExp(`#(?:${HEXES.join('|')})(?:[0-9a-f]{2})?(?![0-9a-f])`, 'i');

function findPaletteLiterals(text) {
  return TRIPLE_RE.test(text) || HEX_RE.test(text);
}

describe('no hand-typed palette colors in the app (spec 0079, AC7/AC8)', () => {
  it('the matcher catches every hand-typed form', () => {
    expect(findPaletteLiterals("'rgba(76,199,176,0.15)'")).toBe(true);
    expect(findPaletteLiterals("'rgba(244, 199, 107, 0.3)'")).toBe(true);
    expect(findPaletteLiterals("'rgb(229 115 115 / 0.15)'")).toBe(true);
    expect(findPaletteLiterals("'rgb(169,174,181)'")).toBe(true);
    expect(findPaletteLiterals("'#6fb7ff'")).toBe(true);
    expect(findPaletteLiterals("'#E57373'")).toBe(true);
    expect(findPaletteLiterals("'#4CC7B026'")).toBe(true);
    expect(findPaletteLiterals("'#a9aeb5ff'")).toBe(true);
    expect(findPaletteLiterals('border: 1px solid #F4C76B80;')).toBe(true);
    expect(findPaletteLiterals("'rgba( 111 , 183 , 255 , .5)'")).toBe(true);
    expect(findPaletteLiterals("'#4CC7B0A'")).toBe(false); // 7 digits isn't a color
    expect(findPaletteLiterals("'#4CC7B0123'")).toBe(false); // nor 9
    expect(findPaletteLiterals("'#FFFFFF26'")).toBe(false);
    expect(findPaletteLiterals("'rgba(76,199,177,0.15)'")).toBe(false);
    expect(findPaletteLiterals("tint('teal', 0.15)")).toBe(false);
    expect(findPaletteLiterals("'rgba(255,255,255,0.1)'")).toBe(false);
  });

  it('every palette tint goes through tint() / PALETTE_SOFT / PALETTE', () => {
    const srcDir = path.resolve(__dirname, '..');
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
          if (findPaletteLiterals(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(srcDir, full));
        }
      }
    };
    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
