// User Profile & Timezone Settings V1 — pure timezone helpers.
//
// Kept dependency-free (no Supabase/React imports) so the auto-populate
// decision and validation logic are unit-testable without mocking auth
// or the network, and so AuthContext / Account.jsx share one source of
// truth for "should we touch this profile's timezone."

// Fallback list for engines without Intl.supportedValuesOf (older
// Safari) — not exhaustive, just enough to pick a reasonable zone per
// region without requesting location permission.
export const FALLBACK_TIMEZONES = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
  'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Athens', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai',
  'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

export function isValidIanaTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Reads the device/browser-configured timezone. Never touches
// geolocation, IP lookup, or any location permission — Intl reads the
// OS/browser timezone setting directly.
export function detectTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidIanaTimezone(timezone) ? timezone : null;
  } catch {
    return null;
  }
}

export function listAvailableTimezones() {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      // fall through to static list
    }
  }
  return FALLBACK_TIMEZONES;
}

// Once a timezone has been stored (auto or manual), auto-detection must
// never overwrite it — only an explicit manual change in Profile
// Settings may change a populated timezone. This is the single rule
// both the auth-load path and any future callers must follow.
export function shouldAutoPopulateTimezone(profile) {
  return !profile?.timezone && !profile?.timezone_is_manual;
}

// Whether a Profile Settings save represents a real manual-override
// transition worth recording as `timezone_manual_changed`. Fires both
// when the owner picks a different zone AND when they re-select the
// zone that was already stored but flip it from auto-detected to
// manually-owned — the latter is still a meaningful state change
// (auto-detection will never touch this profile's timezone again)
// even though the string value itself didn't change.
export function isManualTimezoneChange({ timezoneIsManual, timezone, previousTimezone, previousTimezoneIsManual }) {
  if (!timezoneIsManual) return false;
  const valueChanged = timezone !== (previousTimezone || '');
  const justBecameManual = !previousTimezoneIsManual;
  return valueChanged || justBecameManual;
}
