// Supabase Edge Function: ask-vet-assistant
//
// Server-side proxy to the Anthropic API for the app's 9 AI features. The
// ANTHROPIC_API_KEY is read from Supabase secrets — it never reaches the
// browser.
//
// Spec 0080 (PA-11, PA-52): the app no longer sends AI instructions. It
// names one of 9 known tasks and sends only ids and the owner's own words;
// the server writes the instructions (./prompts.ts) and looks up the pet's
// details itself (./context.ts). Anything else is refused.
//
// Request body (checked by parseTaskRequest in ./prompts.ts):
//   {
//     task: 'pet_chat' | 'household_chat' | 'pet_insights' |
//           'trends_summary' | 'scan_vaccines' | 'scan_vaccine_single' |
//           'scan_medication' | 'scan_bloodwork' | 'bloodwork_spreadsheet',
//     pet_id?: string,     // the pet the task is about
//     file_path?: string,  // scans: a file in the private "uploads" bucket
//     screen?: string,     // pet chat / insights: the screen the owner came from
//     range?: string,      // Trends summary: 24H / 7D / 30D / 90D / 1Y
//     question?: string,   // chats: the owner's question (max 2,000 chars)
//     history?: [...]      // chats: the conversation so far (last 20 kept)
//     sheet_text?: string  // bloodwork_spreadsheet: the spreadsheet as text,
//                          // read by the app (max 60,000 chars, spec 0081)
//   }
// A body with `prompt`, `response_json_schema` or an unknown task is
// refused with 400 unknown_task; `file_url` is refused with 400
// invalid_file (spec 0071's temporary link support is gone).
//
// Response: the task's parsed JSON answer, in the same shape the app used
// to ask for. The two bloodwork tasks answer { visits, skipped }, checked
// by ./bloodwork.ts (spec 0081 FR29, FR35-FR37). Special cases that never
// call the AI:
//   - { urgent: true }          a chat question with an emergency phrase
//   - { summary: null }         Trends summary with too few check-ins
//   - { not_enough_data: true } Pet Insights with too few check-ins
//
// Order of checks (spec 0080): auth -> parse -> emergency stop (chats) ->
// file access checks (scans: safe path, then the caller's own folder or a
// pet_documents link, read as the caller) -> pet data and gates, read as
// the caller -> rate check -> file download and type/size checks (scans)
// -> Anthropic. Every no-AI reply in FR10's list comes before the rate
// check, so it doesn't use up the person's allowance. The download comes
// after it, so a refused caller can't make the function fetch files; the
// rare 404/415/413 file replies after it do count.
//
// Who may do what:
//   - The caller must be a signed-in Supabase user (401 otherwise).
//   - Pet data is read with the CALLER's own client, so the database's
//     access rules decide what the AI is told. A pet the caller can't see
//     is refused with 403 forbidden_pet. Sitters can ask about a pet
//     during its sit, as before; household chat and the multi-pet scan
//     only list pets the caller owns or co-owns. Loading it only reads.
//   - The bloodwork spreadsheet task (spec 0081) is for owners and
//     co-owners only, like bloodwork itself: a sitter or stranger gets 403
//     forbidden_pet.
//   - Files (spec 0071): the function never fetches a caller-supplied URL.
//     It only reads a file_path in the caller's own folder (a scan they
//     just uploaded) or linked in pet_documents to a pet they own, and
//     downloads it with the caller's own access, only after the rate
//     check, so the storage rules (migration 0054) also have to allow it
//     (spec 0082). Only paths in the shape the app's uploader creates are
//     accepted. Size and type are checked before anything is sent to
//     Anthropic. Spreadsheet files (.csv, .xlsx, .xls) are refused by name
//     before the rate check and by stored type after the download (spec
//     0081 FR34): spreadsheets go through bloodwork_spreadsheet as text.
//   - The service role is used only for the rate-limit calls.
//
// Safety (spec 0041, enforced here by spec 0080 FR5): a chat question with
// an emergency phrase gets { urgent: true } before any rate check or AI
// call. If the AI flags a chat or Insights answer as urgent, everything it
// wrote is dropped and only { urgent: true } is returned, so the app can
// only show its fixed "contact your vet" message.
//
// Rate limits (specs 0050 and 0080): one all-or-nothing call to
// check_and_record_rate_limits_windowed (migration 0060) checks two limits
// per user: 100 per 24 hours (429 daily_limit) and 20 requests per 10
// minutes (429 rate_limited). The daily key is listed first, so someone
// over both sees the daily wording (FR9). Only requests that are about to call the AI are
// counted. A failed rate check refuses the request (503) rather than risk a
// paid AI call. The daily-limit Sentry warning goes out at most once per
// person per 24 hours (FR10), gated by check_and_record_rate_limit on the
// key ask-vet-assistant:daily-warned:user:<id>; if that gate call fails,
// the warning is skipped and the 429 still goes back.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { encodeBase64 } from 'jsr:@std/encoding@1.0.11/base64';
import { reportError, serverError } from '../_shared/errorReporting.ts';
import {
  buildBloodworkSpreadsheet,
  buildHouseholdChat,
  buildPetChat,
  buildPetInsights,
  buildScanBloodwork,
  buildScanMedication,
  buildScanVaccines,
  buildScanVaccineSingle,
  buildTrendsSummary,
  emergencyStop,
  hasEnoughCheckIns,
  isTaskRequestError,
  parseTaskRequest,
  stripUrgent,
  type BuiltPrompt,
  type TaskRequest,
} from './prompts.ts';
import { cleanBloodworkAnswer } from './bloodwork.ts';
import { dateStrInTimezone } from '../_shared/checkinRules.ts';
import {
  callerOwnsPet,
  loadActiveMedications,
  loadBaseline,
  loadCallerTimezone,
  loadHouseholdPets,
  loadOwnedPetNames,
  loadPet,
  loadRecentCheckIns,
  loadTrendsSummaryInputs,
  loadWeights,
  type PetRecord,
} from './context.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Spec 0050: sized to cover a real chat session, an insights generation and
// scanning a few documents back to back, while stopping a runaway script
// quickly. Spec 0080 FR9: plus 100 per person per 24 hours, across all tasks.
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 10 * 60;
const DAILY_LIMIT = 100;
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

