# 0064_Fuzzy_Vaccine_Name_Matching_Specification_v1

**Status:** Implemented
**Date:** 2026-08-30
**Related files:** `src/components/VaccinationSection.jsx`, `src/lib/speciesConfig.js`, `src/components/ScanReviewSheet.jsx`, `e2e/vaccination-scan-review.spec.js`, `docs/features/0061_Invoice_Scan_MultiPet_Vaccination_Review_Specification_v1.md`

---

## Before You Approve This

- **This is a real, confirmed bug, found by scanning your actual invoice** (not a hypothetical) — see Repo Findings & Risks for exactly how it was reproduced.
- This spec fixes the *matching logic only*. It doesn't touch the multi-pet attribution logic, the review screen's layout, or anything else from spec 0061 — everything else about Scan Record stays as-is.
- No conflicts found with CLAUDE.md or the Design System doc — this is a small, contained logic change with one new visual state already covered by the existing review screen (the "Will update" vs "New" badge already exists; this just makes it accurate more often).

## Functional Requirements

1. When the AI reads a vaccine name off a scanned document, and that name is a recognizable version of one of this pet's *existing* vaccine records — even if worded differently (extra words like "Canine -", added detail like "(Oral)" or "(H3N2)", different capitalization) — the review screen must recognize it as the *same* vaccine and offer to update the existing record, not create a duplicate.
2. This recognition should only kick in for vaccines the app already knows about by name (the same short list already used elsewhere in the app for the Add/Edit form's suggestion chips — e.g. for dogs: Rabies, DHPP, Bordetella, Leptospirosis, Lyme, Canine Influenza, Rattlesnake). For anything outside that known list, the app should keep doing exactly what it does today — only recognize it as the same vaccine if the wording is an exact match — rather than guessing at unfamiliar names.
3. This applies identically whether the vaccine belongs to the pet whose page the scan was launched from, or another pet the invoice also covered (per spec 0061's multi-pet handling) — the matching rule doesn't change based on which pet it's for.

## Acceptance Criteria

- Given a dog's existing record named "Rabies Vaccine," when a scanned document contains "Canine - Rabies Vaccine," then the review screen shows it as **"Will update"** for that existing record, not "New."
- Given a dog's existing record named "Bordetella Vaccine," when a scanned document contains "Canine - Bordetella Vaccine (Oral)," then the review screen shows it as **"Will update,"** and confirming updates the existing record rather than creating a second one.
- Given a dog's existing record named "Canine Distemper DA2PP/DHPP Vaccine," when a scanned document contains "Canine - Distemper DHPP Vaccine," then the review screen shows it as **"Will update."**
- Given an existing record for a vaccine *not* on the app's known list (e.g. a regional or uncommon vaccine, or a custom name an owner typed in manually), when a scanned document contains a differently-worded version of that same vaccine, then the review screen shows it as **"New"** — same as today — rather than guessing at a match for something the app doesn't have a reference name for.
- Given two of a pet's existing records for two clearly different known vaccines (e.g. "Rabies Vaccine" and "Bordetella Vaccine"), when a scanned document contains a line for one of them, then it only ever offers to update the correct one — never the other.

## Test Plan

- "Canine - Rabies Vaccine" recognized as an update to "Rabies Vaccine" → `[Playwright: e2e/vaccination-scan-review.spec.js]` — extend the existing "a matching existing record is updated, not duplicated" test (or add a sibling test) with a differently-worded scanned name instead of a same-cased/same-worded one, same mocked-AI-response pattern already used throughout that file.
- "Canine - Bordetella Vaccine (Oral)" recognized as an update → same file, same pattern, second case covering the "extra parenthetical detail" scenario specifically, since that's a distinct shape from just a prefix.
- An unrecognized/uncommon vaccine name is *not* fuzzy-matched → `[Playwright: e2e/vaccination-scan-review.spec.js]` — mock a scanned name for something not on the known list, worded differently from an existing record of the same (fictional) name, and confirm it still shows "New," proving the fallback-to-exact-match behavior actually holds and this isn't silently matching everything.
- The underlying matching decision itself (given two raw name strings and a species, do they count as the same vaccine) → `[Vitest unit test]` — this is a pure function with no UI/DOM involved, so it gets direct unit tests covering each canonical vaccine, case differences, extra wording, and the "not on the list" fallback, in addition to the end-to-end Playwright coverage above. Fast and precise for something with several small branching cases.
- **Seeding/access constraints:** None — every case above is reachable through a normal signed-in test session (`test1@`), same as the rest of `vaccination-scan-review.spec.js` already is.

## Visual Reference

No new UI — the "Will update"/"New" badge already exists on the review screen (spec 0061). This spec only changes which of the two labels gets shown in more cases; it introduces no new visual state.

## Technical Spec

- **Schema:** None.
- **Components/files touched:**
  - `src/lib/speciesConfig.js` — add a new exported function, `vaccineNamesMatch(nameA, nameB, species)`, alongside the existing `DOG_VACCINES`/`CAT_VACCINES`/`getVaccines` it already defines (natural home for it, since it's built directly on those same lists). For each of the two names, it checks whether the pet's species-appropriate canonical list contains a vaccine whose "core" wording (e.g. "DHPP" and "Distemper" both count for the list entry `"DHPP (Distemper combo)"`) appears anywhere inside that name, case-insensitive. If **both** names resolve to the *same* canonical vaccine, they're treated as a match. If either name doesn't clearly resolve to anything on the known list, the function falls back to today's exact (case-insensitive, trimmed) comparison — this is the "don't guess at unfamiliar names" rule from Functional Requirement 2, and it's also what keeps this safe from false-positives: matching is only ever "loose" for the small, known, real set of vaccine names already used elsewhere in the app, never for arbitrary text.
  - `src/components/VaccinationSection.jsx` — `handleScan`'s existing-record lookup (currently a plain `ev.vaccine_name?.toLowerCase().trim() === v.vaccine_name.toLowerCase().trim()` check) is replaced with a call to `vaccineNamesMatch(ev.vaccine_name, v.vaccine_name, petSpecies)`, where `petSpecies` comes from the same pet-lookup (`allPets.find(...)`) already used to resolve each item's pet name and id — no new data fetch needed, the species value is already present on every row `entities.Pet.list()` returns.
- **API / edge functions:** None — this is purely a client-side comparison change; the AI prompt/schema from spec 0061 is untouched.
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including its Amendments. No conflicts — no new UI, no new component, nothing to check beyond what spec 0061 already covered for the existing badge.
- **Constraints from CLAUDE.md / locked decisions:** None conflict.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found — `speciesConfig.js`'s vaccine lists already exist for the Add/Edit form's suggestion chips; this reuses them rather than inventing a second list.
- **Technical debt nearby:** None new. This replaces one exact-match line with a slightly smarter comparison; it doesn't touch anything else in the surrounding scan/save flow.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** None on record before this investigation. **How this was actually found and confirmed real:** a throwaway test pet was seeded with the exact same 6 overdue vaccinations Harper has, and Lynn's actual real invoice PDF was scanned against it through the real, live Anthropic API (not a simulated/mocked response) — Claude's real answer used wording like "Canine - Rabies Vaccine" and "Canine - Bordetella Vaccine (Oral)" that never exactly matched the plainer stored names, causing all 6 items to show as "New." This is a live, reproducible bug, not a theoretical edge case.
- **A real limitation worth knowing about, not a blocker:** the fuzzy match is intentionally limited to the app's existing known-vaccine list. If Claude phrases an *uncommon* vaccine differently than how it's stored, this fix won't catch that case — it'll still show "New," the same as today. Widening this to catch unfamiliar wording too would mean guessing without a known reference point, which risks accidentally merging two genuinely different vaccines under similar-sounding names — a worse failure mode than an occasional extra "New" the owner can manually clean up. This tradeoff is deliberate, not an oversight.

## Non-Goals

- Not changing anything about which pet a scanned line gets attributed to (spec 0061's multi-pet logic) — this spec only changes the vaccine-*name* comparison, not the pet-*name* comparison used for multi-pet attribution (that stays an exact match, which is a separate, deliberately stricter decision from spec 0061 not being revisited here).
- Not expanding the canonical vaccine lists themselves (`DOG_VACCINES`/`CAT_VACCINES`) — if there are vaccines missing from those lists worth adding, that's a separate, small decision independent of this fix.
- Not adding fuzzy matching anywhere else in the app (e.g. medication names, food brands) — scoped entirely to this one vaccine-scanning comparison.

## Open Questions

None — Lynn's two decisions (anchor to the canonical list, fall back to exact match for anything unrecognized) resolve the design question this spec depends on.
