import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

const {
  checkUploadFile, UPLOAD_MESSAGES, isSpreadsheetFile, spreadsheetContentType, uploadFile, BLOODWORK_UPLOAD_HELP,
} = await import('../storageClient');
const { supabase } = await import('../supabaseClient');

const MB = 1024 * 1024;
const file = (type, sizeMb) => ({ type, size: Math.round(sizeMb * MB), name: 'f' });

describe('checkUploadFile (spec 0071)', () => {
  it('accepts a normal pet photo', () => {
    expect(checkUploadFile(file('image/jpeg', 3), 'photo')).toBeNull();
  });

  it('accepts a pet photo between 5 and 10 MB (the 5 MB limit is only for scans)', () => {
    expect(checkUploadFile(file('image/png', 8), 'photo')).toBeNull();
  });

  it('refuses anything over 10 MB', () => {
    expect(checkUploadFile(file('image/jpeg', 11), 'photo')).toBe(UPLOAD_MESSAGES.tooLarge);
    expect(checkUploadFile(file('application/pdf', 11), 'scan')).toBe(UPLOAD_MESSAGES.tooLarge);
  });

  it('checks size before type (Lynn, 2026-11-15): a 12 MB Word file is "too large"', () => {
    expect(checkUploadFile(file('application/msword', 12), 'scan')).toBe(UPLOAD_MESSAGES.tooLarge);
  });

  it('refuses a PDF as a pet photo', () => {
    expect(checkUploadFile(file('application/pdf', 1), 'photo')).toBe(UPLOAD_MESSAGES.wrongType);
  });

  it('refuses CSV and other non-photo/PDF types for scans', () => {
    expect(checkUploadFile(file('text/csv', 0.1), 'scan')).toBe(UPLOAD_MESSAGES.wrongType);
    expect(checkUploadFile(file('image/heic', 2), 'scan')).toBe(UPLOAD_MESSAGES.wrongType);
  });

  it('accepts a PDF scan up to 10 MB', () => {
    expect(checkUploadFile(file('application/pdf', 9), 'scan')).toBeNull();
  });

  it('refuses a scan photo over the AI image limit of 5 MB', () => {
    expect(checkUploadFile(file('image/jpeg', 6), 'scan')).toBe(UPLOAD_MESSAGES.scanImageTooLarge);
    expect(checkUploadFile(file('image/jpeg', 4), 'scan')).toBeNull();
  });
});

describe("checkUploadFile 'spreadsheet' (spec 0081, FR27/FR32)", () => {
  const sheet = (name, type, sizeMb = 0.1) => ({ name, type, size: Math.round(sizeMb * MB) });
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  it('accepts a .csv labeled text/csv', () => {
    expect(checkUploadFile(sheet('labs.csv', 'text/csv'), 'spreadsheet')).toBeNull();
  });

  it('accepts a .csv that Windows labels application/vnd.ms-excel', () => {
    expect(checkUploadFile(sheet('labs.csv', 'application/vnd.ms-excel'), 'spreadsheet')).toBeNull();
  });

  it('accepts a .csv with no type at all', () => {
    expect(checkUploadFile(sheet('labs.csv', ''), 'spreadsheet')).toBeNull();
    expect(checkUploadFile(sheet('LABS.CSV', ''), 'spreadsheet')).toBeNull();
  });

  it('accepts an .xlsx by type and by extension', () => {
    expect(checkUploadFile(sheet('labs.xlsx', XLSX), 'spreadsheet')).toBeNull();
    expect(checkUploadFile(sheet('labs.xlsx', ''), 'spreadsheet')).toBeNull();
    expect(checkUploadFile(sheet('labs', XLSX), 'spreadsheet')).toBeNull();
    expect(checkUploadFile(sheet('labs', 'text/csv'), 'spreadsheet')).toBeNull();
  });

  it('refuses an old .xls with wording G', () => {
    expect(checkUploadFile(sheet('labs.xls', 'application/vnd.ms-excel'), 'spreadsheet')).toBe(UPLOAD_MESSAGES.oldExcel);
    expect(checkUploadFile(sheet('labs.xls', ''), 'spreadsheet')).toBe(UPLOAD_MESSAGES.oldExcel);
    // "application/vnd.ms-excel" with no .csv name could be an .xls.
    expect(checkUploadFile(sheet('labs', 'application/vnd.ms-excel'), 'spreadsheet')).toBe(UPLOAD_MESSAGES.oldExcel);
    expect(UPLOAD_MESSAGES.oldExcel).toBe('This is an older Excel file. Save it as .xlsx or .csv and try again.');
  });

  it('refuses a non-spreadsheet as a spreadsheet', () => {
    expect(checkUploadFile(sheet('labs.pdf', 'application/pdf'), 'spreadsheet')).toBe(UPLOAD_MESSAGES.wrongType);
  });

  it('keeps the 10 MB limit and checks size before type', () => {
    expect(checkUploadFile(sheet('labs.csv', 'text/csv', 9), 'spreadsheet')).toBeNull();
    expect(checkUploadFile(sheet('labs.csv', 'text/csv', 11), 'spreadsheet')).toBe(UPLOAD_MESSAGES.tooLarge);
    expect(checkUploadFile(sheet('labs.xls', 'application/vnd.ms-excel', 11), 'spreadsheet')).toBe(UPLOAD_MESSAGES.tooLarge);
  });

  it('scans still refuse spreadsheets (they are read in the browser, never sent as files)', () => {
    expect(checkUploadFile(sheet('labs.xlsx', XLSX), 'scan')).toBe(UPLOAD_MESSAGES.wrongType);
  });
});