const RATE_LIMITED_MESSAGE = "You've reached the limit for AI requests. Please wait a few minutes and try again.";
const DAILY_LIMIT_MESSAGE = "You've reached today's limit for Ask Wysker and document scans. You can try again tomorrow.";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Spec 0071 file limits. Must match storage.buckets (migration 0054) and
// src/api/storageClient.js. Images have the lower AI-side limit.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PDF_TYPE = 'application/pdf';

// Tasks whose answers can carry the AI's "urgent" flag (spec 0080 FR5).
const URGENT_TASKS = new Set(['pet_chat', 'household_chat', 'pet_insights']);

// Tasks whose answers are checked by ./bloodwork.ts (spec 0081).
const BLOODWORK_TASKS = new Set(['scan_bloodwork', 'bloodwork_spreadsheet']);

// Output room for the AI's answer. The bloodwork answer lists every value
// of every visit with its unit, so it gets more than the default.
const DEFAULT_MAX_TOKENS = 2048;
const BLOODWORK_MAX_TOKENS = 8192;

// File name endings the scans never read (spec 0081 FR34). The extension
// is the part after the last dot, lowercased by the uploader.
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'xlsx', 'xls']);
const UNSUPPORTED_TYPE = { error: 'Unsupported file type', code: 'unsupported_type' };

