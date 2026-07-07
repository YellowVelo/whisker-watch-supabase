// Small, dependency-free helpers shared by renderTemplate.ts and
// sendEmail.ts. Deno Edge Functions can't easily pull in npm packages
// like `he` or `validator` for something this small, so these are
// hand-rolled and intentionally minimal.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Wysker Watch's own domains — CTA links in transactional email must
// only ever point back into the product, never to an arbitrary
// caller-supplied host. Override/extend via the EMAIL_LINK_ALLOWED_HOSTS
// secret (comma-separated) if a workflow legitimately needs another
// first-party host (e.g. a separate marketing/docs domain).
const DEFAULT_ALLOWED_URL_HOSTS = ['wyskerwatch.app', 'wyskerwatch.com'];

// Validates a URL variable (accept_url, verify_url, reset_url, app_url)
// before it's inserted into an href. Rejects non-http(s) schemes
// (blocks `javascript:`/`data:` injection) and hosts outside the
// allowlist (blocks using our own branded emails as an open-redirect /
// phishing vector toward third-party domains). localhost/127.0.0.1 is
// always allowed (over http) for local development.
export function isSafeEmailUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocalhost) {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  if (url.protocol !== 'https:') return false;

  const configuredHosts = (Deno.env.get('EMAIL_LINK_ALLOWED_HOSTS') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const allowedHosts = configuredHosts.length > 0 ? configuredHosts : DEFAULT_ALLOWED_URL_HOSTS;

  return allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Replaces {{key}} tokens with vars[key]. Unknown tokens are left as-is
// rather than silently dropped, so a typo'd variable name is obvious in
// a rendered preview instead of vanishing.
export function replaceVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
