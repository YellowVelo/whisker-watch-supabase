import { UPLOAD_MESSAGES, fileExtension } from '@/api/storageClient';
import { reportClientError } from '@/lib/errorMonitoring';

/**
 * Reads a bloodwork spreadsheet in the browser and turns it into plain
 * text for the AI's "bloodwork spreadsheet" task (spec 0081, FR28). The
 * file itself is never sent to the AI.
 *
 * - CSV: parsed here (quoted fields, embedded commas, quotes and line
 *   breaks; comma, semicolon or tab separated).
 * - .xlsx: read with `read-excel-file`, loaded only when someone imports
 *   a spreadsheet. Every sheet is read.
 * - Old .xls files are refused (wording G), by name or by content.
 *
 * The text keeps each sheet's rows and columns exactly as laid out, so the
 * server's instructions can tell a "Range" or "Measure" column (labels)
 * from the visit columns (results), and can merge near-identical sheets
 * (FR37). Interpreting the layout is the server's job, not this file's.
 */

// FR32: longer text is refused before any AI call. The server enforces
// the same limit.
export const MAX_SHEET_TEXT_CHARS = 60_000;

// Approved copy (spec 0081, wording G), keyed by SpreadsheetReadError code.
export const SPREADSHEET_MESSAGES = {
  old_excel: UPLOAD_MESSAGES.oldExcel,
  too_large: 'This spreadsheet is too large to import. Try a sheet with just the bloodwork results.',
  nothing_found: "We couldn't find any bloodwork results in this spreadsheet.",
};

/** Thrown when a spreadsheet can't be imported. `code` keys SPREADSHEET_MESSAGES. */
export class SpreadsheetReadError extends Error {
  /** @param {'old_excel'|'too_large'|'nothing_found'} code */
  constructor(code) {
    super(SPREADSHEET_MESSAGES[code]);
    this.name = 'SpreadsheetReadError';
    this.code = code;
  }
}

/**
 * The wording G message for an error from readBloodworkSpreadsheet, or
 * null if it isn't one (the caller then uses its usual message).
 */
export function spreadsheetErrorText(err) {
  return err instanceof SpreadsheetReadError ? SPREADSHEET_MESSAGES[err.code] : null;
}

// ── CSV ───────────────────────────────────────────────────────────────────

// The separator used by the first line that has one (outside quotes).
// Excel in many European locales saves CSVs with semicolons.
function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  // A quote opens quoting only at the very start of a field; anywhere else
  // it's a literal character (e.g. 2" mass). The separator isn't known yet,
  // so a field starts after a line break or any candidate separator.
  let atFieldStart = true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i += 1;
        else inQuotes = false;
      }
    } else if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === '\n' || ch === '\r') {
      if (counts[','] + counts[';'] + counts['\t'] > 0) break;
      atFieldStart = true;
    } else if (ch in counts) {
      counts[ch] += 1;
      atFieldStart = true;
    } else atFieldStart = false;
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[',']) return '\t';
  return ',';
}

