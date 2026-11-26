import { describe, it, expect, vi } from 'vitest';

// Spec 0081 T18: the shared bloodwork import review's logic (FR30, FR31,
// FR35, FR36; AC16, AC17, AC21-AC23). Every value here is made up.

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/errorMonitoring', () => ({ reportClientError: vi.fn() }));

const {
  buildReviewVisits, skippedText, skippedGroups, includedVisits, canSaveReview, reviewVisitToRecord,
  bloodworkImportErrorText, shouldReportImportError, changeVisitDate, toggleVisitWeight, weightToSave,
  weightLineEnabled, isFutureDate, weightTicked, refreshVisitsOnFile, reviewCheckboxNames, weightLineText,
  WEIGHT_SKIPPED_MESSAGE,
} = await import('./bloodworkImport');
const { dateStrInTimezone } = await import('@/lib/timezone');
const { SpreadsheetReadError, SPREADSHEET_MESSAGES } = await import('./bloodworkSpreadsheet');
const { UploadRejectedError, UPLOAD_MESSAGES } = await import('@/api/storageClient');

const none = { bloodworkDates: new Set(), weightDates: new Set() };

// Shaped like the server's cleanBloodworkAnswer() output.
const IDEXX_LIKE = {
  visits: [
    { date: '2026-10-02', lab_name: 'IDEXX', vet_name: 'Dr. Test', values: { bun: 32, sdma: 15 }, not_tracked: ['Chloride', 'GGT'], conflict: false },
    { date: '2026-06-14', lab_name: 'IDEXX', values: { bun: 28 }, not_tracked: [], conflict: false },
  ],
  skipped: [
    { visit: 0, date: '2026-10-02', field: 'creatinine', label: 'Creatinine', unit: 'µmol/L', value: 194.48 },
    { visit: 1, date: '2026-06-14', field: 'creatinine', label: 'Creatinine', unit: 'µmol/L', value: 170 },
  ],
};

