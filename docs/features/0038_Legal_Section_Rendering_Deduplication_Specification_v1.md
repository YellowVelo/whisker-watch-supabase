# 0038_Legal_Section_Rendering_Deduplication_Specification_v1

**Status:** Draft
**Date:** 2026-08-02
**Related files:** `src/pages/TermsOfServiceSection.jsx`, `src/pages/PrivacyPolicySection.jsx`, `src/lib/termsOfServiceContent.js`, `src/lib/privacyPolicyContent.js`

## Before You Approve This

- **This is a pure refactor — no visible or behavioral change.** The Terms of Service and Privacy Policy detail screens will look and act exactly as they do today. This spec only moves code that's currently copy-pasted into one shared place, so a future change to link handling (or the "section not found" lookup) only has to be written once.
- **Scope matches what was flagged on the punch list**, plus one closely related duplication found during investigation (see below) that the user asked to include: the `getXSection(sectionId)` lookup function inside each content file, which has the exact same shape in both files.
- No conflicts with CLAUDE.md, the Design System doc, or any other in-flight spec were found.

## Functional Requirements

1. The Terms of Service detail screen and the Privacy Policy detail screen must continue to work exactly as they do today: showing a section's title, its "Last updated" date (except on the "Last updated" section itself), and its body content (paragraphs, subheadings, bullet lists, and links — including that external links open in a new tab and `mailto:` links don't).
2. The code that decides *how* to draw a link, *how* to draw a body block, and *how* to look up a section by its id must exist in exactly one place each, shared by both the Terms screen and the Privacy screen, instead of being written out twice.
3. Nothing about this change should require touching both files again the next time one of these shared behaviors needs to change (e.g. adding a new body-block type, or changing how external links open).

## Acceptance Criteria

- Given a user opens any Terms of Service section, then it renders identically to how it renders today (same text, same "Last updated" line placement, same link behavior).
- Given a user opens any Privacy Policy section, then it renders identically to how it renders today.
- Given a user taps an external (`http`) link in either screen, then it opens in a new tab.
- Given a user taps a `mailto:` link in either screen, then it opens in the current tab (default browser/mail-client behavior, not forced to a new tab).
- Given a user navigates to a section id that doesn't exist in either document, then the screen shows the existing "Section not found." message, unchanged.
- Given the app is built, then only one copy of the link-rendering component, one copy of the body-block-rendering component, and one copy of the section-lookup function exist in the codebase — not two of each.

## Test Plan

- Terms section renders correctly → Playwright test: navigate to a known Terms section (e.g. "About the service"), assert the title, "Last updated" line, and known body text render.
- Privacy section renders correctly → Playwright test: navigate to a known Privacy section (e.g. "Information we collect"), assert the title, "Last updated" line, and known body text render.
- External link opens in a new tab → not newly covered by an automated test. This behavior (`target="_blank"`) already exists today and is unchanged by this refactor; asserting new-tab behavior reliably in Playwright requires extra popup-handling setup disproportionate to a pure refactor with no behavior change. Flagged as a pre-existing test gap, not introduced by this spec.
- `mailto:` link does not force a new tab → same reasoning as above; not newly covered.
- "Section not found" message still shows for a bad id → Playwright test: navigate directly to `/terms/not-a-real-section` (or the Privacy equivalent), assert "Section not found." renders.
- **Seeding/access constraints:** none — every scenario above is static legal copy reachable by any signed-in (or, if the routes are public, any) session with no database writes involved.

## Visual Reference

No mockups provided and none needed — this spec introduces no visual change. Both screens must look pixel-identical to their current shipped state before and after this refactor.

## Technical Spec

- **Schema:** None. No database involved.
- **Components/files touched:**
  - `src/components/legalContentBlocks.jsx` (new) — houses the shared `BodyLink` and `BodyBlock` components, extracted verbatim (same Tailwind classes, same block-type handling) from the two page files. Exports both.
  - `src/lib/legalContent.js` (new) — houses one shared lookup helper, e.g. `getLegalSection(sections, lastUpdatedSection, sectionId)`, that both content files call instead of each defining their own copy of the same three-line logic (check for the "last updated" id, else search the sections array, else return `null`).
  - `src/lib/termsOfServiceContent.js` — `getTermsOfServiceSection` becomes a thin wrapper calling the shared `getLegalSection(TOS_SECTIONS, TOS_LAST_UPDATED_SECTION, sectionId)`. `TOS_SECTIONS`, `TOS_LAST_UPDATED`, `TOS_LAST_UPDATED_SECTION`, and all legal copy stay exactly as-is — no content changes.
  - `src/lib/privacyPolicyContent.js` — same wrapper treatment for `getPrivacyPolicySection`, calling `getLegalSection(PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_LAST_UPDATED_SECTION, sectionId)`. No content changes.
  - `src/pages/TermsOfServiceSection.jsx` — removes its local `BodyLink`/`BodyBlock` definitions, imports both from `src/components/legalContentBlocks.jsx` instead. Page shell (header, back button, "Last updated" line, `PageTransition`) is untouched.
  - `src/pages/PrivacyPolicySection.jsx` — same treatment, importing from the same shared file.
- **API / edge functions:** None.
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including the 2026-07-30 Amendments. No conflicts — this is a code-organization-only change; no classNames, spacing, type sizes, colors, or components are altered. The existing `text-[13px]` "Last updated" line and `text-base`/`text-tier-secondary` body styling are carried over unchanged.
- **Constraints from CLAUDE.md / locked decisions:** Respected. No scoring/check-in logic is touched. No data access changes — these are static content files, no `entities.js` calls involved either way.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** Confirmed — this is the exact issue this spec fixes. Beyond what the punch list already named (`BodyLink`, `BodyBlock`), the two content files (`termsOfServiceContent.js`, `privacyPolicyContent.js`) also each define an identically-shaped section-lookup function; this spec unifies that too, per your decision.
- **Technical debt nearby:** None found beyond the duplication above.
- **Orphaned features nearby:** None found — both screens, both content files, and their list-screen counterparts (`Terms.jsx`, `Privacy.jsx`) are all actively referenced and routed to.
- **Punch list / known issues in this area:** The item this spec directly addresses is on `docs/launch-punch-list.md` (line 83). A separate, unrelated item a few lines below it (line 123, "Terms of Service acceptance at signup") is **not** in scope here — that's about adding a consent checkbox at registration, not about this rendering duplication, and should stay a separate future spec if the user wants to pursue it.

## Non-Goals

- No changes to the legal text/content itself.
- No changes to how the Terms/Privacy *list* screens (`Terms.jsx`, `Privacy.jsx`) work.
- No new body-block types or link behaviors — this only relocates existing logic.
- Does not address the separate punch-list item about Terms of Service acceptance at signup (no checkbox/consent gate).

## Open Questions

None — repo investigation and the two clarifying questions above resolved the scope.
