import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Spec 0081 T16: the in-browser bloodwork spreadsheet reader (FR28, FR32,
// FR33, FR37; AC15, AC19, AC22). Every value here is made up.

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/errorMonitoring', () => ({ reportClientError: vi.fn() }));

const {
  readBloodworkSpreadsheet, parseCsv, sheetsToText, spreadsheetErrorText,
  SPREADSHEET_MESSAGES, MAX_SHEET_TEXT_CHARS, SpreadsheetReadError,
} = await import('./bloodworkSpreadsheet');
const { reportClientError } = await import('@/lib/errorMonitoring');
const { UPLOAD_MESSAGES } = await import('@/api/storageClient');
const { buildXlsx, templateSampleSheets } = await import('../../e2e/fixtures/xlsxBuilder.js');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const asFile = (content, name, type = '') => new File([content], name, { type });

async function readError(file) {
  try {
    await readBloodworkSpreadsheet(file);
  } catch (err) {
    return err;
  }
  throw new Error('expected readBloodworkSpreadsheet to refuse the file');
}

beforeEach(() => {
  vi.mocked(reportClientError).mockClear();
});

describe('wording G (spec 0081)', () => {
  it('has the approved strings, one per error code', () => {
    expect(SPREADSHEET_MESSAGES).toEqual({
      old_excel: 'This is an older Excel file. Save it as .xlsx or .csv and try again.',
      too_large: 'This spreadsheet is too large to import. Try a sheet with just the bloodwork results.',
      nothing_found: "We couldn't find any bloodwork results in this spreadsheet.",
    });
    expect(SPREADSHEET_MESSAGES.old_excel).toBe(UPLOAD_MESSAGES.oldExcel);
  });

  it('spreadsheetErrorText maps coded errors and ignores others', () => {
    expect(spreadsheetErrorText(new SpreadsheetReadError('too_large'))).toBe(SPREADSHEET_MESSAGES.too_large);
    expect(spreadsheetErrorText(new Error('boom'))).toBeNull();
  });
});

describe('parseCsv', () => {
  it('handles quoted fields with embedded commas, quotes and line breaks', () => {
    const csv = 'Date,Lab,Notes,BUN\r\n2026-10-02,"IDEXX, Inc.","Fasted ""12h""\nre-check soon",32\r\n';
    expect(parseCsv(csv)).toEqual([
      ['Date', 'Lab', 'Notes', 'BUN'],
      ['2026-10-02', 'IDEXX, Inc.', 'Fasted "12h"\nre-check soon', '32'],
    ]);
  });

  it('keeps empty cells in place and reads a last line with no line break', () => {
    expect(parseCsv('a,,c\n1,2,')).toEqual([['a', '', 'c'], ['1', '2', '']]);
  });

  it('reads semicolon- and tab-separated files', () => {
    expect(parseCsv('BUN;Creatinine\n32;2,1')).toEqual([['BUN', 'Creatinine'], ['32', '2,1']]);
    expect(parseCsv('BUN\tCreatinine\n32\t2.1')).toEqual([['BUN', 'Creatinine'], ['32', '2.1']]);
  });

  it('keeps a quote in the middle of an unquoted field as a literal character', () => {
    const csv = 'Date,BUN,Notes\n2026-10-02,32,2" mass on flank\n2026-06-14,28,ok\n2026-03-14,25,ok\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows).toEqual([
      ['Date', 'BUN', 'Notes'],
      ['2026-10-02', '32', '2" mass on flank'],
      ['2026-06-14', '28', 'ok'],
      ['2026-03-14', '25', 'ok'],
    ]);
  });

  it('keeps a mid-field quote in a semicolon-separated file, and still detects the semicolons', () => {
    const csv = 'Notes;BUN;Creatinine\n2" mass;32;2,1\nok;28;1,9\n';
    expect(parseCsv(csv)).toEqual([
      ['Notes', 'BUN', 'Creatinine'],
      ['2" mass', '32', '2,1'],
      ['ok', '28', '1,9'],
    ]);
  });

  it('a mid-field quote on the first line does not hide the separator', () => {
    expect(parseCsv('Size 2" a;BUN;Crea\n1;2;3')).toEqual([['Size 2" a', 'BUN', 'Crea'], ['1', '2', '3']]);
  });

  it('still reads well-formed quoted fields, including quoted fields in a semicolon file', () => {
    expect(parseCsv('a,"b ""x"", c",d\n"1",2,"3"\n')).toEqual([['a', 'b "x", c', 'd'], ['1', '2', '3']]);
    expect(parseCsv('"a;b";c\n"1";"2;3"')).toEqual([['a;b', 'c'], ['1', '2;3']]);
    expect(parseCsv('"",x\n')).toEqual([['', 'x']]);
  });
});

