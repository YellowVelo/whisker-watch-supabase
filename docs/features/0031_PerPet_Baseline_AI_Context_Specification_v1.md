# 0031_PerPet_Baseline_AI_Context_Specification_v1

**Status:** Draft
**Date:** 2026-08-01
**Related files:** `src/components/AskWyskerSheet.jsx`, `src/components/PetAIChat.jsx`, `src/components/PetAIInsights.jsx`, `src/api/entities.js`, `src/components/BaselineSection.jsx` (reference pattern), `docs/foundation/0007 Data Model_V2.md` §6, `docs/launch-punch-list.md` P3

## Before You Approve This

- No duplicate work or locked-decision conflicts found. The Data Model doc (§6) explicitly allows exactly this approach: either populate `pet_baselines`, or "explicitly document that it's using a weaker proxy" — this spec is that documented weaker-proxy path, using data that's already collected and per-pet.
- One thing this spec deliberately does **not** touch, flagged so it isn't mistaken for scope creep later: while investigating, I found `PetAIInsights.jsx` (the other half of Ask Wysker) currently reads its "Recent Health Logs" from `symptom_logs` — the old 2021-era logging table — not the current Daily Check-In/observations system your app actually uses day to day. That's a pre-existing gap, unrelated to baselines, and I'm leaving it alone here. Worth its own punch-list line if you want it looked at.
- Everything below only adds one new read (the pet's onboarding row) to a sheet that already does two similar reads (pet, medications) for the same purpose — no new pattern, no new table.

## Functional Requirements

Right now, when an owner opens **Ask Wysker** (the AI assistant) for a specific pet, it knows the pet's name, age, breed, known conditions, and medications — but nothing about what's actually *normal* for that pet day to day. It answers generically.

Separately, every pet already has a baseline captured once during onboarding and kept up to date on the **Baseline** tab of their profile — things like "usually finishes meals," "energy is normally moderate," "normally goes to the bathroom without issue." Today that information just sits on the profile screen. Nothing else in the app looks at it.

This change makes Ask Wysker actually use that already-collected, per-pet information, so its answers can reference what's normal for *this* pet specifically — e.g. "Cooper's baseline says he usually finishes his meals, so skipping two in a row is worth watching" — instead of speaking generically about cats or dogs.

## Acceptance Criteria

- Given a pet whose onboarding baseline is fully filled in, when the owner opens Ask Wysker (either the "Ask a Question" chat or the "Insights" tab) for that pet, then the AI's context includes that pet's baseline (health status, appetite/water/energy/mobility/bathroom) alongside the conditions/medications it already sends.
- Given a pet whose onboarding baseline was never completed (no `pet_onboarding` row, or an incomplete one), when Ask Wysker is opened, then it degrades gracefully — no error, no blank/broken section, just omits the fields that were never set, exactly like conditions/medications already do when empty.
- Given the baseline is later edited from the Baseline tab, when Ask Wysker is opened next, then it reflects the updated values (no caching/staleness beyond the sheet's existing per-open fetch).
- This does not change anything about the Daily Check-In flow, Trends, or Pet Profile — verified those screens render identically before and after.

## Visual Reference

None provided — this is a backend/context change with no new UI surface (no new screen, button, or visible element; the only observable difference is the AI's answers referencing baseline info).

## Technical Spec

- **Schema:** none. Uses existing `pet_onboarding` columns (`health_status`, `appetite_baseline`, `water_baseline`, `energy_baseline`, `mobility_baseline`, `bathroom_baseline`) already written by onboarding and `BaselineSection.jsx`.
- **Components/files touched:**
  - `src/components/AskWyskerSheet.jsx` — add `entities.PetOnboarding.filter({ pet_id: petId })` to the existing `Promise.all` (line ~34-38), store as `baseline` state, pass down to both child components.
  - `src/components/PetAIChat.jsx` — accept new `baseline` prop; extend `SYSTEM_CONTEXT()` with an "Established baseline" sentence, only including fields that are actually set.
  - `src/components/PetAIInsights.jsx` — accept new `baseline` prop; extend `buildContext()` the same way, added alongside the existing Conditions/Medications lines.
- **API / edge functions:** none — `ask-vet-assistant` just receives a longer prompt string, same as today; no changes needed there.
- **Constraints from CLAUDE.md / locked decisions:** respected. `pet_baselines` stays untouched and explicitly unused (Data Model §6's documented-proxy option). Doesn't touch the retired-scoring-system boundary from CLAUDE.md (no scoring/check-in logic involved).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found. `BaselineSection.jsx` already reads `pet_onboarding` the same way this spec proposes reusing.
- **Technical debt nearby:** `PetAIInsights.jsx` sources health history from the legacy `symptom_logs` table rather than the current Daily Check-In/observations system (see "Before You Approve This") — pre-existing, not caused or fixed by this change.
- **Orphaned features nearby:** `pet_baselines` (the generalized, more sophisticated baseline table from migration 0014) remains fully unused after this change, by deliberate choice — "wire up the existing onboarding data" was chosen over "build out `pet_baselines`" when this spec was scoped.
- **Punch list / known issues in this area:** this directly addresses `docs/launch-punch-list.md` P3's "Baseline defaults to a global 'normal,' not a per-pet baseline" item. The per-pet data was never actually missing — `pet_onboarding` already captures it per-pet — it was just never *used* anywhere. This spec is what makes it used, for one surface (Ask Wysker). **Decision: mark that punch-list item resolved once this ships**, reworded to note the data existed but was unused, rather than "no per-pet baseline existed."

## Non-Goals (this version)

- Does not add baseline-deviation flagging/highlighting to the Daily Check-In flow (see Phase 2 below).
- Does not add a baseline reference to Trends charts or the Pet Profile screen (see Phase 2 below).
- Does not populate or read `pet_baselines`.
- Does not change `PetAIInsights`' log source from `symptom_logs` to the current observations system.

## Phase 2 (approved direction, not built in this version)

Decided during spec review — captured here so they aren't lost, to be scoped as their own spec(s) when picked up:

1. **Daily Check-In baseline nudge.** Not a real-time "this differs from Cooper's normal" deviation flag (only 5 of 11 check-in categories map 1:1 to an onboarding baseline field, so a flagging feature could only ever be partial). Instead: **prompt the owner to update the pet's Baseline** when appropriate — e.g. after a stretch of consistent check-in answers that no longer match what's on file. Needs its own scoping pass: what triggers the prompt, how often, where it surfaces.
2. **Trends baseline reference.** Add a lightweight baseline caption/reference to the Trends charts (e.g. "Normal for Cooper: finishes meals"), using the same `pet_onboarding` data, no AI involved. Bundle this with building out the **"Compare"** placeholder sub-tab already referenced in `docs/foundation/0008 Navigation & Information Architecture_V4.md` (Trends' Patterns/Compare placeholders) — baseline reference and Compare are natural companions and should be scoped together.

## Open Questions

None outstanding — all three raised during review were resolved above.
