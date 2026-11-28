// Password rules shared by every function that sets a password for a new
// account (spec 0021's sign-up rules, moved here by spec 0086 so
// finish-account-setup uses the same ones).

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const PASSWORD_LENGTH_ERROR =
  `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`;
export const PASSWORD_BREACHED_ERROR =
  'This password has appeared in a data breach. Please choose a different password.';

// Returns the length error text if `password` isn't a string of 8-128
// characters, otherwise null. Rejects the request's own shape only, so
// it's never an account-enumeration concern.
export function passwordLengthError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return PASSWORD_LENGTH_ERROR;
  }
  return null;
}

// Best-effort check against the Have I Been Pwned "Pwned Passwords"
// range API (k-anonymity: only a 5-character SHA-1 prefix is sent, never
// the password or its full hash) — a partial substitute for the
// leaked-password protection Supabase's own dashboard may otherwise
// enforce on the public signup surface, which the admin API bypasses.
// Fails OPEN (treats a network/API error as "not known to be pwned")
// rather than blocking signup entirely if a third-party service hiccups —
// a leaked-password check that occasionally misses is a much smaller risk
// than signup going down whenever HIBP is slow or unreachable.
export async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    const hashHex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((line) => line.split(':')[0]?.trim() === suffix);
  } catch (err) {
    console.error('isPasswordPwned check failed (failing open):', (err as Error).message);
    return false;
  }
}
