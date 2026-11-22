import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { removeUploadedFile, UploadRejectedError, UPLOAD_MESSAGES } from '@/api/storageClient';
import { aiErrorText } from '@/lib/aiGuardrails';
import { reportClientError } from '@/lib/errorMonitoring';

/**
 * Scanned vet documents (spec 0071).
 *
 * A scan is kept only if the owner saves what it found: the file is then
 * linked to the pet(s) in pet_documents, so a future feature (e.g. Ask
 * Wysker using recent bloodwork) can find it. If the owner cancels, closes
 * the screen, or the scan fails, the file is deleted.
 */

/**
 * Link an uploaded scan to the pets it belongs to. Never throws: the
 * owner's record is already saved by the time this runs, and a link that
 * fails only leaves a private, unlinked file behind (reported to Sentry).
 *
 * @param {{ petIds: string[], path: string, kind: 'vaccination'|'bloodwork'|'medication' }} params
 */
export async function linkScannedDocument({ petIds, path, kind }) {
  const ids = [...new Set((petIds || []).filter(Boolean))];
  if (!path || ids.length === 0) return;
  const { error } = await supabase
    .from('pet_documents')
    .upsert(ids.map((pet_id) => ({ pet_id, storage_path: path, kind })), {
      onConflict: 'pet_id,storage_path',
      ignoreDuplicates: true,
    });
  if (error) {
    reportClientError(error, { feature: 'scan_document_link', note: 'Could not link scanned document', kind });
  }
}

/**
 * Toast text for a failed scan: the upload refusal's own message, the
 * "too large to scan" copy when the AI function refuses a big image, or the
 * shared AI error text otherwise.
 */
export function scanErrorText(err) {
  if (err instanceof UploadRejectedError) return err.message;
  if (err?.status === 413) return UPLOAD_MESSAGES.scanImageTooLarge;
  return aiErrorText(err);
}

/**
 * Tracks the one scan file a screen is holding while the owner reviews
 * what it found.
 *
 * - hold(path): a new scan was uploaded (any previous unsaved one is
 *   deleted first).
 * - keep(petIds): the owner saved; link the held file and stop holding it.
 * - discard(): the owner cancelled or the scan failed; delete it.
 * - Leaving the screen while still holding a file deletes it too.
 *
 * @param {'vaccination'|'bloodwork'|'medication'} kind
 */
export function usePendingScan(kind) {
  const heldRef = useRef(null);

  const discard = useCallback(() => {
    const path = heldRef.current;
    heldRef.current = null;
    if (path) removeUploadedFile(path);
  }, []);

  const hold = useCallback((path) => {
    if (heldRef.current && heldRef.current !== path) removeUploadedFile(heldRef.current);
    heldRef.current = path;
  }, []);

  const keep = useCallback(async (petIds) => {
    const path = heldRef.current;
    heldRef.current = null;
    if (!path) return;
    // Saved, but nothing from the scan was kept (e.g. every line excluded):
    // treat it like a cancel.
    if (!(petIds || []).some(Boolean)) {
      removeUploadedFile(path);
      return;
    }
    await linkScannedDocument({ petIds, path, kind });
  }, [kind]);

  const isHolding = useCallback(() => heldRef.current !== null, []);

  useEffect(() => discard, [discard]);

  return { hold, keep, discard, isHolding };
}
