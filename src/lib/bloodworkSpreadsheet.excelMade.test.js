import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deflateRawSync } from 'node:zlib';

// Spec 0081 QA (reviewer "Unverified": real Excel-made files). The other
// .xlsx tests use e2e/fixtures/xlsxBuilder.js, which writes every entry
// uncompressed with inline cell values. A workbook saved by Excel itself
// differs in the ways that matter to a reader:
//   - every zip entry is deflate-compressed (method 8);
//   - text cells are indexes into xl/sharedStrings.xml (t="s"), including
//     rich-text strings split into runs and strings with xml:space="preserve";
//   - dates are serial numbers whose style (numFmtId 14) marks them as dates;
//   - formulas carry their last calculated value (<f> plus <v>);
//   - Excel's own extras: mc:Ignorable namespaces, x14ac:dyDescent row
//     attributes, <dimension>, <sheetViews>, <cols>, merged cells, styled
//     empty cells, booleans and error cells.
// This file builds such a workbook by hand (made-up values only, in Lynn's
// template layout: tests down the rows, visits across the columns) and
// checks the app's reader turns it into the same text as the plain one.

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/errorMonitoring', () => ({ reportClientError: vi.fn() }));

const { readBloodworkSpreadsheet } = await import('./bloodworkSpreadsheet');
const { reportClientError } = await import('@/lib/errorMonitoring');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// A zip whose entries are deflate-compressed, as Excel writes them.
function deflateZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(text);
    const data = new Uint8Array(deflateRawSync(raw));
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 8, true); // deflate
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(10, 8, true); // deflate
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// Excel's date serial (days since 1899-12-30) for a YYYY-MM-DD date.
const serial = (iso) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;

// Shared strings, in the order Excel would list them. Index 1 is a rich-text
// string split into two runs; index 8 keeps leading/trailing spaces.
const SHARED = [
  '<si><t>Test</t></si>', // 0
  '<si><r><rPr><b/><sz val="11"/></rPr><t>Ran</t></r><r><rPr><sz val="11"/></rPr><t>ge</t></r></si>', // 1 "Range"
  '<si><t>Measure</t></si>', // 2
  '<si><t>DATE</t></si>', // 3
  '<si><t>WEIGHT</t></si>', // 4
  '<si><t>lbs</t></si>', // 5
  '<si><t>BUN</t></si>', // 6
  '<si><t>16-36</t></si>', // 7
  '<si><t xml:space="preserve"> mg/dL </t></si>', // 8
  '<si><t>CREATININE</t></si>', // 9
  '<si><t>0.8-2.4</t></si>', // 10
  '<si><t>Visit 1</t></si>', // 11
  '<si><t>Visit 2</t></si>', // 12
  '<si><t>Visit 3</t></si>', // 13
  '<si><t>Fasted</t></si>', // 14
  '<si><t>Notes</t></si>', // 15
  '<si><t>Quiet visit, ate after</t></si>', // 16
];

const s = (ref, idx, style) => `<c r="${ref}"${style ? ` s="${style}"` : ''} t="s"><v>${idx}</v></c>`;
const n = (ref, value, style) => `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`;
const row = (r, cells) => `<row r="${r}" spans="1:6" x14ac:dyDescent="0.25">${cells.join('')}</row>`;

function sheetXml(rows, { merge = '' } = {}) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x14ac xr xr2 xr3" '
    + 'xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac" '
    + 'xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" '
    + 'xmlns:xr2="http://schemas.microsoft.com/office/spreadsheetml/2015/revision2" '
    + 'xmlns:xr3="http://schemas.microsoft.com/office/spreadsheetml/2016/revision3" xr:uid="{00000000-0001-0000-0000-000000000000}">'
    + '<dimension ref="A1:F8"/>'
    + '<sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="B2" sqref="B2"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15" x14ac:dyDescent="0.25"/>'
    + '<cols><col min="1" max="1" width="14.7109375" customWidth="1"/></cols>'
    + `<sheetData>${rows.join('')}</sheetData>`
    + merge
    + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
    + '</worksheet>';
}

