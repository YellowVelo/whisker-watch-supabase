import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

const {
  checkUploadFile, UPLOAD_MESSAGES, isSpreadsheetFile, spreadsheetContentType, uploadFile, BLOODWORK_UPLOAD_HELP,
  bloodworkUploadPurpose, checkBloodworkUploadFile,
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

describe('Bloodwork tab upload checks (spec 0081, Lynn 2026-11-25)', () => {
  const pick = (name, type, sizeMb = 0.1) => ({ name, type, size: Math.round(sizeMb * MB) });

  it('has the approved Bloodwork wrong-type wording, and leaves the general one alone', () => {
    expect(UPLOAD_MESSAGES.wrongTypeBloodwork).toBe(
      'Wysker Watch can only use photos (JPEG, PNG, WebP, GIF), PDFs, or CSV and Excel (.xlsx) files.',
    );
    expect(UPLOAD_MESSAGES.wrongType).toBe('Wysker Watch can only use photos (JPEG, PNG, WebP, GIF) or PDFs.');
  });

  it('routes spreadsheets to the spreadsheet purpose and everything else to scan', () => {
    expect(bloodworkUploadPurpose(pick('labs.csv', 'text/csv'))).toBe('spreadsheet');
    expect(bloodworkUploadPurpose(pick('labs.xlsx', ''))).toBe('spreadsheet');
    expect(bloodworkUploadPurpose(pick('labs.pdf', 'application/pdf'))).toBe('scan');
    expect(bloodworkUploadPurpose(pick('labs.jpg', 'image/jpeg'))).toBe('scan');
  });

  it('accepts photos, PDFs, CSVs and .xlsx files', () => {
    expect(checkBloodworkUploadFile(pick('a.jpg', 'image/jpeg', 2))).toBeNull();
    expect(checkBloodworkUploadFile(pick('a.pdf', 'application/pdf', 8))).toBeNull();
    expect(checkBloodworkUploadFile(pick('a.csv', ''))).toBeNull();
    expect(checkBloodworkUploadFile(pick('a.xlsx', ''))).toBeNull();
  });

  it('uses the Bloodwork wording for a wrong file type', () => {
    expect(checkBloodworkUploadFile(pick('a.docx', 'application/msword'))).toBe(UPLOAD_MESSAGES.wrongTypeBloodwork);
    expect(checkBloodworkUploadFile(pick('a.heic', 'image/heic'))).toBe(UPLOAD_MESSAGES.wrongTypeBloodwork);
  });

  it('uses the Bloodwork wording for a file over 10 MB (size checked before type)', () => {
    expect(UPLOAD_MESSAGES.tooLargeBloodwork).toBe('That file is over 10 MB. Try a smaller file.');
    expect(checkBloodworkUploadFile(pick('a.docx', 'application/msword', 12))).toBe(UPLOAD_MESSAGES.tooLargeBloodwork);
    expect(checkBloodworkUploadFile(pick('a.csv', 'text/csv', 11))).toBe(UPLOAD_MESSAGES.tooLargeBloodwork);
    expect(checkBloodworkUploadFile(pick('a.pdf', 'application/pdf', 11))).toBe(UPLOAD_MESSAGES.tooLargeBloodwork);
    // Other screens keep the photo-or-PDF wording.
    expect(checkUploadFile(pick('a.pdf', 'application/pdf', 11), 'scan')).toBe(UPLOAD_MESSAGES.tooLarge);
  });

  it('keeps the usual scan-photo and old-Excel messages', () => {
    expect(checkBloodworkUploadFile(pick('a.jpg', 'image/jpeg', 6))).toBe(UPLOAD_MESSAGES.scanImageTooLarge);
    expect(checkBloodworkUploadFile(pick('a.xls', 'application/vnd.ms-excel'))).toBe(UPLOAD_MESSAGES.oldExcel);
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

  it('sends a no-extension "application/vnd.ms-excel" file down the spreadsheet route (old-Excel message)', () => {
    const f = { name: 'labs', type: 'application/vnd.ms-excel', size: 100 };
    expect(isSpreadsheetFile(f)).toBe(true);
    expect(bloodworkUploadPurpose(f)).toBe('spreadsheet');
    expect(checkUploadFile(f, 'spreadsheet')).toBe(UPLOAD_MESSAGES.oldExcel);
    expect(checkBloodworkUploadFile(f)).toBe(UPLOAD_MESSAGES.oldExcel);
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
  // storage-js sends a File body's own .type, not options.contentType, so
  // the uploaded body itself must carry the corrected type.
  const mockUpload = () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    supabase.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) };
    supabase.storage = { from: vi.fn(() => ({ upload })) };
    return upload;
  };

  it('uploads a real typeless labs.csv File with a body typed text/csv', async () => {
    const upload = mockUpload();
    const picked = new File(['Test,Value\nALT,42\n'], 'labs.csv', { type: '' });
    await uploadFile({ file: picked, purpose: 'spreadsheet' });

    const [path, body, options] = upload.mock.calls[0];
    expect(path).toMatch(/^u1\/.+\.csv$/);
    expect(body).toBeInstanceOf(File);
    expect(body.type).toBe('text/csv');
    expect(body.name).toBe('labs.csv');
    expect(await body.text()).toBe('Test,Value\nALT,42\n');
    expect(options.contentType).toBe('text/csv');
  });

  it('uploads a real typeless labs.xlsx File with a body typed as xlsx', async () => {
    const upload = mockUpload();
    const picked = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'labs.xlsx', { type: '' });
    await uploadFile({ file: picked, purpose: 'spreadsheet' });

    const [path, body] = upload.mock.calls[0];
    expect(path).toMatch(/^u1\/.+\.xlsx$/);
    expect(body.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(body.size).toBe(4);
  });

  it('passes a correctly typed file through unchanged', async () => {
    const upload = mockUpload();
    const picked = new File(['a,1'], 'labs.csv', { type: 'text/csv' });
    await uploadFile({ file: picked, purpose: 'spreadsheet' });
    expect(upload.mock.calls[0][1]).toBe(picked);
  });

  it('refuses an .xls before uploading anything', async () => {
    const upload = vi.fn();
    supabase.storage = { from: vi.fn(() => ({ upload })) };
    await expect(uploadFile({ file: { name: 'labs.xls', type: 'application/vnd.ms-excel', size: 100 }, purpose: 'spreadsheet' }))
      .rejects.toThrow(UPLOAD_MESSAGES.oldExcel);
    expect(upload).not.toHaveBeenCalled();
  });

  it('names a file with no extension by its type, never by its whole name', async () => {
    const upload = mockUpload();
    await uploadFile({ file: new File(['a,1'], 'labs', { type: 'text/csv' }), purpose: 'spreadsheet' });
    await uploadFile({ file: new File(['%PDF'], 'report', { type: 'application/pdf' }), purpose: 'scan' });
    expect(upload.mock.calls[0][0]).toMatch(/^u1\/\d+-[a-z0-9]+\.csv$/);
    expect(upload.mock.calls[1][0]).toMatch(/^u1\/\d+-[a-z0-9]+\.pdf$/);
    expect(upload.mock.calls[0][0]).not.toMatch(/labs/);
  });

  it('keeps a lower-case extension from the name', async () => {
    const upload = mockUpload();
    await uploadFile({ file: new File(['x'], 'Cat.PNG', { type: 'image/png' }), purpose: 'photo' });
    expect(upload.mock.calls[0][0]).toMatch(/\.png$/);
  });

  it('keeps the browser type for photos', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    supabase.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) };
    supabase.storage = { from: vi.fn(() => ({ upload })) };
    const photo = new File(['x'], 'cat.png', { type: 'image/png' });
    await uploadFile({ file: photo, purpose: 'photo' });
    expect(upload.mock.calls[0][1]).toBe(photo);
    expect(upload.mock.calls[0][2].contentType).toBe('image/png');
  });
});
