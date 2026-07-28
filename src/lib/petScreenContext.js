const SCREEN_PATTERNS = [
  [/\/trends(?:$|\?)/, 'Trends'],
  [/\/timeline(?:$|\?)/, 'Timeline'],
  [/\/symptoms(?:$|\?)/, 'Weight'],
  [/\/food(?:$|\?)/, 'Food'],
  [/\/export(?:$|\?)/, 'Vet Export'],
  [/\/profile/, 'Profile'],
];

// Derives { petId, screen } from the current URL rather than useParams() —
// AppHeader renders as a shell sibling of the routed content, not a
// descendant of whichever pet-specific route is matched, so useParams()
// wouldn't see :petId from there (spec 0023 step 5/10). No global "current
// pet" state is introduced by this — it's re-derived from the URL on every
// open, same as every pet-scoped page already does for its own fetching.
//
// Kept dependency-free (no React/DOM imports) so it can be unit tested
// directly — AskWyskerAction.jsx pulls in the AI sheet's component tree,
// which touches `window` at import time and can't load under vitest's
// Node-only test environment.
export function getPetContext(pathname) {
  const petMatch = pathname.match(/^\/pet\/([^/]+)/);
  const petId = petMatch ? petMatch[1] : null;
  if (!petId) return { petId: null, screen: null };
  const found = SCREEN_PATTERNS.find(([re]) => re.test(pathname));
  return { petId, screen: found ? found[1] : 'Overview' };
}
