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

  it('index.css defines each channel variable once, matching its hex color', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf8');
    const expected = {
      '--tone-good-rgb': '76 199 176',
      '--tone-warn-rgb': '244 199 107',
      '--tone-bad-rgb': '229 115 115',
      '--tone-neutral-rgb': '169 174 181',
      '--accent-sky-rgb': '111 183 255',
    };
    for (const [name, value] of Object.entries(expected)) {
      const defs = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g')) || [];
      expect(defs).toHaveLength(1);
      expect(defs[0].split(':')[1].replace(';', '').trim()).toBe(value);
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
const HEX_RE = new RegExp(`#(?:${HEXES.join('|')})(?![0-9a-f])`, 'i');

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