function templateRows({ creatinineVisit1 = '2.1' } = {}) {
  return [
    row(1, [s('A1', 0, 1), s('B1', 1, 1), s('C1', 2, 1), s('D1', 11, 1), s('E1', 12, 1), s('F1', 13, 1)]),
    // Dates as serial numbers with the date style (s="2", numFmtId 14).
    row(2, [s('A2', 3), n('D2', serial('2026-10-02'), 2), n('E2', serial('2026-06-14'), 2), n('F2', serial('2026-03-14'), 2)]),
    row(3, [s('A3', 4), s('C3', 5), n('D3', '9.8'), n('E3', '10.1'), n('F3', '10.4')]),
    // BUN for visit 3 is a formula with its cached value; a styled empty
    // cell sits in B where no range was typed for one row below.
    row(4, [s('A4', 6), s('B4', 7), s('C4', 8), n('D4', '32'), n('E4', '28'), '<c r="F4"><f>E4-3</f><v>25</v></c>']),
    row(5, [s('A5', 9), s('B5', 10), s('C5', 8), n('D5', creatinineVisit1), n('E5', '1.9000000000000001'), n('F5', '1.7')]),
    // A boolean, an error cell and a styled empty cell.
    row(6, [s('A6', 14), '<c r="B6" s="3"/>', '<c r="D6" t="b"><v>1</v></c>', '<c r="E6" t="e"><v>#N/A</v></c>', '<c r="F6" t="b"><v>0</v></c>']),
    // A note merged across the three visit columns (only D7 holds the text).
    row(7, [s('A7', 15), s('D7', 16), '<c r="E7" s="3"/>', '<c r="F7" s="3"/>']),
  ];
}

function excelMadeWorkbook(secondSheetRows = templateRows()) {
  const merge = '<mergeCells count="1"><mergeCell ref="D7:F7"/></mergeCells>';
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>',
    'docProps/core.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>QA</dc:creator></cp:coreProperties>',
    'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="27425"/>'
      + '<workbookPr defaultThemeVersion="166925"/>'
      + '<bookViews><workbookView xWindow="-120" yWindow="-120" windowWidth="29040" windowHeight="15840" activeTab="0"/></bookViews>'
      + '<sheets><sheet name="Inc Research" sheetId="1" r:id="rId1"/><sheet name="No Research" sheetId="2" r:id="rId2"/></sheets>'
      + '<calcPr calcId="191029"/>'
      + '</workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
      + '</Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="4">'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
      + '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      + '<xf numFmtId="0" fontId="0" fillId="1" borderId="0" xfId="0" applyFill="1"/>'
      + '</cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>',
    'xl/sharedStrings.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${SHARED.length + 6}" uniqueCount="${SHARED.length}">`
      + SHARED.join('')
      + '</sst>',
    'xl/worksheets/sheet1.xml': sheetXml(templateRows(), { merge }),
    'xl/worksheets/sheet2.xml': sheetXml(secondSheetRows, { merge }),
  };
  return deflateZip(files);
}

const asFile = (bytes, name, type = XLSX_TYPE) => new File([bytes], name, { type });

beforeEach(() => {
  vi.mocked(reportClientError).mockClear();
});

describe('readBloodworkSpreadsheet: a workbook saved the way Excel saves it', () => {
  const expectedBlock = (n, name) => [
    `Sheet ${n} of 2: ${name}`,
    'Test,Range,Measure,Visit 1,Visit 2,Visit 3',
    'DATE,,,2026-10-02,2026-06-14,2026-03-14',
    'WEIGHT,,lbs,9.8,10.1,10.4',
    'BUN,16-36,mg/dL,32,28,25',
    'CREATININE,0.8-2.4,mg/dL,2.1,1.9,1.7',
    // An error cell (#N/A) reads as empty, so it never reaches the AI as a value.
    'Fasted,,,TRUE,,FALSE',
    'Notes,,,"Quiet visit, ate after"',
  ];

  it('reads compressed entries, shared and rich-text strings, date serials, cached formula values and both sheets', async () => {
    const { text, sheetNames } = await readBloodworkSpreadsheet(asFile(excelMadeWorkbook(), 'Idexx Template US.xlsx'));
    expect(sheetNames).toEqual(['Inc Research', 'No Research']);
    expect(text.split('\n\n')).toEqual([
      expectedBlock(1, 'Inc Research').join('\n'),
      expectedBlock(2, 'No Research').join('\n'),
    ]);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('keeps a different value on the second sheet in its own column (AC23 input)', async () => {
    const { text } = await readBloodworkSpreadsheet(asFile(excelMadeWorkbook(templateRows({ creatinineVisit1: '2.4' })), 'labs.xlsx'));
    const [first, second] = text.split('\n\n');
    expect(first).toContain('CREATININE,0.8-2.4,mg/dL,2.1,1.9,1.7');
    expect(second).toContain('CREATININE,0.8-2.4,mg/dL,2.4,1.9,1.7');
  });

  it('reads it the same with no file type (Windows/Android pickers) and under an upper-case name', async () => {
    const { text } = await readBloodworkSpreadsheet(asFile(excelMadeWorkbook(), 'LABS.XLSX', ''));
    expect(text.startsWith('Sheet 1 of 2: Inc Research\nTest,Range,Measure,Visit 1,Visit 2,Visit 3')).toBe(true);
  });

  it('refuses a truncated (half-downloaded) Excel file as unreadable, not a crash', async () => {
    const whole = excelMadeWorkbook();
    const err = await readBloodworkSpreadsheet(asFile(whole.slice(0, Math.floor(whole.length / 2)), 'labs.xlsx')).catch((e) => e);
    expect(err?.code).toBe('nothing_found');
  });
});
