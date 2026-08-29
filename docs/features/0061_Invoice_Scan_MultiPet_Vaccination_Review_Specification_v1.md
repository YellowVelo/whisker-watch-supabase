# 0061_Invoice_Scan_MultiPet_Vaccination_Review_Specification_v1

**Status:** Draft
**Date:** 2026-08-29
**Related files:** `src/components/VaccinationSection.jsx`, `src/pages/PetVaccinations.jsx`, `src/api/aiClient.js`, `src/api/storageClient.js`, `supabase/functions/ask-vet-assistant/index.ts`, `src/lib/aiGuardrails.js`, `src/api/entities.js`, `src/api/entityClient.js`, `src/components/BottomSheet.jsx`, `src/hooks/useFocusTrap.js`, `docs/features/0050_AskVetAssistant_RateLimiting_Specification_v1.md`, `e2e/ask-wysker-guardrails.spec.js`, `e2e/vaccination-due-reminders.spec.js`

---

## Before You Approve This

- **This feature already exists, in a rougher form, and was never spec'd.** [VaccinationSection.jsx](../../src/components/VaccinationSection.jsx:89) already has a "Scan Record" button today: upload an image or PDF, AI reads it, and it saves what it finds. There's no written record of that feature anywhere in `/docs/features`, so this spec is effectively the first documentation of it, plus the fixes below. This isn't a second, duplicate feature — it's the same button and the same underlying AI plumbing, made safer.
- **Today's version has two real gaps, and this spec closes both:** (1) it saves immediately with no chance to review what the AI read off the page, and (2) it assumes every vaccine on the page belongs to whichever pet's profile you happened to be looking at — a mixed invoice for two pets would get every line wrongly attributed to just one of them.
- **Medications are being left out on purpose, not by oversight.** Wysker Watch's medication records already only ever belong to one pet each, with no shared/household concept, and per your decision below this spec doesn't touch medications at all — a Carprofen line on an invoice is simply never read or acted on by this feature.
- **The one part of this that can't be tested by an automated script is whether the AI reads the document correctly.** Everything about the review screen, the multi-pet grouping, and the save behavior can be tested without a real AI call (this repo already has a working pattern for that — see Test Plan). But "did Claude correctly read the date off this specific invoice" is something only a human can judge by trying it. That's normal for any AI-scanning feature and isn't a gap specific to this spec.
- No conflicts found with CLAUDE.md's locked Vibe/Symptom-Count model (this is a vaccination feature, unrelated to daily check-ins) or with the Design System's locked rules — see Technical Spec.

---

## Functional Requirements

1. On a pet's Vaccinations page, the existing "Scan Record" button still lets the owner upload a photo or PDF of a vet document (for example, an invoice from a vaccination visit).
2. Instead of saving immediately, the AI's read of the document is shown on a **review screen** before anything is written to any pet's records. Nothing is saved until the owner reviews and confirms.
3. If the document mentions more than one pet by name (for example, an invoice listing services for both Harper and Auggie), the review screen groups the detected vaccinations under the correct pet's name — not just the pet whose page the owner happened to be viewing when they tapped Scan Record.
   - A pet is only matched if the document names one of the account's own pets. If a line item doesn't clearly name a pet, or names someone else's pet not on this account, it's grouped under the pet whose page the scan was started from — the same behavior as today.