describe('buildReviewVisits', () => {
  it('gives one ticked card per visit with editable text values, in the app field order', () => {
    const { visits, unplacedSkipped } = buildReviewVisits(IDEXX_LIKE, none);
    expect(visits).toHaveLength(2);
    expect(unplacedSkipped).toEqual([]);
    const [a, b] = visits;
    expect(a.form).toMatchObject({ date: '2026-10-02', lab_name: 'IDEXX', vet_name: 'Dr. Test', bun: '32', sdma: '15', notes: '' });
    expect(a.valueKeys).toEqual(['bun', 'sdma']);
    expect(a.included).toBe(true);
    expect(a.notTracked).toEqual(['Chloride', 'GGT']);
    expect(b.form.date).toBe('2026-06-14');
    expect(a.key).not.toBe(b.key);
  });

  it('lists a different-unit value under its visit and never as a value (AC17, AC21)', () => {
    const { visits } = buildReviewVisits(IDEXX_LIKE, none);
    for (const v of visits) {
      expect(v.form.creatinine).toBeUndefined();
      expect(v.valueKeys).not.toContain('creatinine');
      expect(skippedText(v.skipped)).toBe('Creatinine µmol/L');
    }
  });

  it('keeps a skipped value it cannot place for a top-level line', () => {
    const { unplacedSkipped } = buildReviewVisits({ visits: IDEXX_LIKE.visits, skipped: [{ visit: null, date: null, field: 'bun', label: 'BUN', unit: 'mmol/L', value: 11 }] }, none);
    expect(unplacedSkipped).toEqual([{ label: 'BUN', unit: 'mmol/L' }]);
  });

  it('starts a visit already on file unticked and marked (AC16)', () => {
    const { visits } = buildReviewVisits(IDEXX_LIKE, { bloodworkDates: new Set(['2026-06-14']), weightDates: new Set() });
    expect(visits[0]).toMatchObject({ onFile: false, included: true });
    expect(visits[1]).toMatchObject({ onFile: true, included: false });
    expect(includedVisits(visits).map((v) => v.form.date)).toEqual(['2026-10-02']);
  });

  it('starts both versions of a same-date conflict unticked (AC23)', () => {
    const answer = {
      visits: [
        { date: '2026-10-02', values: { creatinine: 2.1 }, conflict: true },
        { date: '2026-10-02', values: { creatinine: 2.4 }, conflict: true },
      ],
      skipped: [],
    };
    const { visits } = buildReviewVisits(answer, none);
    expect(visits.map((v) => [v.conflict, v.included, v.form.creatinine])).toEqual([[true, false, '2.1'], [true, false, '2.4']]);
  });

  it('ticks a weight line unless the pet already has a weight that day (FR36, AC22)', () => {
    const answer = {
      visits: [
        { date: '2026-10-02', values: { bun: 32 }, weight_lbs: 9.8 },
        { date: '2026-06-14', values: { bun: 28 }, weight_lbs: 10.1 },
        { date: '2026-03-14', values: { bun: 25 } },
      ],
      skipped: [],
    };
    const { visits } = buildReviewVisits(answer, { bloodworkDates: new Set(), weightDates: new Set(['2026-06-14']) });
    expect(visits.map((v) => [v.weightLbs, v.includeWeight])).toEqual([[9.8, true], [10.1, false], [null, false]]);
  });

  it("disables a weight line whose day already has a weight, says so, and can't be ticked (Lynn, 2026-11-26)", () => {
    const answer = { visits: [{ date: '2026-06-14', values: {}, weight_lbs: 10.1 }, { date: '2026-05-01', values: {}, weight_lbs: 9.8 }] };
    const [onFile, free] = buildReviewVisits(answer, { bloodworkDates: new Set(), weightDates: new Set(['2026-06-14']) }).visits;
    expect(onFile).toMatchObject({ weightOnFile: true, includeWeight: false, included: true });
    expect(weightLineEnabled(onFile)).toBe(false);
    expect(weightLineText(onFile)).toBe('Weight 10.1 lbs: a weight is already logged for this day.');
    expect(toggleVisitWeight(onFile).includeWeight).toBe(false);
    expect(weightToSave(toggleVisitWeight(onFile), new Set())).toBe(false);
    expect(free.weightOnFile).toBe(false);
    expect(weightLineEnabled(free)).toBe(true);
    expect(weightLineText(free)).toBe('Weight 9.8 lbs: also add to weight history');
  });

  it('starts every weight line unticked when the weights could not be loaded', () => {
    const { visits } = buildReviewVisits({ visits: [{ date: '2026-10-02', values: {}, weight_lbs: 9.8 }] }, { bloodworkDates: new Set(), weightDates: null });
    expect(visits[0].includeWeight).toBe(false);
  });

  it('lists a weight with no unit as not imported for that reason, apart from other units', () => {
    const answer = {
      visits: [{ date: '2026-10-02', values: { bun: 32 } }],
      skipped: [
        { visit: 0, field: 'weight', label: 'Weight', unit: null, value: 9.8 },
        { visit: 0, field: 'creatinine', label: 'Creatinine', unit: 'µmol/L', value: 194.48 },
      ],
    };
    const { differentUnit, noUnit } = skippedGroups(buildReviewVisits(answer, none).visits[0].skipped);
    expect(skippedText(noUnit)).toBe('Weight');
    expect(skippedText(differentUnit)).toBe('Creatinine µmol/L');
  });

  it("starts an undated visit's weight line unticked and not tickable", () => {
    const { visits } = buildReviewVisits({ visits: [{ values: { bun: 32 }, weight_lbs: 10.1 }] }, none);
    expect(visits[0]).toMatchObject({ weightLbs: 10.1, includeWeight: false });
    expect(weightLineEnabled(visits[0])).toBe(false);
  });

  it('turns the old flat scan answer into one visit (rollout)', () => {
    const { visits } = buildReviewVisits({ date: '2026-10-02', lab_name: 'IDEXX', bun: 32, creatinine: 2.1, urine_protein: 'Trace' }, none);
    expect(visits).toHaveLength(1);
    expect(visits[0].form).toMatchObject({ date: '2026-10-02', lab_name: 'IDEXX', bun: '32', creatinine: '2.1', urine_protein: 'Trace' });
  });

  it('finds nothing in an empty or unusable answer', () => {
    expect(buildReviewVisits(null, none).visits).toEqual([]);
    expect(buildReviewVisits({}, none).visits).toEqual([]);
    expect(buildReviewVisits({ visits: [], skipped: [] }, none).visits).toEqual([]);
  });

  it('accepts { value } entries and drops malformed values and dates', () => {
    const { visits } = buildReviewVisits({ visits: [{ date: '10/02/2026', values: { bun: { value: 32, unit: 'mg/dL' }, alt: 'high', nope: 1 } }] }, none);
    expect(visits[0].form.date).toBe('');
    expect(visits[0].valueKeys).toEqual(['bun']);
    expect(visits[0].form.bun).toBe('32');
  });
});

