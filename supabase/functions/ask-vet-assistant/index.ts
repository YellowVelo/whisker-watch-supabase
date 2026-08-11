// Supabase Edge Function: ask-vet-assistant
//
// Server-side proxy to the Anthropic API, replacing Base44's
// base44.integrations.Core.InvokeLLM. The ANTHROPIC_API_KEY is read
// from Supabase secrets (set via the dashboard or `supabase secrets
// set`) — it never reaches the browser.
//
// Request body shape (mirrors how InvokeLLM was called in the app):
//   {
//     prompt: string,                  // required
//     response_json_schema?: object,    // optional — if provided, asks
//                                        // Claude to respond with JSON
//                                        // matching this shape
//     file_url?: string                 // optional — a public file URL
//                                        // (image or PDF — vaccine/
//                                        // bloodwork scan) to include
//                                        // as vision/document input
//   }
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

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { reportError } from '../_shared/errorReporting.ts';

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

    const { prompt, response_json_schema, file_url } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the message content. If a file_url was provided, fetch it
    // and include it as a vision (image) or document (PDF) input,
    // depending on its content type — used for vaccine/bloodwork
    // document scanning. Otherwise it's a plain text request.
    const contentBlocks = [];
    if (file_url) {
      const imgResp = await fetch(file_url);
      if (!imgResp.ok) {
        return new Response(JSON.stringify({ error: 'Could not fetch file_url' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
      const buffer = await imgResp.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((acc, byte) => acc + String.fromCharCode(byte), ''));

      if (contentType === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        });
      } else {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: contentType, data: base64 },
        });
      }
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
    console.error('Edge Function error:', err);
    reportError(err, { function: 'ask-vet-assistant' });
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