describe('isSpreadsheetFile / spreadsheetContentType (spec 0081)', () => {
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  it('recognizes .csv, .xlsx and .xls by name, and CSV/xlsx by type', () => {
    expect(isSpreadsheetFile({ name: 'a.csv', type: '' })).toBe(true);
    expect(isSpreadsheetFile({ name: 'a.xlsx', type: '' })).toBe(true);
    expect(isSpreadsheetFile({ name: 'a.xls', type: 'application/vnd.ms-excel' })).toBe(true);
    expect(isSpreadsheetFile({ name: 'a', type: XLSX })).toBe(true);
    expect(isSpreadsheetFile({ name: 'a.pdf', type: 'application/pdf' })).toBe(false);
    expect(isSpreadsheetFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it('takes the type from the extension when the browser gives none', () => {
    expect(spreadsheetContentType({ name: 'a.csv', type: '' })).toBe('text/csv');
    expect(spreadsheetContentType({ name: 'a.xlsx', type: '' })).toBe(XLSX);
    expect(spreadsheetContentType({ name: 'a.csv', type: 'application/vnd.ms-excel' })).toBe('application/vnd.ms-excel');
    expect(spreadsheetContentType({ name: 'a.csv', type: 'text/csv' })).toBe('text/csv');
  });

  it('the help line is the approved wording E', () => {
    expect(BLOODWORK_UPLOAD_HELP).toBe('(accepts photo, PDF, CSV or Excel)');
  });
});

describe('uploadFile content type (spec 0081)', () => {
  it('uploads a typeless .csv as text/csv and a typeless .xlsx as the xlsx type', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    supabase.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) };
    supabase.storage = { from: vi.fn(() => ({ upload })) };

    await uploadFile({ file: { name: 'labs.csv', type: '', size: 100 }, purpose: 'spreadsheet' });
    expect(upload.mock.calls[0][0]).toMatch(/^u1\/.+\.csv$/);
    expect(upload.mock.calls[0][2].contentType).toBe('text/csv');

    await uploadFile({ file: { name: 'labs.xlsx', type: '', size: 100 }, purpose: 'spreadsheet' });
    expect(upload.mock.calls[1][2].contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('refuses an .xls before uploading anything', async () => {
    const upload = vi.fn();
    supabase.storage = { from: vi.fn(() => ({ upload })) };
    await expect(uploadFile({ file: { name: 'labs.xls', type: 'application/vnd.ms-excel', size: 100 }, purpose: 'spreadsheet' }))
      .rejects.toThrow(UPLOAD_MESSAGES.oldExcel);
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps the browser type for photos', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    supabase.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) };
    supabase.storage = { from: vi.fn(() => ({ upload })) };
    await uploadFile({ file: { name: 'cat.png', type: 'image/png', size: 100 }, purpose: 'photo' });
    expect(upload.mock.calls[0][2].contentType).toBe('image/png');
  });
});
