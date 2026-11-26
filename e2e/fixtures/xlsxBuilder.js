// Builds small made-up .xlsx files for tests (spec 0081). No spreadsheet
// library is needed: an .xlsx is a zip of a few XML files, written here
// uncompressed. Used by src/lib/bloodworkSpreadsheet.test.js and to
// generate the committed fixture `bloodwork-template-sample.xlsx`
// (`node e2e/fixtures/xlsxBuilder.js` rewrites it).
//
// Never put real lab results in a fixture.

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

// A zip with every entry stored (no compression).
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
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
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnName = (i) => {
  let name = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

// Excel's day number for a calendar date (1900 system).
const excelDay = (date) => (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  - Date.UTC(1899, 11, 30)) / 86400000;

function cellXml(value, ref) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return `<c r="${ref}" s="1"><v>${excelDay(value)}</v></c>`;
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(rows) {
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => cellXml(v, `${columnName(c)}${r + 1}`)).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${body}</sheetData></worksheet>`;
}

/**
 * @param {{ name: string, rows: (string|number|Date|null)[][] }[]} sheets
 *   Date values become real Excel date cells (format m/d/yyyy).
 * @returns {Uint8Array} the .xlsx file's bytes
 */
export function buildXlsx(sheets) {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/>`
      + '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>`
      + sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/>`
      + '</Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>'
      + '</styleSheet>',
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows);
  });
  return zip(files);
}

// A made-up workbook in the layout of Lynn's template (spec 0081 FR37,
// AC22): two near-identical sheets, tests down the rows, three visits
// across the columns (newest on the left), date and weight rows before
// the tests, and "Range"/"Measure" label columns. All values invented.
export function templateSampleSheets() {
  const visits = [new Date(Date.UTC(2026, 9, 2)), new Date(Date.UTC(2026, 5, 14)), new Date(Date.UTC(2026, 2, 14))];
  const rows = [
    ['Test', 'Range', 'Measure', 'Visit 1', 'Visit 2', 'Visit 3'],
    ['DATE', null, null, ...visits],
    ['WEIGHT', null, 'lbs', 9.8, 10.1, 10.4],
    ['BUN', '16-36', 'mg/dL', 32, 28, 25],
    ['CREATININE', '0.8-2.4', 'mg/dL', 2.1, 1.9, 1.7],
    ['SDMA', '0-14', 'ug/dL', 15, 13, 12],
    ['PHOSPHORUS', '3.1-7.5', 'mg/dL', 5.2, 4.8, 4.5],
    ['CHLORIDE', '112-129', 'mmol/L', 118, 117, 119],
    ['Sub-Q fluids', null, 'ml', 100, 100, null],
  ];
  return [
    { name: 'Inc Research', rows: [...rows, ['Research panel A', null, 'units', 7, 6, 5]] },
    { name: 'No Research', rows },
  ];
}

// `node e2e/fixtures/xlsxBuilder.js` regenerates the committed fixture.
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { writeFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const out = fileURLToPath(new URL('./bloodwork-template-sample.xlsx', import.meta.url));
  writeFileSync(out, buildXlsx(templateSampleSheets()));
  console.log(`wrote ${out}`);
}
