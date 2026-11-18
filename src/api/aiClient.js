import { supabase } from './supabaseClient';

/**
 * Calls the ask-vet-assistant Supabase Edge Function, which proxies to the
 * Anthropic API server-side (the API key never reaches the browser).
 * Requires the user to be logged in — the Edge Function checks the
 * Supabase auth session.
 *
 * @param {Object} params
 * @param {string} params.prompt - the prompt text
 * @param {Object} [params.response_json_schema] - if provided, asks for
 *   structured JSON back matching this schema
 * @param {string} [params.file_path] - optional storage path of an uploaded
 *   scan (image or PDF) in the "uploads" bucket, from uploadFile(). The
 *   Edge Function reads it from storage itself (spec 0071) and refuses
 *   anything the caller isn't allowed to open.
 * @returns {Promise<Object|string>} - parsed JSON object if a schema was
 *   requested, otherwise the plain text response
 * @throws {Error} with `status` (e.g. 413 for an image too large to scan,
 *   429 when rate-limited) and `code` from the function's error body
 */
export async function invokeAI({ prompt, response_json_schema, file_path }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const resp = await fetch(`${supabaseUrl}/functions/v1/ask-vet-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt,
      response_json_schema,
      ...(file_path ? { file_path } : {}),
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(errBody.error || 'AI request failed'), {
      status: resp.status,
      code: errBody.code,
    });
  }

  const data = await resp.json();
  // If a schema was requested, the function returns the parsed object
  // directly. Otherwise it returns { text }.
  return response_json_schema ? data : data.text;
}
