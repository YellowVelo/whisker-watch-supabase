// Shared guardrails for every "Ask Wysker" AI surface (spec 0041).
// Single source of truth instead of three near-duplicate copies previously
// living separately in PetAIChat.jsx, PetAIInsights.jsx, and
// GeneralAskWyskerChat.jsx.
//
// EMERGENCY_KEYWORD_PATTERNS is deliberately sourced from
// termsOfServiceContent.js's own "Emergency situations" bullet list
// (difficulty breathing, collapse, seizures, suspected poisoning,
// uncontrolled bleeding, inability to urinate, severe trauma) so the
// product's actual behavior can't drift from what it already legally
// promises users in writing.
//
// This is a hard stop, per product decision (2026-08-02): a keyword match
// or an AI-flagged "urgent" response ends that turn with a fixed redirect
// to a real veterinarian — no bypass, no "continue anyway." Call your vet,
// don't ask Wysker Watch.

export const EMERGENCY_KEYWORD_PATTERNS = [
  {
    category: 'Difficulty breathing',
    patterns: [
      /\bcan'?t breathe\b/i,
      /\bcannot breathe\b/i,
      /\bdifficulty breathing\b/i,
      /\btrouble breathing\b/i,
      /\bstruggling to breathe\b/i,
      /\bnot breathing\b/i,
      /\bgasping\b/i,
      /\bchoking\b/i,
      /\bturning blue\b/i,
    ],
  },
  {
    category: 'Collapse',
    patterns: [
      /\bcollapsed\b/i,
      /\bpassed out\b/i,
      /\bunconscious\b/i,
      /\bwon'?t wake up\b/i,
      /\bnon-?responsive\b/i,
      /\bunresponsive\b/i,
    ],
  },
  {
    category: 'Seizure',
    patterns: [
      /\bseizure\b/i,
      /\bseizing\b/i,
      /\bconvulsion\b/i,
      /\bconvulsing\b/i,
    ],
  },
  {
    category: 'Suspected poisoning',
    patterns: [
      /\bpoison(ed|ing)?\b/i,
      /\btoxic\b/i,
      /\btoxin\b/i,
      /\bantifreeze\b/i,
      /\bswallowed (something|a)\b/i,
      /\bate (rat poison|a battery|chocolate)\b/i,
      /\bingested\b/i,
      /\boverdose[ds]?\b/i,
    ],
  },
  {
    category: 'Uncontrolled bleeding',
    patterns: [
      /\buncontrolled bleeding\b/i,
      /\bwon'?t stop bleeding\b/i,
      /\bbleeding (a lot|heavily|profusely|badly)\b/i,
      /\bhemorrhag(e|ing)\b/i,
    ],
  },
  {
    category: 'Inability to urinate',
    patterns: [
      /\bcan'?t (pee|urinate)\b/i,
      /\bunable to urinate\b/i,
      /\bnot urinating\b/i,
      /\bstraining to (pee|urinate)\b/i,
      /\bblocked bladder\b/i,
    ],
  },
  {
    category: 'Severe trauma',
    patterns: [
      /\bhit by a car\b/i,
      /\bhit by a vehicle\b/i,
      /\bsevere trauma\b/i,
      /\bbroken bone\b/i,
      /\bopen wound\b/i,
      /\bfell from\b/i,
      /\bdeep wound\b/i,
      /\bimpaled\b/i,
    ],
  },
];

// Returns the matched category name, or null if nothing matches. Pure
// function, unit-testable directly — same precedent as petScreenContext.js.
export function detectEmergencyKeywords(text) {
  if (!text) return null;
  for (const { category, patterns } of EMERGENCY_KEYWORD_PATTERNS) {
    if (patterns.some((re) => re.test(text))) return category;
  }
  return null;
}

export const AI_DISCLAIMER_SENTENCE = 'Always recommend consulting a licensed veterinarian for diagnosis, prescriptions, or emergencies. Keep responses concise, calm, and friendly — never diagnose, prescribe, or state a condition as certain.';

// Appended to every AI-facing prompt that requests a structured
// { ..., urgent: boolean } response. Backstop for wording
// EMERGENCY_KEYWORD_PATTERNS doesn't catch — the client fully discards the
// AI's own answer and shows the same hard-stop redirect if this is true
// (Product Principles #12/#14: AI must never diagnose or create
// unnecessary urgency, and must respect emotional context).
export const URGENT_FLAG_INSTRUCTION = 'Additionally include a boolean "urgent" field. Set "urgent": true only if this describes a real, time-sensitive veterinary emergency (e.g. suspected poisoning, difficulty breathing, collapse, seizure, uncontrolled bleeding, inability to urinate, or severe trauma) — not for routine or mild concerns. Never create unnecessary alarm.';

// Fixed, non-AI-generated redirect shown for both the keyword hard-stop and
// the AI-flagged urgent backstop. No bypass action is ever attached to this
// message, by design.
export function emergencyRedirectText(petName) {
  const subject = petName ? `for ${petName}` : 'for your pet';
  return `This sounds like it may be a medical emergency ${subject}. Please contact your veterinarian or the nearest emergency animal hospital right away — don't wait for a reply here. Ask Wysker can't help with emergencies.`;
}

export const AI_DISCLAIMER_BANNER_TEXT = "Ask Wysker gives general information only, not veterinary advice. In an emergency, contact your vet or the nearest emergency animal hospital immediately.";
