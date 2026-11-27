import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Spec 0087 QA: source-level wiring checks for the "is it current?" rule.
// The rule (currentItems.test.js) and each screen's filter are unit-tested;
// these catch a call site drifting back to a hand-written `active` check or
// to UTC's "today" (the old FoodSection bug, spec 0087 Before You Approve 5).
const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CALL_SITES = {
  'src/components/FoodSection.jsx': /splitCurrent\(\s*foods\s*,\s*todayForUser\(\s*user\s*\)\s*\)/,
  'src/components/MedicationSection.jsx': /splitCurrent\(\s*meds\s*,\s*todayForUser\(\s*user\s*\)\s*\)/,
  'src/components/PetProfileContent.jsx': /currentFromSettled\(\s*medsR\s*,/,
  'src/components/PetSittingSection.jsx': /isCurrentItem\(\s*m\s*,\s*todayStr\s*\)/,
  'src/components/ExportCalendarButton.jsx': /todayStr:\s*todayForUser\(\s*user\s*\)/,
};

describe('current foods/meds wiring (spec 0087 QA)', () => {
  it.each(Object.entries(CALL_SITES))('%s uses the shared rule', (file, pattern) => {
    const source = read(file);
    expect(source).toMatch(/from '@\/lib\/currentItems'/);
    expect(source).toMatch(pattern);
  });

  it('the pet profile filters foods with the shared rule too', () => {
    expect(read('src/components/PetProfileContent.jsx')).toMatch(/currentFromSettled\(\s*foodsR\s*,/);
  });

  it('the sit card filters foods with the shared rule too', () => {
    expect(read('src/components/PetSittingSection.jsx')).toMatch(/isCurrentItem\(\s*f\s*,\s*todayStr\s*\)/);
    // SitCard gets the viewer's today from the page.
    expect(read('src/components/PetSittingSection.jsx')).toMatch(/todayStr=\{todayStr\}/);
  });

  it.each([
    'src/components/FoodSection.jsx',
    'src/components/MedicationSection.jsx',
    'src/components/PetProfileContent.jsx',
    'src/components/PetSittingSection.jsx',
  ])('%s has no hand-written active/end_date filter or UTC "today"', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/\.filter\(\s*\(?\w+\)?\s*=>\s*!?\w+\.active\b/);
    expect(source).not.toMatch(/end_date\s*>=\s*todayStr/);
    expect(source).not.toMatch(/toISOString\(\)\.split\('T'\)\[0\]/);
  });

  it("Home passes the viewer's today to every medication count", () => {
    const source = read('src/pages/Home.jsx');
    const calls = [...source.matchAll(/getActiveMedicationCountsForPets\(([^;]*?)\)\s*,/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const args of calls) expect(args).toMatch(/,\s*todayForUser\(\s*user\s*\)\s*$/);
  });
});