4. Every detected vaccination on the review screen is editable before saving — same fields as the existing Add/Edit Vaccination form (vaccine name, date given, next due date, administered by, lot number, notes) — in case the AI misread something.
5. Each detected vaccination can be individually excluded from saving (for example, if the AI picked up something that isn't actually a vaccine, or duplicated a line).
6. The review screen shows, for each detected vaccination, whether saving it will **update an existing record** for that pet (matched by vaccine name, same as today) or **add a new one** — so the owner isn't surprised by which one happens.
7. A single confirmation action saves everything left checked, across every pet the document covered, in one step.
8. Anything on the document that isn't a vaccination (medications, exam fees, boarding charges, etc.) is ignored entirely — never shown, never saved, never flagged for any pet. Vaccinations are the only thing this feature reads off a document.
9. If the AI can't read the document at all, or the request fails (including hitting the existing AI rate limit), the owner sees the same kind of error message this app already shows for other AI failures — nothing is silently lost, and nothing is silently saved from a partial/failed read.

## Acceptance Criteria

- Given a single-pet vaccine document, when the owner scans it from that pet's Vaccinations page, then the review screen shows the detected vaccinations under that pet's name, each editable and checked by default, and nothing is saved until the owner confirms.
- Given a document listing vaccinations for two different pets that both belong to the signed-in owner's account (by name), when the owner scans it from either pet's page, then the review screen groups the detected vaccinations under each correct pet's name, and confirming saves each vaccination to the correct pet.
- Given a document with a line item that doesn't name any pet, when it's scanned from a specific pet's page, then that line item is grouped under the pet whose page the scan was started from.
- Given the review screen is open, when the owner edits a field (e.g. corrects a misread date) before confirming, then the corrected value — not the AI's original read — is what gets saved.
- Given the review screen is open, when the owner unchecks one detected vaccination and confirms, then that one is not saved, while the others are.
- Given a detected vaccine name matches an existing record for that pet (case-insensitive), when the owner confirms, then the existing record is updated rather than a duplicate being created — same matching rule as today.
- Given the scanned document also lists a medication (e.g. Carprofen), when the owner reviews the results, then that medication never appears on the review screen and is never saved anywhere.
- Given the AI call fails or the owner has hit the existing AI rate limit, when the scan is attempted, then the owner sees a clear error message and no review screen opens with partial/garbage data.
- Given the owner backs out of the review screen without confirming, when they return to the Vaccinations page, then nothing from that scan was saved.

## Test Plan

- Single-pet document → grouped correctly, nothing saved until confirm → Playwright test: mock the `ask-vet-assistant` request (same `page.route()` interception pattern already used in `e2e/ask-wysker-guardrails.spec.js`) to return a synthetic single-pet result, scan from a seeded test pet's Vaccinations page, assert the review screen shows it and assert no `vaccinations` row exists yet via the Supabase client until after confirming.
- Multi-pet document → grouped under the correct pets → Playwright test: mock the same request to return vaccinations for two of `test1@`'s existing pets by name, confirm, then assert (via a direct Supabase read, same as `e2e/vaccination-due-reminders.spec.js` already does) that each vaccination landed on the correct pet, not just the one whose page the scan was launched from.
- Line item with no pet name → defaults to launching pet → Playwright test: mock a result with one nameless line item, confirm, assert it saved to the pet whose page was open.
- Inline edit before confirm is respected → Playwright test: mock a result, edit the date field on the review screen, confirm, assert the saved record has the edited date, not the mocked AI value.
- Unchecking a row excludes it → Playwright test: mock a two-item result, uncheck one, confirm, assert only one row was saved.
- Existing record gets updated, not duplicated → Playwright test: seed an existing vaccination for a test pet, mock a scan result with the same vaccine name (different date), confirm, assert the row count for that pet/vaccine name is still 1 and the date changed.
- Medication line items are never surfaced or saved → Playwright test: mock a result whose raw AI response also includes an extra medication-shaped field (defense-in-depth check that the client ignores it even if the model returns it), assert nothing appears in the review UI and no `medications` row is created.
- AI failure shows an error and doesn't open a garbage review screen → Playwright test: mock a 429/500 response, assert the existing `aiErrorText()` toast appears and no review screen opens.
- Backing out saves nothing → Playwright test: mock a result, close the review screen without confirming, assert no rows were created.
- **Seeding/access constraints:** All of the above are reachable through a normal signed-in test session (`test1@`, per existing fixture convention) — no service-role key or admin-only table is needed, since the mocked AI response replaces the one part (an actual Claude call) that a normal session couldn't otherwise control deterministically in a test. The one thing this Test Plan cannot cover is real-world extraction accuracy (does Claude correctly read an actual invoice's dates/names) — that's inherent to any AI-scanning feature and needs a manual pass with a handful of real sample documents (including the one used to spec this out) before shipping, not something a Playwright assertion can verify.

## Visual Reference

- No mockup was provided for the review screen itself; the sample document (`Harper's Vac invoice`) was used only to confirm what a real multi-line, single/multi-pet invoice looks like in practice (vaccine line items alongside an unrelated medication line for a different pet) — it directly shaped Functional Requirements 3 and 8, and the "ignore anything non-vaccine" rule. The actual review-screen layout is left to implementation using this repo's existing `BottomSheet` shell and form patterns (see Technical Spec) rather than a new visual design.

## Technical Spec

