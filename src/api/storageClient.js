import { supabase } from './supabaseClient';

/**
 * File storage for the "uploads" Supabase Storage bucket (spec 0071).
 *
 * The bucket is private: files are stored under the uploader's own folder
 * (`{userId}/…`) and shown through short-lived signed links, never public
 * URLs. Callers keep the file's *path* (e.g. pets.photo_path,
 * pet_documents.storage_path), not a link, and ask for a signed link only
 * when they need to display it.
 *
 * Who may open a file is decided by the storage read rule in migration
 * 0054, not here: your own uploads, the stock demo photos in shared/, a
 * pet photo for that pet's owners/co-owners/sitters, and a scanned
 * document for that pet's owners/co-owners only.
 */

const BUCKET = 'uploads';

// Must match storage.buckets (migration 0054) and ask-vet-assistant.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// The AI service's own per-image limit; applies only to photos sent for
// scanning, not to pet photos.
export const MAX_SCAN_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const PDF_TYPE = 'application/pdf';

// Spreadsheets for the Bloodwork import (spec 0081, FR27). Must match the
// bucket's list (migration 0061). Windows labels many .csv files
// "application/vnd.ms-excel", and some browsers give a .csv no type at
// all, so a .csv is recognized by its extension too. Old .xls files share
// the "application/vnd.ms-excel" label but can't be read, so they're
// refused by extension.
export const CSV_TYPE = 'text/csv';
export const LEGACY_EXCEL_TYPE = 'application/vnd.ms-excel';
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SPREADSHEET_TYPE_BY_EXT = { csv: CSV_TYPE, xlsx: XLSX_TYPE };

// The Bloodwork tab's file picker (wording E): photos, PDFs and spreadsheets.
export const BLOODWORK_FILE_ACCEPT = 'image/*,application/pdf,.csv,.xlsx,text/csv,'
  + XLSX_TYPE;
// Approved help line under the Bloodwork tab's Upload File button (spec
// 0081, wording E).
export const BLOODWORK_UPLOAD_HELP = '(accepts photo, PDF, CSV or Excel)';

// Approved user-facing copy (spec 0071, Visual Reference).
export const UPLOAD_MESSAGES = {
  tooLarge: 'That file is over 10 MB. Try a smaller photo or PDF.',
  wrongType: 'Wysker Watch can only use photos (JPEG, PNG, WebP, GIF) or PDFs.',
  failed: "We couldn't upload that file. Please try again.",
  scanImageTooLarge: 'That photo is too large to scan. Try a smaller photo or a PDF.',
  // Spec 0081, wording G (also used by src/lib/bloodworkSpreadsheet.js).
  oldExcel: 'This is an older Excel file. Save it as .xlsx or .csv and try again.',
};

