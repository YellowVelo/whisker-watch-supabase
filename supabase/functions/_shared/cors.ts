// Shared CORS helper for public-facing Edge Functions.
//
// Existing authenticated functions (invite-co-owner, invite-sitter, etc.)
// use a wide-open `Access-Control-Allow-Origin: '*'` — acceptable there
// because a valid Supabase session is still required before anything
// privileged happens. A PUBLIC, unauthenticated, account-creating or
// account-mutating endpoint (sign-up, confirm-email) is a different risk
// profile: an open CORS policy on those would let any origin's browser
// script drive them. New functions in that category should use
// `scopedCorsHeaders()` instead of inventing another one-off allowlist.

const DEFAULT_ALLOWED_ORIGINS = ['https://www.wyskerwatch.com', 'http://localhost:5173'];

// Override via CORS_ALLOWED_ORIGINS (comma-separated) if another
// first-party origin (e.g. a preview/staging deploy) needs to call these
// functions.
export function scopedCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const configured = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}