describe('readBloodworkSpreadsheet: a mid-field quote', () => {
  it("doesn't swallow the rows after it", async () => {
    const csv = 'Date,BUN,Notes\n2026-10-02,32,2" mass on flank\n2026-06-14,28,ok\n2026-03-14,25,ok\n';
    const { text } = await readBloodworkSpreadsheet(asFile(csv, 'labs.csv', 'text/csv'));
    expect(text).toContain('2026-03-14,25,ok');
    expect(text).toContain('"2"" mass on flank"');
  });
});

describe('readBloodworkSpreadsheet: CSV', () => {
  const ROWS_CSV = [
    'Date,Lab,Vet,BUN,Creatinine,Notes',
    '2026-10-02,IDEXX,Dr. Test,32,2.1,"Fasted, calm"',
    '2026-06-14,IDEXX,Dr. Test,28,1.9,',
    '2026-03-14,IDEXX,Dr. Test,25,1.7,"Line one',
    'line two"',
  ].join('\r\n');

  it('turns a one-row-per-visit CSV into text with every visit and value (AC14 input)', async () => {
    const { text } = await readBloodworkSpreadsheet(asFile(ROWS_CSV, 'labs.csv', 'text/csv'));
    expect(text).toBe([
      'Sheet 1 of 1: Sheet 1',
      'Date,Lab,Vet,BUN,Creatinine,Notes',
      '2026-10-02,IDEXX,Dr. Test,32,2.1,"Fasted, calm"',
      '2026-06-14,IDEXX,Dr. Test,28,1.9',
      '2026-03-14,IDEXX,Dr. Test,25,1.7,Line one line two',
    ].join('\n'));
  });

  it('reads a CSV that Windows labels as an Excel file, or that has no type', async () => {
    const a = await readBloodworkSpreadsheet(asFile(ROWS_CSV, 'labs.csv', 'application/vnd.ms-excel'));
    const b = await readBloodworkSpreadsheet(asFile(ROWS_CSV, 'labs.csv', ''));
    expect(a.text).toContain('2026-10-02,IDEXX,Dr. Test,32,2.1');
    expect(b.text).toBe(a.text);
  });

  it('keeps µmol/L intact in a Windows-1252 CSV (AC17 input)', async () => {
    // "Creatinine,194,µmol/L" with µ as the single byte 0xB5.
    const bytes = new Uint8Array([...new TextEncoder().encode('Creatinine,194,'), 0xb5, ...new TextEncoder().encode('mol/L')]);
    const { text } = await readBloodworkSpreadsheet(asFile(bytes, 'labs.csv'));
    expect(text).toContain('Creatinine,194,µmol/L');
  });

  it('refuses an empty file, and one with no readable content', async () => {
    expect((await readError(asFile('', 'labs.csv', 'text/csv'))).code).toBe('nothing_found');
    expect((await readError(asFile(',,,\r\n\r\n , ,\n', 'labs.csv'))).code).toBe('nothing_found');
    expect((await readError(asFile('Name,Notes\nBiscuit,sleepy', 'labs.csv'))).code).toBe('nothing_found');
  });
});

describe('readBloodworkSpreadsheet: refusals before any AI call (AC19)', () => {
  it('refuses an .xls by name', async () => {
    const err = await readError(asFile('anything', 'labs.xls', 'application/vnd.ms-excel'));
    expect(err).toBeInstanceOf(SpreadsheetReadError);
    expect(err.code).toBe('old_excel');
    expect(spreadsheetErrorText(err)).toBe(SPREADSHEET_MESSAGES.old_excel);
  });

  it('refuses an old Excel file renamed .csv or .xlsx, by its content', async () => {
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect((await readError(asFile(ole2, 'labs.csv', 'application/vnd.ms-excel'))).code).toBe('old_excel');
    expect((await readError(asFile(ole2, 'labs.xlsx', XLSX_TYPE))).code).toBe('old_excel');
  });

  it(`refuses text over ${MAX_SHEET_TEXT_CHARS} characters, and accepts it at the limit`, () => {
    const name = 'S';
    const header = `Sheet 1 of 1: ${name}\n`;
    const atLimit = 'x1'.padEnd(MAX_SHEET_TEXT_CHARS - header.length, 'y');
    expect(sheetsToText([{ name, rows: [[atLimit]] }])).toHaveLength(MAX_SHEET_TEXT_CHARS);
    expect(() => sheetsToText([{ name, rows: [[`${atLimit}z`]] }])).toThrow(SPREADSHEET_MESSAGES.too_large);
  });

  it('refuses a large CSV file as too large', async () => {
    const line = '2026-10-02,IDEXX,Dr. Test,32,2.1\n';
    const big = `Date,Lab,Vet,BUN,Creatinine\n${line.repeat(Math.ceil(MAX_SHEET_TEXT_CHARS / line.length) + 1)}`;
    expect((await readError(asFile(big, 'labs.csv', 'text/csv'))).code).toBe('too_large');
  });

  it('refuses a broken .xlsx as unreadable and reports it to Sentry', async () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);
    expect((await readError(asFile(broken, 'labs.xlsx', XLSX_TYPE))).code).toBe('nothing_found');
    expect(reportClientError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ feature: 'bloodwork_spreadsheet' }));
  });
});

