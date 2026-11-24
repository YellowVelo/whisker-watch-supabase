import { supabase } from './supabaseClient';
import { PET_SCREEN_NAMES } from '@/lib/petScreenContext';

// Only the last this-many chat messages are sent as history (spec 0080 FR4;
// the server keeps the same number, MAX_HISTORY_ENTRIES in
// supabase/functions/ask-vet-assistant/prompts.ts).
export const MAX_CHAT_HISTORY = 20;

// Longest chat question the server accepts (MAX_QUESTION_CHARS in
// supabase/functions/ask-vet-assistant/prompts.ts); the chat boxes cap
// typing at this so a long question is never refused with a 400.
export const MAX_QUESTION_CHARS = 2000;

/**
 * Turns a chat screen's messages into the `history` the server accepts:
 * only `{ role, content }`, only user/assistant messages with non-empty
 * text (emergency and error bubbles have none), the last MAX_CHAT_HISTORY.
 * Pass the messages from BEFORE the new question; the question itself goes
 * in `question`, not here.
 *
 * @param {Array<{ role: string, content?: string, emergency?: boolean, error?: string }>} messages
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildChatHistory(messages) {
  return (messages || [])
    .filter((m) => !m.emergency && !m.error)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '')
    .map(({ role, content }) => ({ role, content }))
    .slice(-MAX_CHAT_HISTORY);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a UUID, the only pet_id shape the server accepts (it refuses
 * anything else with 400). For screens where the pet may not exist yet.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * The screen name to send with pet chat / insights, or undefined if it
 * isn't one the server accepts (it refuses unknown screens with 400).
 *
 * @param {string | null | undefined} screen
 * @returns {string | undefined}
 */
export function aiScreen(screen) {
  return PET_SCREEN_NAMES.includes(screen) ? screen : undefined;
}

/**
 * Calls the ask-vet-assistant Supabase Edge Function, which proxies to the
 * Anthropic API server-side (the API key never reaches the browser).
 * Requires the user to be logged in — the Edge Function checks the
 * Supabase auth session.
 *
 * Spec 0080: the app never sends AI instructions. It names one of 8 tasks
 * and sends only ids and the owner's own words; the server writes the
 * instructions and looks up the pet's details itself. Only the fields that
 * are defined are sent.
 *
 * @param {Object} params
 * @param {'pet_chat'|'household_chat'|'pet_insights'|'trends_summary'|'scan_vaccines'|'scan_vaccine_single'|'scan_medication'|'scan_bloodwork'} params.task
 * @param {string} [params.pet_id] - the pet the task is about
 * @param {string} [params.file_path] - scans: storage path of an uploaded
 *   image or PDF in the private "uploads" bucket, from uploadFile(). The
 *   Edge Function reads it from storage itself (spec 0071) and refuses
 *   anything the caller isn't allowed to open.
 * @param {string} [params.screen] - pet chat / insights: the screen the
 *   owner came from (one of PET_SCREEN_NAMES in src/lib/petScreenContext.js)
 * @param {string} [params.range] - Trends summary: 24H / 7D / 30D / 90D / 1Y
 * @param {string} [params.question] - chats: the owner's new message
 * @param {Array<{ role: string, content: string }>} [params.history] - chats:
 *   the conversation before the question (see buildChatHistory)
 * @returns {Promise<Object>} the task's parsed JSON answer. Special answers
 *   that never reach the AI: `{ urgent: true }` (chats, insights),
 *   `{ not_enough_data: true }` (pet_insights), `{ summary: null }`
 *   (trends_summary)
 * @throws {Error} with the server's message, plus `status` (e.g. 413 for an
 *   image too large to scan, 429 when rate-limited) and `code` (e.g.
 *   'daily_limit' or 'rate_limited' for a 429) from the function's error body
 */
export async function invokeAI({ task, pet_id, file_path, screen, range, question, history }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }

  const fields = { task, pet_id, file_path, screen, range, question, history };
  const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const resp = await fetch(`${supabaseUrl}/functions/v1/ask-vet-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(errBody.error || 'AI request failed'), {
      status: resp.status,
      code: errBody.code,
    });
  }

  return resp.json();
}