/** Lower-case extension of a file name, or '' if it has none. */
export function fileExtension(name) {
  const base = String(name ?? '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * True when a picked file is a spreadsheet the Bloodwork import can read
 * (.csv or .xlsx, by extension or by type), or an old .xls it should refuse
 * with UPLOAD_MESSAGES.oldExcel. Screens use this to choose between the
 * 'spreadsheet' and 'scan' purposes.
 *
 * @param {{ name?: string, type?: string }} file
 */
export function isSpreadsheetFile(file) {
  const ext = fileExtension(file?.name);
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return true;
  return file?.type === CSV_TYPE || file?.type === XLSX_TYPE;
}

/**
 * The content type a spreadsheet is stored with. The browser's own type is
 * kept when the bucket allows it; when it gives none (or an unusual one),
 * the type comes from the extension.
 *
 * @param {{ name?: string, type?: string }} file
 * @returns {string}
 */
export function spreadsheetContentType(file) {
  const ext = fileExtension(file?.name);
  const type = file?.type ?? '';
  if (type === CSV_TYPE || type === XLSX_TYPE) return type;
  if (type === LEGACY_EXCEL_TYPE && ext === 'csv') return type;
  return SPREADSHEET_TYPE_BY_EXT[ext] ?? type;
}

/**
 * Thrown when a file is refused before upload. `message` is safe to show
 * the user as-is.
 */
export class UploadRejectedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

/**
 * Decide whether a picked file may be uploaded.
 *
 * @param {File} file
 * @param {'photo'|'scan'|'spreadsheet'} purpose - 'photo' = a pet photo
 *   (images only, 10 MB); 'scan' = a document sent to the AI (images up to
 *   5 MB, PDFs up to 10 MB); 'spreadsheet' = a bloodwork spreadsheet read
 *   in the browser (.csv or .xlsx, 10 MB; .xls refused, spec 0081)
 * @returns {string|null} a message from UPLOAD_MESSAGES if the file must be
 *   refused, or null if it's fine
 */
export function checkUploadFile(file, purpose) {
  // Size first (Lynn, 2026-11-15): an oversized photo is far more common
  // than a wrong file type, so "too large" is the more useful message when
  // a file is both.
  if (file.size > MAX_FILE_BYTES) return UPLOAD_MESSAGES.tooLarge;

  if (purpose === 'spreadsheet') {
    const ext = fileExtension(file.name);
    if (ext === 'xls') return UPLOAD_MESSAGES.oldExcel;
    if (ext === 'csv' || ext === 'xlsx') return null;
    // No usable extension: go by type. "application/vnd.ms-excel" alone
    // could be an old .xls, so it's only trusted on a .csv.
    if (file.type === CSV_TYPE || file.type === XLSX_TYPE) return null;
    if (file.type === LEGACY_EXCEL_TYPE) return UPLOAD_MESSAGES.oldExcel;
    return UPLOAD_MESSAGES.wrongType;
  }

  const isImage = IMAGE_TYPES.includes(file.type);
  const isPdf = file.type === PDF_TYPE;
  if (purpose === 'photo' ? !isImage : !(isImage || isPdf)) return UPLOAD_MESSAGES.wrongType;

  if (purpose === 'scan' && isImage && file.size > MAX_SCAN_IMAGE_BYTES) {
    return UPLOAD_MESSAGES.scanImageTooLarge;
  }
  return null;
}

/** Plain-language toast text for any error thrown by uploadFile. */
export function uploadErrorText(err) {
  return err instanceof UploadRejectedError ? err.message : UPLOAD_MESSAGES.failed;
}

/**
 * Upload a file to the caller's own folder.
 *
 * @param {{ file: File, purpose?: 'photo'|'scan'|'spreadsheet' }} params
 * @returns {Promise<{ path: string }>}
 * @throws {UploadRejectedError} if checkUploadFile refuses it, or with
 *   UPLOAD_MESSAGES.failed if the upload itself fails
 */
export async function uploadFile({ file, purpose = 'photo' }) {
  const refusal = checkUploadFile(file, purpose);
  if (refusal) throw new UploadRejectedError(refusal);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  // A spreadsheet often arrives with no type (spec 0081): store it with the
  // type its extension implies, so the bucket's type list accepts it.
  const contentType = purpose === 'spreadsheet' ? spreadsheetContentType(file) : file.type;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType });

  if (error) {
    // The bucket enforces the same limits server-side; anything it refuses
    // that slipped past checkUploadFile still gets plain-language copy.
    throw Object.assign(new UploadRejectedError(UPLOAD_MESSAGES.failed), { cause: error });
  }
  return { path };
}

/**
 * Delete a file the caller uploaded (e.g. a scan the owner cancelled).
 * Never throws: a leftover private file is better than a broken cancel.
 */
export async function removeUploadedFile(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('Could not remove uploaded file:', error.message);
}

// ── Signed links ──────────────────────────────────────────────────────────
// Links last an hour; each is reused for 50 minutes so a screen never shows
// one that's about to expire, and a list of pets costs one request, not one
// per pet.
const SIGNED_URL_SECONDS = 60 * 60;
const CACHE_MS = 50 * 60 * 1000;
const signedUrlCache = new Map(); // path -> { url, expiresAt }

/**
 * @param {string[]} paths
 * @returns {Promise<Record<string, string>>} path -> signed URL, for every
 *   path the caller is allowed to open (others are simply missing)
 */
export async function getSignedUrls(paths) {
  const now = Date.now();
  /** @type {Record<string, string>} */
  const result = {};
  const missing = [];
  for (const path of new Set(paths.filter(Boolean))) {
    const hit = signedUrlCache.get(path);
    if (hit && hit.expiresAt > now) result[path] = hit.url;
    else missing.push(path);
  }
  if (missing.length === 0) return result;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_URL_SECONDS);
  if (error) {
    console.warn('Could not create signed links:', error.message);
    return result;
  }
  for (const item of data ?? []) {
    if (item.signedUrl && !item.error) {
      signedUrlCache.set(item.path, { url: item.signedUrl, expiresAt: now + CACHE_MS });
      result[item.path] = item.signedUrl;
    }
  }
  return result;
}

// Requests for single links made in the same moment (e.g. every pet photo
// on the Pets list mounting at once) are gathered into one getSignedUrls
// call.
let pendingPaths = null;
let pendingBatch = null;

/**
 * @param {string} path
 * @returns {Promise<string|null>} a signed URL, or null if there's no file
 *   or the caller isn't allowed to open it
 */
export function getSignedUrl(path) {
  if (!path) return Promise.resolve(null);
  if (!pendingPaths) {
    pendingPaths = new Set();
    pendingBatch = Promise.resolve().then(() => {
      const paths = [...pendingPaths];
      pendingPaths = null;
      return getSignedUrls(paths);
    });
  }
  pendingPaths.add(path);
  return pendingBatch.then((urls) => urls[path] ?? null);
}

/** Test-only: forget cached links (e.g. between vitest cases). */
export function clearSignedUrlCache() {
  signedUrlCache.clear();
}