- **Schema:** No new tables or columns. Saves still go through the existing `vaccinations` table via `entities.Vaccination.create`/`.update`, exactly as today's Scan Record does — the change is entirely in what happens between "AI responds" and "data is written," not in what gets written.
- **Components/files touched:**
  - `src/components/VaccinationSection.jsx` — `handleScan` changes from "save immediately" to "open a new review step with the AI's parsed results." The AI prompt sent via `invokeAI()` is extended to also ask for a `pet_name` per detected vaccine (matched against the account's real pet names, passed into the prompt) and to explicitly instruct the AI to ignore anything that isn't a vaccination — closing Functional Requirement 8 at the prompt level, not just by filtering the response client-side (though the response should still be filtered defensively, matching the Test Plan's "even if the model returns it anyway" case).
  - The account's other pets (needed to build the pet-name list for the prompt, and to know which pet to attribute a matched line to) are fetched via `entities.Pet.list()`, which already returns every pet the signed-in user owns or co-owns (RLS-scoped) — no new query pattern.
  - A new review component (e.g. `ScanReviewSheet.jsx`, new file) renders the grouped-by-pet, editable, checkable list described in the Functional Requirements, built on the existing `BottomSheet` shell (see Design System note below) rather than a new custom overlay.
  - Saving from the review screen calls the same `entities.Vaccination.create`/`.update` calls `handleScan` already makes today, just deferred until confirm and looped once per pet group instead of assuming a single pet.
- **API / edge functions:** No changes to `ask-vet-assistant/index.ts` — it already accepts a `file_url` (PDF or image) and a `response_json_schema`, and already returns parsed JSON matching whatever schema is requested. The only change is the shape of the schema/prompt sent from the client (adding `pet_name` per item and explicit vaccine-only instructions), which the Edge Function doesn't need to know about. The existing per-user rate limit (20 requests / 10 minutes, spec 0050) is unchanged and covers this automatically.
  - Note: `invokeAI()` in `aiClient.js` only ever forwards a single file (`file_urls?.[0]`) to the Edge Function. That's fine here — this feature scans one uploaded document at a time, same as today — but it's a real ceiling if a future request ever wanted to scan multiple documents in one AI call.
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including its Amendments. The new review screen must use the existing `BottomSheet` component (Amendment #8) rather than a hand-rolled overlay — this repo has hit exactly this problem before (three independently hand-built sheets existed before that amendment consolidated them), so this spec doesn't repeat it. Any status coloring (e.g. an "Update" vs. "New" tag per row) should reuse the existing semantic tone tokens (`PALETTE`/`toneColors`) that `VaccinationSection.jsx` already uses for its overdue/due-soon badges, not raw hex values. No conflicts found beyond that.
- **Constraints from CLAUDE.md / locked decisions:** No conflicts. This doesn't touch the Vibe/Symptom-Count model, doesn't add a new AI rate limit (reuses the existing one per CLAUDE.md's guidance to check there first), and doesn't add a new bottom-sheet pattern (reuses the shared one per CLAUDE.md's guidance on `BottomSheet.jsx`).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** Yes — see "Before You Approve This." This spec extends the existing, previously undocumented Scan Record feature in `VaccinationSection.jsx` rather than building a second one. No other document-scanning or invoice-parsing feature exists anywhere else in the app (checked `docs/features`, `src/`, and `supabase/functions` for "OCR," "invoice," "receipt," "document scan").
- **Technical debt nearby:** The demo-account write protection (`prevent_demo_account_writes`, migration 0036) already covers the `vaccinations` table at the database level, so a demo-account user can't actually save through this new review screen either — confirmed, no new work needed there. Separately, `entityClient.js` still carries a `cat_id` → `pet_id` field-alias shim left over from an old rename; it doesn't affect this feature but is a general piece of debt worth knowing about if anyone ever removes it.
- **Orphaned features nearby:** None found specific to vaccinations/medications.
- **Punch list / known issues in this area:** None found referencing this specific gap (no-review-step scanning) on the launch planner or in code comments; this appears to be a genuinely new-to-you finding from this investigation, not a previously-logged issue.

## Non-Goals

- Medications are entirely out of scope for this spec, per your decision — no detection, no flagging, no "we noticed a medication" message of any kind. A future spec could revisit this if you decide it's worth the added complexity of cross-pet medication attribution.
- This does not change how vaccination due-date reminders are generated (`generate_vaccination_due_notifications`, migration 0044) — saving a corrected `next_due_date` through this flow feeds into that existing system exactly the same way manually editing a vaccination does today.
- This does not add scanning to any other document type (bloodwork, general vet records) beyond what already exists elsewhere in the app.
- This does not change the file upload mechanism itself (`storageClient.js`) — still a single image or PDF per scan.

## Open Questions

- None outstanding — your four decisions (extend the existing feature in place, exclude medications entirely, default unmatched lines to the currently-viewed pet, and use a full editable per-pet review list) resolve every open design question this investigation surfaced.