describe('readBloodworkSpreadsheet: .xlsx', () => {
  it('reads every sheet, skipping empty ones', async () => {
    const bytes = buildXlsx([
      { name: 'Chemistry', rows: [['Date', 'BUN'], ['2026-10-02', 32]] },
      { name: 'Blank', rows: [] },
      { name: 'Urine', rows: [['Date', 'USG'], ['2026-10-02', 1.035]] },
    ]);
    const { text, sheetNames } = await readBloodworkSpreadsheet(asFile(bytes, 'labs.xlsx', XLSX_TYPE));
    expect(sheetNames).toEqual(['Chemistry', 'Blank', 'Urine']);
    expect(text).toBe([
      'Sheet 1 of 2: Chemistry', 'Date,BUN', '2026-10-02,32',
      '',
      'Sheet 2 of 2: Urine', 'Date,USG', '2026-10-02,1.035',
    ].join('\n'));
  });

  it('refuses a workbook whose sheets are all empty', async () => {
    const bytes = buildXlsx([{ name: 'One', rows: [] }, { name: 'Two', rows: [[null, '']] }]);
    expect((await readError(asFile(bytes, 'labs.xlsx', XLSX_TYPE))).code).toBe('nothing_found');
  });

  it('reads an .xlsx with no type, and real date cells as ISO dates', async () => {
    const bytes = buildXlsx([{ name: 'S', rows: [['Date', new Date(Date.UTC(2026, 9, 2))], ['BUN', 0.1 + 0.2]] }]);
    const { text } = await readBloodworkSpreadsheet(asFile(bytes, 'labs.xlsx', ''));
    expect(text).toBe('Sheet 1 of 1: S\nDate,2026-10-02\nBUN,0.3');
  });

  it("reads the committed made-up copy of Lynn's template (AC15/AC22 input)", async () => {
    const url = new URL('../../e2e/fixtures/bloodwork-template-sample.xlsx', import.meta.url);
    const committed = new Uint8Array(readFileSync(fileURLToPath(url)));
    // The committed file is exactly what the builder makes.
    expect(committed).toEqual(buildXlsx(templateSampleSheets()));

    const { text, sheetNames } = await readBloodworkSpreadsheet(asFile(committed, 'Template.xlsx', XLSX_TYPE));
    expect(sheetNames).toEqual(['Inc Research', 'No Research']);
    const [first, second] = text.split('\n\n');
    for (const block of [first, second]) {
      const lines = block.split('\n');
      // Visits across the columns; Range and Measure stay as label columns,
      // in place, so no reference-range number lands in a visit column.
      expect(lines[1]).toBe('Test,Range,Measure,Visit 1,Visit 2,Visit 3');
      expect(lines[2]).toBe('DATE,,,2026-10-02,2026-06-14,2026-03-14');
      expect(lines[3]).toBe('WEIGHT,,lbs,9.8,10.1,10.4');
      expect(lines).toContain('BUN,16-36,mg/dL,32,28,25');
      expect(lines).toContain('CREATININE,0.8-2.4,mg/dL,2.1,1.9,1.7');
      expect(lines).toContain('Sub-Q fluids,,ml,100,100');
    }
    expect(first.split('\n')[0]).toBe('Sheet 1 of 2: Inc Research');
    expect(second.split('\n')[0]).toBe('Sheet 2 of 2: No Research');
    expect(first).toContain('Research panel A,,units,7,6,5');
    expect(second).not.toContain('Research panel A');
  });
});

describe('the .xlsx library loads only on import', () => {
  it('is never imported statically', () => {
    const source = readFileSync(fileURLToPath(new URL('./bloodworkSpreadsheet.js', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/^import .*read-excel-file/m);
    expect(source).toMatch(/await import\('read-excel-file\/universal'\)/);
  });
});

describe('readBloodworkSpreadsheet: the .xlsx reader fails to load', () => {
  it('reports it and throws an uncoded error, so the caller shows its usual failure message', async () => {
    vi.resetModules();
    vi.doMock('read-excel-file/universal', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    try {
      const fresh = await import('./bloodworkSpreadsheet');
      const monitoring = await import('@/lib/errorMonitoring');
      const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
      let caught;
      try {
        await fresh.readBloodworkSpreadsheet(asFile(bytes, 'labs.xlsx', XLSX_TYPE));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(fresh.SpreadsheetReadError);
      expect(fresh.spreadsheetErrorText(caught)).toBeNull();
      expect(monitoring.reportClientError).toHaveBeenCalledWith(
        expect.anything(),
        { feature: 'bloodwork_spreadsheet', note: 'Could not load the .xlsx reader' },
      );
    } finally {
      vi.doUnmock('read-excel-file/universal');
      vi.resetModules();
    }
  });
});
