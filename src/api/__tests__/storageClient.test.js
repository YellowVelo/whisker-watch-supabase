import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

const { checkUploadFile, UPLOAD_MESSAGES } = await import('../storageClient');

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
