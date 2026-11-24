// Supabase Edge Function: ask-vet-assistant
//
// Server-side proxy to the Anthropic API. The ANTHROPIC_API_KEY is read
// from Supabase secrets (set via the dashboard or `supabase secrets
// set`) — it never reaches the browser.
//
// Request body shape:
//   {
//     prompt: string,                  // required
//     response_json_schema?: object,    // optional — if provided, asks
//                                        // Claude to respond with JSON
//                                        // matching this shape
//     file_path?: string                // optional — a file in this
//                                        // project's "uploads" bucket
//                                        // (image or PDF — vaccine/
//                                        // bloodwork/medication scan)
//                                        // to include as vision/document
//                                        // input
//   }
//
// Files (spec 0071): the function never fetches a caller-supplied URL.
// It only reads a file_path that is either in the caller's own folder
// (a scan they just uploaded) or linked in pet_documents to a pet they
// own, and downloads it with the caller's own access, so the storage rules
// (migration 0054) also have to allow it (spec 0082). Only paths in the
// shape the app's uploader creates are accepted. Size and type are checked
// before anything is sent to Anthropic.
//
// TEMPORARY (spec 0071 Phase 1 only — delete in Phase 2): a `file_url`
// is still accepted if it is this project's own public uploads link,
// because the currently-live frontend sends that until its new build is
// promoted. It is converted to a path and goes through the same checks.
//
// Response shape:
//   - if response_json_schema was provided: the parsed JSON object
//   - otherwise: { text: string }
//
// This function requires the caller to be an authenticated Supabase
// user (checked via the Authorization header) so it can't be used as
// an open, unauthenticated LLM proxy by anyone who finds the URL.
//
// Rate limiting (spec 0050): each authenticated user is capped at
// RATE_LIMIT calls per RATE_WINDOW_SECONDS, checked via the same
// check_and_record_rate_limit RPC (migration 0039) the sign-up Edge
// Function already uses for its own limits — reused here rather than
// building a second mechanism. This requires a service-role client
// (the RPC is service_role-only by design), used only for the rate
// check; the existing anon-key client below still does the actual
// caller-identity check.

import { createClient } from 'jsr:@supabase/supabase-js@2.119.2';
import { encodeBase64 } from 'jsr:@std/encoding@1.0.11/base64';
import { serverError } from '../_shared/errorReporting.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// See this file's header comment and docs/features/0050_AskVetAssistant_RateLimiting_Specification_v1.md.
// Sized to comfortably cover a real chat session, an insights generation,
// and scanning a few pets' documents back-to-back, while still stopping a
// runaway script quickly. Easy to adjust here without touching logic.
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 10 * 60;

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// The only path shape the app's uploader creates: <folder>/<name>.<ext>.
const UPLOAD_PATH_SHAPE = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$/;