describe('changing a visit date (FR30, FR36)', () => {
  const onFile = { bloodworkDates: new Set(['2026-03-14']), weightDates: new Set(['2026-06-14']) };
  const undated = () => buildReviewVisits({ visits: [{ values: { bun: 32 }, weight_lbs: 10.1 }] }, onFile).visits[0];

  it("disables an undated visit's weight line when the owner types a date that already has a weight", () => {
    const v = changeVisitDate(undated(), '2026-06-14', onFile);
    expect(v).toMatchObject({ form: expect.objectContaining({ date: '2026-06-14' }), includeWeight: false, weightOnFile: true, onFile: false, included: true });
    expect(weightLineEnabled(v)).toBe(false);
    expect(weightToSave(toggleVisitWeight(v), new Set(['2026-06-14']))).toBe(false);
  });

  it('ticks and enables the weight when the new date has no weight', () => {
    const v = changeVisitDate(undated(), '2026-05-01', onFile);
    expect(v).toMatchObject({ includeWeight: true, weightOnFile: false });
    expect(weightLineEnabled(v)).toBe(true);
  });

  it('unticks and disables the weight when a ticked line moves to a date with a weight, and re-enables it when moved off', () => {
    const { visits } = buildReviewVisits({ visits: [{ date: '2026-05-01', values: {}, weight_lbs: 10.1 }] }, onFile);
    expect(visits[0].includeWeight).toBe(true);
    const moved = changeVisitDate(visits[0], '2026-06-14', onFile);
    expect(moved).toMatchObject({ includeWeight: false, weightOnFile: true });
    expect(changeVisitDate(moved, '2026-05-02', onFile)).toMatchObject({ includeWeight: true, weightOnFile: false });
  });

  it("does not carry the owner's own weight tick to a different date", () => {
    const { visits } = buildReviewVisits({ visits: [{ date: '2026-05-01', values: {}, weight_lbs: 10.1 }] }, onFile);
    const unticked = toggleVisitWeight(visits[0]);
    expect(unticked.includeWeight).toBe(false);
    expect(changeVisitDate(unticked, '2026-05-02', onFile).includeWeight).toBe(true);
  });

  it('marks and unticks a visit moved onto a date that already has bloodwork', () => {
    const v = changeVisitDate(undated(), '2026-03-14', onFile);
    expect(v).toMatchObject({ onFile: true, included: false });
    expect(weightLineEnabled(v)).toBe(false);
    expect(changeVisitDate(v, '2026-03-15', onFile).onFile).toBe(false);
  });

  it('changes nothing when the date is unchanged', () => {
    const { visits } = buildReviewVisits({ visits: [{ date: '2026-06-14', values: {}, weight_lbs: 10.1 }] }, onFile);
    const ticked = toggleVisitWeight(visits[0]);
    expect(changeVisitDate(ticked, '2026-06-14', onFile)).toBe(ticked);
  });
});

describe('which weights a save logs (FR36: one weight per day, an import never replaces one)', () => {
  const visitOn = (date, weightDates) => buildReviewVisits({ visits: [{ date, values: {}, weight_lbs: 10.1 }] }, { bloodworkDates: new Set(), weightDates }).visits[0];

  it('logs a ticked weight for a date with no weight', () => {
    expect(weightToSave(visitOn('2026-05-01', new Set()), new Set())).toBe(true);
  });

  it('skips a ticked weight if a weight appeared on that date since the review opened, and counts it as skipped', () => {
    const v = visitOn('2026-05-01', new Set());
    expect(weightToSave(v, new Set(['2026-05-01']))).toBe(false);
    expect(weightTicked(v)).toBe(true);
  });

  it('skips every weight if the fresh weights could not be loaded, and counts it as skipped', () => {
    const v = visitOn('2026-05-01', new Set());
    expect(weightToSave(v, null)).toBe(false);
    expect(weightTicked(v)).toBe(true);
  });

  it('never logs a weight over one on file, even if the owner ticks the line, and never counts it as skipped', () => {
    const shown = visitOn('2026-06-14', new Set(['2026-06-14']));
    expect(weightToSave(shown, new Set(['2026-06-14']))).toBe(false);
    expect(weightToSave(toggleVisitWeight(shown), new Set(['2026-06-14']))).toBe(false);
    // Even forced on, a weight on file is never saved or reported as skipped.
    expect(weightToSave({ ...shown, includeWeight: true }, new Set())).toBe(false);
    expect(weightTicked({ ...shown, includeWeight: true })).toBe(false);
  });

  it("starts unticked when the review couldn't load weights, but can be ticked and is saved if the fresh load shows the day free", () => {
    const v = visitOn('2026-05-01', null);
    expect(v).toMatchObject({ includeWeight: false, weightOnFile: false });
    expect(weightLineEnabled(v)).toBe(true);
    expect(weightToSave(toggleVisitWeight(v), new Set())).toBe(true);
    expect(weightToSave(toggleVisitWeight(v), new Set(['2026-05-01']))).toBe(false);
  });

  it('has the approved skipped-weight message', () => {
    expect(WEIGHT_SKIPPED_MESSAGE).toBe("The bloodwork was saved, but the weight wasn't added because this day already has one.");
  });

  it('never logs the weight of an unticked visit or a visit without a weight', () => {
    const v = visitOn('2026-05-01', new Set());
    expect(weightToSave({ ...v, included: false }, new Set())).toBe(false);
    expect(weightToSave({ ...v, weightLbs: null }, new Set())).toBe(false);
  });
});

