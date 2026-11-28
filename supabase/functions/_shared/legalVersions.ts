// The "Last updated" dates of the live Terms of Service and Privacy
// Policy, recorded as the versions a person agreed to (spec 0047, moved
// here by spec 0086). The server's own copy, never something the browser
// sends, so a modified client can't claim it agreed to a different
// version than what's live.
//
// Edge Functions can't import the app's files, so these must equal
// TOS_LAST_UPDATED (src/lib/termsOfServiceContent.js) and
// PRIVACY_POLICY_LAST_UPDATED (src/lib/privacyPolicyContent.js).
// src/lib/legalVersionsParity.test.js fails the moment they differ; fix
// by updating both copies, never the test.

export const TOS_VERSION = 'July 10, 2026';
export const PRIVACY_VERSION = 'November 21, 2026';
