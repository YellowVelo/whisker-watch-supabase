import { describe, it, expect, vi } from 'vitest';

// Spec 0081 T18: the shared bloodwork import review's logic (FR30, FR31,
// FR35, FR36; AC16, AC17, AC21-AC23). Every value here is made up.

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/errorMonitoring', () => ({ reportClientError: vi.fn() }));

const {
  buildReviewVisits, skippedText, includedVisits, canSaveReview, reviewVisitToRecord,
  bloodworkImportErrorText, shouldReportImportError,
} = await import('./bloodworkImport');
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

  it('starts every weight line unticked when the weights could not be loaded', () => {
    const { visits } = buildReviewVisits({ visits: [{ date: '2026-10-02', values: {}, weight_lbs: 9.8 }] }, { bloodworkDates: new Set(), weightDates: null });
    expect(visits[0].includeWeight).toBe(false);
  });

  it('lists a weight with no unit as not imported', () => {
    const answer = { visits: [{ date: '2026-10-02', values: { bun: 32 } }], skipped: [{ visit: 0, field: 'weight', label: 'Weight', unit: null, value: 9.8 }] };
    expect(skippedText(buildReviewVisits(answer, none).visits[0].skipped)).toBe('Weight');
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

describe('saving the review', () => {
  it('needs at least one ticked visit, each with a date', () => {
    const { visits } = buildReviewVisits(IDEXX_LIKE, none);
    expect(canSaveReview(visits)).toBe(true);
    expect(canSaveReview(visits.map((v) => ({ ...v, included: false })))).toBe(false);
    expect(canSaveReview([{ ...visits[0], form: { ...visits[0].form, date: '' } }])).toBe(false);
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