describe('after a save that stopped partway (FR30, FR36)', () => {
  const answer = {
    visits: [
      { date: '2026-10-02', values: { bun: 32 }, weight_lbs: 9.8 },
      { date: '2026-06-14', values: { bun: 28 }, weight_lbs: 10.1 },
      { date: '2026-03-14', values: { bun: 25 }, weight_lbs: 10.4 },
    ],
  };

  it('marks a visit whose record saved "Already on file" and unticks it, and disables weights for days that now have one', () => {
    const { visits } = buildReviewVisits(answer, none);
    // 2026-06-14's record saved but its weight failed; 2026-03-14 gained a
    // weight elsewhere meanwhile.
    const left = [{ ...visits[1], savedId: 'bw-1' }, visits[2]];
    const [saved, other] = refreshVisitsOnFile(left, { bloodworkDates: new Set(['2026-10-02', '2026-06-14']), weightDates: new Set(['2026-10-02', '2026-03-14']) });
    expect(saved).toMatchObject({ onFile: true, included: false, savedId: 'bw-1', weightOnFile: false, includeWeight: true });
    expect(other).toMatchObject({ onFile: false, included: true, weightOnFile: true, includeWeight: false });
    expect(weightLineEnabled(other)).toBe(false);
  });

  it('leaves a visit unchanged when nothing new is on file for its date', () => {
    const { visits } = buildReviewVisits(answer, none);
    const [v] = refreshVisitsOnFile([visits[2]], { bloodworkDates: new Set(['2026-10-02']), weightDates: null });
    expect(v).toMatchObject({ onFile: false, included: true, weightOnFile: false, includeWeight: true });
  });
});

describe('checkbox names', () => {
  it('names each Include and weight tick with the heading date', () => {
    const { visits } = buildReviewVisits({ visits: [{ date: '2026-03-14', values: {}, weight_lbs: 9.8 }, { date: '2026-06-14', values: {} }] }, { bloodworkDates: new Set(), weightDates: new Set(['2026-03-14']) });
    const names = reviewCheckboxNames(visits);
    expect(names.get(visits[0].key)).toEqual({ include: 'Include Mar 14, 2026', weight: 'Weight 9.8 lbs: a weight is already logged for this day. (Mar 14, 2026)' });
    expect(names.get(visits[1].key)).toEqual({ include: 'Include Jun 14, 2026', weight: null });
  });

  it('adds "(version N)" for cards sharing a date, so every name is unique', () => {
    const { visits } = buildReviewVisits({
      visits: [
        { date: '2026-10-02', values: { creatinine: 2.1 }, weight_lbs: 9.8, conflict: true },
        { date: '2026-10-02', values: { creatinine: 2.4 }, weight_lbs: 9.8, conflict: true },
        { date: '2026-06-14', values: {} },
      ],
    }, none);
    const names = reviewCheckboxNames(visits);
    expect(visits.map((v) => names.get(v.key).include)).toEqual(['Include Oct 2, 2026 (version 1)', 'Include Oct 2, 2026 (version 2)', 'Include Jun 14, 2026']);
    expect(names.get(visits[0].key).weight).toBe('Weight 9.8 lbs: also add to weight history (Oct 2, 2026, version 1)');
    expect(names.get(visits[1].key).weight).toBe('Weight 9.8 lbs: also add to weight history (Oct 2, 2026, version 2)');
    const all = [...names.values()].flatMap((n) => [n.include, n.weight]).filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps undated cards apart too', () => {
    const { visits } = buildReviewVisits({ visits: [{ values: { bun: 1 } }, { values: { bun: 2 } }] }, none);
    const names = reviewCheckboxNames(visits);
    expect(visits.map((v) => names.get(v.key).include)).toEqual(['Include (version 1)', 'Include (version 2)']);
  });
});

