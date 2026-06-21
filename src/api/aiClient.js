import { supabase } from './supabaseClient';

/**
 * Drop-in replacement for base44.integrations.Core.InvokeLLM.
 *
 * Calls the ask-vet-assistant Supabase Edge Function, which proxies
 * to the Anthropic API server-side (API key never reaches the
 * browser). Requires the user to be logged in — the Edge Function
 * checks the Supabase auth session.
 *
 * @param {Object} params
 * @param {string} params.prompt - the prompt text
 * @param {Object} [params.response_json_schema] - if provided, asks
 *   for structured JSON back matching this schema (same shape Base44
 *   used)
 * @param {string[]} [params.file_urls] - optional array of file URLs;
 *   only the first is used (matches how the app called this with a
 *   single uploaded scan)
 * @returns {Promise<Object|string>} - parsed JSON object if a schema
 *   was requested, otherwise the plain text response
 */
export async function invokeAI({ prompt, response_json_schema, file_urls }) {
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
      file_url: file_urls?.[0],
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(errBody.error || 'AI request failed');
  }

  const data = await resp.json();
  // If a schema was requested, the function returns the parsed object
  // directly. Otherwise it returns { text }.
  return response_json_schema ? data : data.text;
}
