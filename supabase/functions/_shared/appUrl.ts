// Shared "validate the configured app URL" helper.
//
// Used everywhere an Edge Function needs to build a link back into the
// app (invite-co-owner, invite-sitter, sign-up) — factored out so a fix
// to this normalization only needs to happen once instead of once per
// caller.

// Returns the app's own (owned) domain, trailing slash(es) stripped so
// `${appUrl}/some-path` never produces a double slash the frontend's
// exact-match route wouldn't resolve. Returns null if APP_URL is set to
// something that isn't a valid absolute URL (e.g. missing scheme), so
// the caller can fail with a clear server-misconfiguration error instead
// of an opaque downstream failure.
export function getValidatedAppUrl(): string | null {
  const rawAppUrl = Deno.env.get('APP_URL') ?? 'https://www.wyskerwatch.com';
  const appUrl = rawAppUrl.replace(/\/+$/, '');
  try {
    new URL(appUrl);
  } catch {
    console.error('APP_URL is not a valid absolute URL:', rawAppUrl);
    return null;
  }
  return appUrl;
}