describe('saving the review', () => {
  const tz = 'America/New_York';

  it('needs at least one ticked visit, each with a date', () => {
    const { visits } = buildReviewVisits(IDEXX_LIKE, none);
    expect(canSaveReview(visits, tz)).toBe(true);
    expect(canSaveReview(visits.map((v) => ({ ...v, included: false })), tz)).toBe(false);
    expect(canSaveReview([{ ...visits[0], form: { ...visits[0].form, date: '' } }], tz)).toBe(false);
  });

  it("refuses a future date on a ticked visit, on the owner's calendar", () => {
    const { visits } = buildReviewVisits(IDEXX_LIKE, none);
    const today = dateStrInTimezone(tz, 0);
    const tomorrow = dateStrInTimezone(tz, 1);
    expect(isFutureDate(today, tz)).toBe(false);
    expect(isFutureDate(tomorrow, tz)).toBe(true);
    expect(canSaveReview([{ ...visits[0], form: { ...visits[0].form, date: today } }], tz)).toBe(true);
    expect(canSaveReview([{ ...visits[0], form: { ...visits[0].form, date: tomorrow } }], tz)).toBe(false);
    // An unticked future-dated visit doesn't block the others.
    expect(canSaveReview([visits[0], { ...visits[1], included: false, form: { ...visits[1].form, date: tomorrow } }], tz)).toBe(true);
  });

  it("uses the owner's time zone, not the device's, for today", () => {
    vi.useFakeTimers();
    try {
      // 02:00 UTC on Nov 26 is still Nov 25 in New York.
      vi.setSystemTime(new Date('2026-11-26T02:00:00Z'));
      expect(isFutureDate('2026-11-26', 'America/New_York')).toBe(true);
      expect(isFutureDate('2026-11-26', 'UTC')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns an edited card into a bloodwork row with numbers and no empty fields', () => {
    const { visits } = buildReviewVisits(IDEXX_LIKE, none);
    const edited = { ...visits[0], form: { ...visits[0].form, bun: '33.5', sdma: '', notes: ' rechecked ' } };
    expect(reviewVisitToRecord(edited, 'pet-1')).toEqual({
      pet_id: 'pet-1', date: '2026-10-02', lab_name: 'IDEXX', vet_name: 'Dr. Test', notes: 'rechecked', bun: 33.5,
    });
  });
});

describe('import error text and reporting', () => {
  it('uses wording G for spreadsheet problems, including the server too-large refusal', () => {
    expect(bloodworkImportErrorText(new SpreadsheetReadError('old_excel'))).toBe(SPREADSHEET_MESSAGES.old_excel);
    expect(bloodworkImportErrorText(new SpreadsheetReadError('too_large'))).toBe(SPREADSHEET_MESSAGES.too_large);
    expect(bloodworkImportErrorText(new SpreadsheetReadError('nothing_found'))).toBe(SPREADSHEET_MESSAGES.nothing_found);
    expect(bloodworkImportErrorText(Object.assign(new Error('x'), { status: 400, code: 'sheet_too_large' }))).toBe(SPREADSHEET_MESSAGES.too_large);
  });

  it('keeps the rate-limit message, upload messages and the generic fallback', () => {
    expect(bloodworkImportErrorText(Object.assign(new Error('Slow down.'), { status: 429 }))).toBe('Slow down.');
    expect(bloodworkImportErrorText(new UploadRejectedError(UPLOAD_MESSAGES.failed))).toBe(UPLOAD_MESSAGES.failed);
    expect(bloodworkImportErrorText(Object.assign(new Error('Could not load the spreadsheet reader'), { reported: true })))
      .toBe('Something went wrong. Please try again.');
  });

  it('reports unexpected failures only', () => {
    expect(shouldReportImportError(new Error('AI request failed'))).toBe(true);
    expect(shouldReportImportError(new UploadRejectedError(UPLOAD_MESSAGES.failed))).toBe(true);
    expect(shouldReportImportError(new SpreadsheetReadError('nothing_found'))).toBe(false);
    expect(shouldReportImportError(new UploadRejectedError(UPLOAD_MESSAGES.oldExcel))).toBe(false);
    expect(shouldReportImportError(Object.assign(new Error('x'), { status: 429 }))).toBe(false);
    expect(shouldReportImportError(Object.assign(new Error('x'), { reported: true }))).toBe(false);
  });
});