// Returns the storage path the caller asked for, or null if they sent an
// unusable reference. Never returns anything outside the uploads bucket.
function requestedPath(body: { file_path?: unknown; file_url?: unknown }): string | null {
  let path: string | null = null;
  if (typeof body.file_path === 'string') {
    path = body.file_path;
  } else if (typeof body.file_url === 'string') {
    // TEMPORARY compatibility, Phase 1 only (see header).
    const prefix = `${SUPABASE_URL}/storage/v1/object/public/uploads/`;
    if (!body.file_url.startsWith(prefix)) return null;
    path = decodeURIComponent(body.file_url.slice(prefix.length));
  }
  // Spec 0082: allow-list the exact shape the uploader creates
  // (<folder>/<name>.<ext>). Rejects %, backslashes, . and .. segments,
  // extra folders and leading/trailing slashes.
  if (!path || !UPLOAD_PATH_SHAPE.test(path)) return null;
  return path;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller is an authenticated Supabase user.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit check — before any real work, so a rejected request never
    // reaches Anthropic's API and never costs anything. Keyed per-user
    // (not per-IP): every caller here already has a real Supabase session,
    // unlike sign-up's unauthenticated surface, so per-user keying alone is
    // the right control.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: rateAllowed, error: rateError } = await adminClient.rpc('check_and_record_rate_limit', {
      p_key: `ask-vet-assistant:user:${userData.user.id}`,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      // Fail closed, same posture sign-up/index.ts takes for its own
      // rate-limit RPC failure — don't proceed to a paid API call if the
      // rate limiter itself is unavailable.
      console.error('rate limit check failed:', rateError.message);
      return new Response(JSON.stringify({ error: 'Unable to process this request right now' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rateAllowed === false) {
      return new Response(
        JSON.stringify({ error: "You've reached the limit for AI requests. Please wait a few minutes and try again." }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const { prompt, response_json_schema } = body;
    if (!prompt) {
      return jsonResponse({ error: 'prompt is required' }, 400);
    }

    // Build the message content. If a file was provided, read it from our
    // own storage (never a caller-supplied URL) and include it as a vision
    // (image) or document (PDF) input — used for vaccine/bloodwork/
    // medication scanning. Otherwise it's a plain text request.
    const contentBlocks = [];
    if (body.file_path !== undefined || body.file_url !== undefined) {
      const path = requestedPath(body);
      if (!path) {
        return jsonResponse({ error: 'Invalid file reference', code: 'invalid_file' }, 400);
      }

      // Allowed: the caller's own folder (a scan they just uploaded), or a
      // document linked to a pet they own. The pet_documents lookup runs
      // as the caller, so its RLS (owners/co-owners only) does the check.
      const ownFolder = path.split('/')[0] === userData.user.id;
      let allowed = ownFolder;
      if (!allowed) {
        const { data: linked } = await supabaseClient
          .from('pet_documents')
          .select('id')
          .eq('storage_path', path)
          .limit(1);
        allowed = (linked?.length ?? 0) > 0;
      }
      if (!allowed) {
        return jsonResponse({ error: 'You do not have access to that file', code: 'forbidden_file' }, 403);
      }

      const { data: blob, error: downloadError } = await supabaseClient.storage.from('uploads').download(path);
      if (downloadError || !blob) {
        return jsonResponse({ error: 'Could not read that file', code: 'file_not_found' }, 404);
      }
      const contentType = blob.type;
      const isPdf = contentType === PDF_TYPE;
      if (!isPdf && !IMAGE_TYPES.has(contentType)) {
        return jsonResponse({ error: 'Unsupported file type', code: 'unsupported_type' }, 415);
      }
      if (blob.size > MAX_FILE_BYTES || (!isPdf && blob.size > MAX_IMAGE_BYTES)) {
        return jsonResponse(
          { error: 'File is too large', code: isPdf ? 'file_too_large' : 'image_too_large' },
          413,
        );
      }

      const base64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
      contentBlocks.push(
        isPdf
          ? { type: 'document', source: { type: 'base64', media_type: PDF_TYPE, data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } },
      );
    }

    let finalPrompt = prompt;
    if (response_json_schema) {
      finalPrompt += `\n\nRespond with ONLY valid JSON matching this schema, no other text, no markdown code fences:\n${JSON.stringify(response_json_schema)}`;
    }
    contentBlocks.push({ type: 'text', text: finalPrompt });

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error('Anthropic API error:', errText);
      return new Response(JSON.stringify({ error: 'AI request failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await anthropicResp.json();
    const textOut = data.content?.find((b) => b.type === 'text')?.text || '';

    if (response_json_schema) {
      // Strip markdown code fences if Claude added them despite instructions.
      const cleaned = textOut.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.error('Failed to parse JSON response:', cleaned);
        return new Response(JSON.stringify({ error: 'AI returned invalid JSON' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ text: textOut }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return serverError(err, { function: 'ask-vet-assistant' }, corsHeaders);
  }
});