/**
 * Parse CSV text into rows of cells. Handles quoted fields with embedded
 * separators, doubled quotes ("") and line breaks, and \n, \r\n or \r
 * line endings.
 *
 * @param {string} text
 * @param {string} [delimiter] - detected from the first line if omitted
 * @returns {string[][]}
 */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  // True until the current field has any content. A quote opens quoting
  // only there; a quote in the middle of an unquoted field (2" mass) is a
  // literal character and stays in the cell.
  let atFieldStart = true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
      atFieldStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atFieldStart = true;
    } else {
      cell += ch;
      atFieldStart = false;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// UTF-8 if it's valid UTF-8; otherwise Windows-1252, which is what Excel
// on Windows uses for "CSV" (so "µmol/L" survives).
function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ── Sheets -> text ────────────────────────────────────────────────────────

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    // Drop floating-point noise like 0.30000000000000004.
    return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : '';
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

function csvField(text) {
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Rows as CSV lines, without empty rows or trailing empty cells. Interior
// empty cells are kept so every value stays under its column.
function rowsToLines(rows) {
  const lines = [];
  for (const row of rows) {
    const cells = (row ?? []).map(cellText);
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    if (cells.length > 0) lines.push(cells.map(csvField).join(','));
  }
  return lines;
}

/**
 * Turn parsed sheets into the text sent to the AI. Empty sheets are left
 * out. Throws 'nothing_found' if nothing readable is left, and 'too_large'
 * if the text is over MAX_SHEET_TEXT_CHARS.
 *
 * @param {{ name: string, rows: unknown[][] }[]} sheets
 * @returns {string}
 */
export function sheetsToText(sheets) {
  const blocks = sheets
    .map((s) => ({ name: s.name, lines: rowsToLines(s.rows) }))
    .filter((s) => s.lines.length > 0);
  // Bloodwork results are numbers: a file with no digit anywhere has none.
  if (blocks.length === 0 || !blocks.some((s) => s.lines.some((l) => /\d/.test(l)))) {
    throw new SpreadsheetReadError('nothing_found');
  }
  const text = blocks
    .map((s, i) => `Sheet ${i + 1} of ${blocks.length}: ${s.name}\n${s.lines.join('\n')}`)
    .join('\n\n');
  if (text.length > MAX_SHEET_TEXT_CHARS) throw new SpreadsheetReadError('too_large');
  return text;
}

// ── Files ─────────────────────────────────────────────────────────────────

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // every .xlsx
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // old .xls

// Size of an unpacked workbook: `read-excel-file` (pinned to 9.3.14) offers
// no option to refuse an oversized one before unpacking, and its zip filter
// sees only each entry's path, not its size. So the only limits here are
// the 10 MB upload cap on the packed file (checkUploadFile) and the
// MAX_SHEET_TEXT_CHARS check on the text after parsing. Parsing runs on the
// main thread, so a hugely compressed workbook can pause the page while it
// unpacks. If that ever matters, sum the sizes in the zip's central
// directory before calling the library.
async function readXlsxSheets(bytes) {
  let readXlsxFile;
  try {
    ({ default: readXlsxFile } = await import('read-excel-file/universal'));
  } catch (err) {
    // The reader is loaded on demand, so this fails offline or on a stale
    // PWA chunk after a deploy. That says nothing about the file, so it's
    // not a SpreadsheetReadError: the caller shows its usual failure message.
    reportClientError(err, { feature: 'bloodwork_spreadsheet', note: 'Could not load the .xlsx reader' });
    throw new Error('Could not load the spreadsheet reader', { cause: err });
  }
  let sheets;
  try {
    // Pass the ArrayBuffer, not the Uint8Array: older versions of
    // read-excel-file (including the pinned 9.3.14) accept only a Blob or
    // an ArrayBuffer. `bytes` was made from a whole ArrayBuffer, so
    // `bytes.buffer` is exactly the file.
    sheets = await readXlsxFile(bytes.buffer);
  } catch (err) {
    if (err?.code === 'XLS_FILE_NOT_SUPPORTED') throw new SpreadsheetReadError('old_excel');
    if (err?.code !== 'NO_DATA') {
      reportClientError(err, { feature: 'bloodwork_spreadsheet', note: 'Could not read .xlsx' });
    }
    throw new SpreadsheetReadError('nothing_found');
  }
  return sheets.map((s) => ({ name: s.sheet, rows: s.data }));
}

/**
 * Read a picked .csv or .xlsx into plain text for the AI.
 *
 * @param {File|Blob & { name?: string }} file
 * @returns {Promise<{ text: string, sheetNames: string[] }>}
 * @throws {SpreadsheetReadError} old_excel, too_large or nothing_found;
 *   any other Error (e.g. the .xlsx reader failed to load) gets the
 *   caller's usual failure message
 */
export async function readBloodworkSpreadsheet(file) {
  if (fileExtension(file?.name) === 'xls') throw new SpreadsheetReadError('old_excel');

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw new SpreadsheetReadError('nothing_found');
  // Go by what the file really is, not its name: Windows labels CSVs as
  // Excel files, and a renamed .xls is still an .xls.
  if (startsWith(bytes, OLE2_SIGNATURE)) throw new SpreadsheetReadError('old_excel');

  const sheets = startsWith(bytes, ZIP_SIGNATURE)
    ? await readXlsxSheets(bytes)
    : [{ name: 'Sheet 1', rows: parseCsv(decodeText(bytes)) }];

  return { text: sheetsToText(sheets), sheetNames: sheets.map((s) => s.name) };
}