const FORBIDDEN_PET = { error: 'You do not have access to this pet', code: 'forbidden_pet' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// The only path shape the app's uploader creates: <folder>/<name>.<ext>
// (src/api/storageClient.js: `${userId}/${Date.now()}-${rand}.${ext}`).
// The extension is whatever followed the last dot in the person's file name,
// lowercased, so it can hold spaces, dashes, underscores or accented letters
// ("rabies cert", "jpg-large", "résumé"), but never a dot.
// Why this can't step outside the folder: there are exactly two segments,
// and the second always starts with the name part ([A-Za-z0-9_-]+), so it
// can never be "." or "..". The extension excludes ".", "/", backslash, "%"
// (no encoded tricks), "?" and "#" (no query or fragment), and control
// characters (U+0000-U+001F, U+007F).
// deno-lint-ignore no-control-regex
const UPLOAD_PATH_SHAPE = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[^./\\%?#\x00-\x1F\x7F]+$/;

// The storage path if it's safe to look up, or null. Never anything
// outside the uploads bucket.
function safePath(path: string): string | null {
  // Spec 0082: allow-list the exact shape the uploader creates
  // (<folder>/<name>.<ext>). Rejects %, backslashes, ?, #, control
  // characters, . and .. segments, extra folders and leading/trailing slashes.
  if (!path || !UPLOAD_PATH_SHAPE.test(path)) return null;
  return path;
}

// loadPet answers null for a pet the caller can't see. A permission-denied
// error from the database means the same thing; any other error is thrown.
async function loadVisiblePet(client: SupabaseClient, petId: string): Promise<PetRecord | null> {
  try {
    return await loadPet(client, petId);
  } catch (err) {
    if (err instanceof Error && err.message.includes('permission denied')) return null;
    throw err;
  }
}

type FileBlock =
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

// Spec 0071 file access checks, cheap and before the rate check: a safe
// path the caller may read. Returns the path, or the refusal to send back.
async function checkScanFileAccess(
  path: string,
  userId: string,
  callerClient: SupabaseClient,
): Promise<{ path: string } | { refusal: Response }> {
  const safe = safePath(path);
  if (!safe) {
    return { refusal: jsonResponse({ error: 'Invalid file reference', code: 'invalid_file' }, 400) };
  }
  // FR34: a spreadsheet is never sent to the AI as if it were an image or
  // a PDF. Refused here, before the rate check, so it doesn't count.
  if (SPREADSHEET_EXTENSIONS.has(safe.slice(safe.lastIndexOf('.') + 1).toLowerCase())) {
    return { refusal: jsonResponse(UNSUPPORTED_TYPE, 415) };
  }

  // Allowed: the caller's own folder (a scan they just uploaded), or a
  // document linked to a pet they own. The pet_documents lookup runs as
  // the caller, so its RLS (owners/co-owners only) does the check.
  let allowed = safe.split('/')[0] === userId;
  if (!allowed) {
    const { data: linked } = await callerClient
      .from('pet_documents')
      .select('id')
      .eq('storage_path', safe)
      .limit(1);
    allowed = (linked?.length ?? 0) > 0;
  }
  if (!allowed) {
    return { refusal: jsonResponse({ error: 'You do not have access to that file', code: 'forbidden_file' }, 403) };
  }
  return { path: safe };
}

// Spec 0071 download and type/size checks, after the rate check, on a path
// checkScanFileAccess allowed. Downloads with the caller's own client, never
// the service role, so the storage rules decide too (spec 0082); a denied
// download is answered like a missing file. Returns the file as an Anthropic
// content block, or the refusal to send back.
async function downloadScanFile(
  safe: string,
  supabaseClient: SupabaseClient,
): Promise<{ block: FileBlock } | { refusal: Response }> {
  const { data: blob, error: downloadError } = await supabaseClient.storage.from('uploads').download(safe);
  if (downloadError || !blob) {
    return { refusal: jsonResponse({ error: 'Could not read that file', code: 'file_not_found' }, 404) };
  }
  const contentType = blob.type;
  const isPdf = contentType === PDF_TYPE;
  // Only images and PDFs: a stored spreadsheet (text/csv, the Excel types)
  // is refused here whatever its name (FR34).
  if (!isPdf && !IMAGE_TYPES.has(contentType)) {
    return { refusal: jsonResponse(UNSUPPORTED_TYPE, 415) };
  }
  if (blob.size > MAX_FILE_BYTES || (!isPdf && blob.size > MAX_IMAGE_BYTES)) {
    return {
      refusal: jsonResponse({ error: 'File is too large', code: isPdf ? 'file_too_large' : 'image_too_large' }, 413),
    };
  }

  const data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
  return {
    block: isPdf
      ? { type: 'document', source: { type: 'base64', media_type: PDF_TYPE, data } }
      : { type: 'image', source: { type: 'base64', media_type: contentType, data } },
  };
}

// Builds the task's prompt from data read as the caller. Returns either the
// prompt or a reply to send without calling the AI.
async function buildPrompt(
  req: TaskRequest,
  userId: string,
  client: SupabaseClient,
): Promise<{ prompt: BuiltPrompt } | { reply: Response }> {
  switch (req.task) {
    case 'pet_chat': {
      const pet = await loadVisiblePet(client, req.pet_id);
      if (!pet) return { reply: jsonResponse(FORBIDDEN_PET, 403) };
      const timezone = await loadCallerTimezone(client, userId);
      const [medications, baseline] = await Promise.all([
        loadActiveMedications(client, req.pet_id, dateStrInTimezone(timezone, 0)),
        loadBaseline(client, req.pet_id),
      ]);
      return {
        prompt: buildPetChat({ pet, medications, baseline, screen: req.screen, history: req.history, question: req.question }),
      };
    }
    case 'household_chat': {
      const pets = await loadHouseholdPets(client, userId);
      return { prompt: buildHouseholdChat({ pets, history: req.history, question: req.question }) };
    }
    case 'pet_insights': {
      const pet = await loadVisiblePet(client, req.pet_id);
      if (!pet) return { reply: jsonResponse(FORBIDDEN_PET, 403) };
      const timezone = await loadCallerTimezone(client, userId);
      const checkIns = await loadRecentCheckIns(client, req.pet_id, timezone);
      if (!hasEnoughCheckIns(checkIns)) return { reply: jsonResponse({ not_enough_data: true }) };
      const [medications, baseline, weights] = await Promise.all([
        loadActiveMedications(client, req.pet_id, dateStrInTimezone(timezone, 0)),
        loadBaseline(client, req.pet_id),
        loadWeights(client, req.pet_id),
      ]);
      return { prompt: buildPetInsights({ pet, medications, baseline, screen: req.screen, checkIns, weights }) };
    }
    case 'trends_summary': {
      const pet = await loadVisiblePet(client, req.pet_id);
      if (!pet) return { reply: jsonResponse(FORBIDDEN_PET, 403) };
      const timezone = await loadCallerTimezone(client, userId);
      const inputs = await loadTrendsSummaryInputs(client, req.pet_id, req.range, timezone);
      if (!inputs) return { reply: jsonResponse({ summary: null }) };
      return { prompt: buildTrendsSummary({ petName: pet.name, ...inputs }) };
    }
    case 'scan_vaccines': {
      // pet_id is required here (the pet whose page the scan came from), so
      // it must be one the caller can see, as for the other pet tasks.
      const pet = await loadVisiblePet(client, req.pet_id);
      if (!pet) return { reply: jsonResponse(FORBIDDEN_PET, 403) };
      const ownedPets = await loadOwnedPetNames(client, userId);
      return { prompt: buildScanVaccines({ ownedPets }) };
    }
    case 'scan_vaccine_single':
      return { prompt: buildScanVaccineSingle() };
    case 'scan_medication':
      return { prompt: buildScanMedication() };
    case 'scan_bloodwork':
      return { prompt: buildScanBloodwork() };
    case 'bloodwork_spreadsheet': {
      // Owners and co-owners only, as for bloodwork itself (its RLS is
      // is_pet_owner(), migration 0004): a sitter can see the pet during
      // the sit but can't import its bloodwork.
      const pet = await loadVisiblePet(client, req.pet_id);
      if (!pet || !(await callerOwnsPet(client, req.pet_id, userId))) {
        return { reply: jsonResponse(FORBIDDEN_PET, 403) };
      }
      return { prompt: buildBloodworkSpreadsheet(req.sheet_text) };
    }
  }
}

interface AnthropicMessage {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
}

// The AI's answer as JSON, or undefined. If it wrote anything around the
// JSON (a sentence before it, say), the outermost { ... } is tried too.
function parseAnswer(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller is an authenticated Supabase user.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const userId = userData.user.id;

    // Only the parsed task request is used from here on, never the raw body.
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ error: 'Request body must be JSON', code: 'invalid_body' }, 400);
    }
    const parsed = parseTaskRequest(rawBody);
    if (isTaskRequestError(parsed)) {
      return jsonResponse({ error: parsed.error, code: parsed.code }, parsed.status);
    }
    const task = parsed;

    // Emergency hard stop (FR5): before the rate check and the AI.
    if ((task.task === 'pet_chat' || task.task === 'household_chat') && emergencyStop(task.question)) {
      return jsonResponse({ urgent: true });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Scans: the cheap access checks only. The file itself is downloaded
    // after the rate check, so a refused caller can't trigger downloads.
    let scanPath: string | null = null;
    if ('file_path' in task) {
      const access = await checkScanFileAccess(task.file_path, userId, supabaseClient);
      if ('refusal' in access) return access.refusal;
      scanPath = access.path;
    }

    // Pet data and the no-AI replies (forbidden_pet, not_enough_data,
    // summary: null), read as the caller, before the rate check.
    const built = await buildPrompt(task, userId, supabaseClient);
    if ('reply' in built) return built.reply;
    const { system, user } = built.prompt;

    // Rate limits, right before the file download and the AI, so a rejected
    // request never reaches Anthropic. Keyed per user: every caller has a
    // real session. Daily key first: the function returns the 1-based index
    // of the first key over its limit, so someone over both sees wording A.
    const { data: overLimit, error: rateError } = await adminClient.rpc('check_and_record_rate_limits_windowed', {
      p_keys: [`ask-vet-assistant:daily:user:${userId}`, `ask-vet-assistant:user:${userId}`],
      p_limits: [DAILY_LIMIT, RATE_LIMIT],
      p_windows: [DAILY_WINDOW_SECONDS, RATE_WINDOW_SECONDS],
    });
    if (rateError || typeof overLimit !== 'number') {
      // Fail closed, as sign-up does: no paid API call if the limiter
      // itself is unavailable.
      reportError(rateError ?? new Error('rate limit check returned no result'), {
        function: 'ask-vet-assistant',
        feature: 'rate_limit',
      });
      return jsonResponse({ error: 'Unable to process this request right now' }, 503);
    }
    if (overLimit === 1) {
      // FR10: so Lynn can see whether 100 a day is too low, at most once
      // per person per 24 hours.
      const { data: firstToday, error: warnGateError } = await adminClient.rpc('check_and_record_rate_limit', {
        p_key: `ask-vet-assistant:daily-warned:user:${userId}`,
        p_limit: 1,
        p_window_seconds: DAILY_WINDOW_SECONDS,
      });
      if (!warnGateError && firstToday === true) {
        reportError(
          new Error('ask-vet-assistant daily AI cap reached'),
          { function: 'ask-vet-assistant', feature: 'ai_daily_cap', user_id: userId },
          'warning',
        );
      }
      return jsonResponse({ error: DAILY_LIMIT_MESSAGE, code: 'daily_limit' }, 429);
    }
    if (overLimit === 2) {
      return jsonResponse({ error: RATE_LIMITED_MESSAGE, code: 'rate_limited' }, 429);
    }
    if (overLimit !== 0) {
      reportError(new Error(`rate limit check returned ${overLimit}`), {
        function: 'ask-vet-assistant',
        feature: 'rate_limit',
      });
      return jsonResponse({ error: 'Unable to process this request right now' }, 503);
    }

    // Scans: download the file and check its type and size.
    let fileBlock: FileBlock | null = null;
    if (scanPath) {
      const file = await downloadScanFile(scanPath, supabaseClient);
      if ('refusal' in file) return file.refusal;
      fileBlock = file.block;
    }

    // Never send an empty text block: the scans' whole user message is the file.
    const contentBlocks: (FileBlock | { type: 'text'; text: string })[] = [];
    if (fileBlock) contentBlocks.push(fileBlock);
    if (user) contentBlocks.push({ type: 'text', text: user });

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: BLOODWORK_TASKS.has(task.task) ? BLOODWORK_MAX_TOKENS : DEFAULT_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    const aiTags = { function: 'ask-vet-assistant', feature: 'ai_request', task: task.task };
    if (!anthropicResp.ok) {
      // Sentry gets only the status and Anthropic's error type, never the
      // prompt; the full error body goes to the function log, as before.
      const errText = await anthropicResp.text();
      console.error('Anthropic API error:', anthropicResp.status, errText);
      let errType = 'unknown';
      try {
        errType = String(JSON.parse(errText)?.error?.type ?? 'unknown');
      } catch {
        // not JSON; keep 'unknown'
      }
      reportError(new Error(`Anthropic API error ${anthropicResp.status} (${errType})`), aiTags);
      return jsonResponse({ error: 'AI request failed' }, 502);
    }

    const data = (await anthropicResp.json()) as AnthropicMessage;
    const textOut = data.content?.find((b) => b.type === 'text')?.text || '';

    // Strip markdown code fences if Claude added them despite instructions.
    const cleaned = textOut.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = parseAnswer(cleaned);
    if (result === undefined) {
      // Only the stop reason goes to Sentry, never the AI's text.
      reportError(new Error(`AI returned invalid JSON (stop_reason: ${data.stop_reason ?? 'unknown'})`), aiTags);
      return jsonResponse({ error: 'AI returned invalid JSON' }, 502);
    }

    if (BLOODWORK_TASKS.has(task.task)) return jsonResponse(cleanBloodworkAnswer(result));
    return jsonResponse(URGENT_TASKS.has(task.task) ? stripUrgent(result) : result);
  } catch (err) {
    return serverError(err, { function: 'ask-vet-assistant' }, corsHeaders);
  }
});
