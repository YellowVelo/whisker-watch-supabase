0005 Insights.md
Status: Superseded by `0010 Trends Feature Specification.txt`, which is what was actually built (`src/pages/PetTrends.jsx`, route `/pet/:petId/trends`). This document is kept as the historical technical-requirements analysis; see the "Reconciliation" section below for how it maps to what shipped. Do not use this document to plan further Trends/Insights work — start from `0010` and the current as-built `src/lib/checkin/trendsClient.js`.
Owner: Product
Audience: Claude Code (Engineering)

Reconciliation with `0010 Trends Feature Specification.txt` and the shipped build

`0010` is the real, product-authored spec that was actually implemented — this document's "open product decisions" were answered by it (or by the build) as follows:
1. Metrics: Wellness Score, Appetite, Water Intake, Energy, Weight — all five, per `0010` §5, plus an Insight Summary card. Matches this doc's speculation exactly.
2. Time ranges: 24H/7D/30D/90D/1Y, default 24H, per `0010` §4 — implemented verbatim in `RANGE_OPTIONS`/`RANGE_DAYS` (`trendsClient.js`).
3. AI summary: regenerated per visit, not persisted — matches this doc's Technical Requirements §5 (reuses `invokeAI`, the same client `PetAIInsights.jsx` uses).
4. Screen placement: `0010` specifies Trends as its own screen (not a Pet Profile section, not a Pets-landing enhancement) reached via "Pet Profile → Trends tab" — a third option this document didn't consider (it only asked about "sit alongside Observations" vs. "Pets landing only"). **As shipped, entry bypasses Pet Profile entirely** — Home's `WellnessCard`/`CheckInCard`, every Pets row, and CareMenu's "Trends" item all link directly to `/pet/:petId/trends`; Pet Profile itself has no card linking to Trends. `0010`'s own Navigation section says "Back returns to Pet Profile" — the shipped page uses `navigate(-1)` instead. **Confirmed intentional by Product**: Pets → Trends directly and Pets → Pet Profile are two genuinely separate paths; Pet Profile is reached only via Menu → Pet Profiles. `0010`'s Navigation section is superseded by this decision, not a bug.

Also resolved: the Trends screen's own Overview/Trends/Patterns/Compare sub-tabs. "Trends" (the sub-tab) is the legacy per-metric `symptom_logs` charts (`SymptomTrends`, formerly `PetProfileTabs`' own "Trends" tab) — kept alive here, not deleted, since it's genuinely different data from Overview's cards (Data Model_V2.md §7). `PetProfileTabs`' old tab now redirects here (`?section=trends`) instead of duplicating it. Overview remains the default/unchanged; Patterns/Compare remain "coming soon."
5. `pet_baselines`: still deferred/unpopulated, exactly as this document's option (b) anticipated. `0010`'s "trend calculations always compare against the pet's baseline where available" business rule is satisfied vacuously today (no baseline is available for any metric, so nothing is compared to one) rather than by building a fake baseline.
6. Missing-day/gap rendering: implemented with exactly the distinctions this document asked for — `missing` vs. `skipped` vs. `normal` vs. `observed` are all distinct states (`getObservationTrend` in `trendsClient.js`), matching `0010`'s "Unknown days remain gaps... Skipped days are visually distinguishable from missing data."
7. Household glance / memorial-pet inclusion: `0010` doesn't specify a household glance view at all (that idea came from this document, not `0010`) — Trends shipped as strictly a per-pet screen. Memorial pets are viewable (read-only), per `0010`'s edge cases.
8. Multi-pet comparison: `0010` reserves a "Compare" tab for this, explicitly deferred — implemented as a "coming soon" placeholder alongside a "Patterns" tab, matching `0010` §3 exactly ("Only Overview is implemented in Version 1").
9. Realistic history depth / 1Y meaningfulness: not resolved either way — 1Y is offered regardless, per `0010`.
10. Analytics events: added after this reconciliation — `trends_viewed`, `trends_range_changed`, `trends_section_changed` (all `{ pet_id, ... }`, see `0008 Navigation & Information Architecture_V4.md`'s Trends section for exact shapes). Chosen to answer real open questions (does 1Y ever get used; does the legacy Trends sub-tab or the Patterns/Compare placeholders get any engagement) rather than as general-purpose interaction logging.

Everything else in this document below (Technical Requirements, Data Requirements) was written before `0010` existed and should be read as this session's independent analysis of the same problem, largely validated by what `0010` specified and what shipped.

Purpose

Give owners a trend view of their pets' health over time — a "how has this been going" complement to Home's "how is this today." Visually inspired by wellness/weather-style dashboards (segmented time-range tabs, stacked metric cards with a current value and a trend line) — that reference is for interaction pattern and visual density only. There is no tide, weather, or navigation data in this product; do not build literal weather-app chart types (tide curves, wind roses, etc.).

This document intentionally leads with Technical Requirements, not screen mockups, because the two systems Insights would need to read from are not yet reconciled (see Data Model_V2.md, sections 6 and 7) and building against the wrong one — or against both inconsistently — is the single biggest regression/tech-debt risk for this feature.

Product Goals (draft — confirm before building)

- Show a per-pet trend view: wellness score over a selectable range, not just "today."
- Show household-level glance state (which pets are trending down) without requiring a per-pet drill-in.
- Keep AI-generated narrative summaries optional and clearly separated from the raw charts (AI explains, never diagnoses — Product Principle 12).
- Fit inside the existing three-destination IA. Per Navigation & IA_V4.md, this is not a fourth bottom-nav tab — it lives inside Pets / Pet Profile.

Explicitly out of scope for this document until confirmed
- Whether AI narrative summaries are on-demand (as today) or persisted/scheduled.
- Which specific metrics beyond Wellness Score get their own trend chart at V1 (Appetite/Energy/Weight are candidates; confirm before scoping backend work).
- Whether `pet_baselines` gets populated as part of this feature or stays deferred.

Technical Requirements

1. Data source decision (must be made explicit before any code is written)

Two logging systems currently coexist and are NOT reconciled (Data Model_V2.md §7):
- `daily_check_ins` / `observations` / `wellness_scores` — written by the Home daily check-in flow.
- `symptom_logs` — written by Pet Profile's quick-log bubbles and the full Symptom Log form; this is what the existing 30-day Appetite/Energy/Vomiting/Weight charts on Pet Profile already read.

Insights must pick one system per metric and say so explicitly in its own spec revision:
- Wellness Score trend: use `wellness_scores` (the only historical per-day score series that exists — `getRecentWellnessScores`/`getRecentWellnessForPets` in `checkinClient.js` already support this, just need a date-range variant instead of a row-count `limit`).
- Any appetite/energy/weight trend reused from Pet Profile: reuse the existing `symptom_logs`-based chart data/logic already in `PetProfile.jsx` (`chartData`, `hasChartData`, `hasWeight`) rather than re-deriving the same shape from `observations`. Do not build two parallel implementations of "appetite over time."
- Do not silently blend `symptom_logs` and `observations` data into one chart without a clear plan for how their values map to each other — they use different scales/encodings (e.g. `symptom_logs.appetite` is a 5-value enum; `observations` for the `appetite` observation_type uses a different value set from `observation_options`).

2. No baseline comparisons without a populated baseline

`pet_baselines` (Data Model_V2.md §6) exists as a table but is not populated or read anywhere in the app. If Insights wants to show "above/below baseline" for any metric, that requires either:
(a) a separate, explicitly-scoped piece of work to start writing rows to `pet_baselines` (onboarding-time and/or manual-edit sourced), or
(b) using an honestly-labeled proxy (e.g., "vs. 30-day average," "vs. last entry") and not calling it "baseline" in the UI, matching the precedent already set in `PetProfile.jsx`'s weight alert comment.
Do not add a new ad hoc "baseline" concept anywhere else in the schema — extend `pet_baselines`, per Engineering Principle "Extend Before Creating."

3. Range queries, not full-history fetches

`checkinClient.js` today only supports `limit`-based history (row count), not a date-range. A time-range selector (7D/30D/90D/1Y-style) needs a date-range query variant (e.g. `getWellnessScoresInRange(petId, startDate, endDate)`), following the existing batched-multi-pet pattern (`getRecentWellnessForPets`) rather than N+1 per-pet queries when rendering a household glance view.

4. Aggregation belongs server-side once it's non-trivial

Per Technical Standards ("keep frontend thin," "keep backend logic in Edge Functions"): simple range fetches + client-side rendering are fine at current data volumes. If Insights grows to include rolling averages, multi-metric correlation, or anomaly detection, that computation should move into a Supabase Edge Function, not be added incrementally to React components. Flag this threshold explicitly in code review rather than let it creep in.

5. AI insight generation reuse, not duplication

`PetAIInsights.jsx` + `ask-vet-assistant` Edge Function already implement on-demand AI summary generation from `symptom_logs`/`medications`/`bloodwork`. If Insights includes an AI summary block, reuse this path (context-building + Edge Function) rather than writing a second AI-calling component. If summaries need to be persisted/cached rather than regenerated per view, that requires a new table (e.g. `ai_insights`, owner-scoped RLS matching every other pet-scoped table via `is_pet_owner()`) and is a schema change that should be called out and approved as such, not folded in silently.

6. IA placement — no new bottom-nav tab

Per Navigation & IA_V4.md, the shipped nav has exactly three destinations (Home/Pets/Menu) and that is an explicit product decision, not an oversight to "fix." Insights must be:
- A section within Pet Profile (most likely replacing/absorbing the current "Observations" section's trend charts, or added alongside it), for per-pet trends, and/or
- A lightweight enhancement to the Pets landing page for household glance state (it already shows score + trend per pet — Insights may just need a richer version of that row, not a new screen).
Do not add a 4th bottom tab without an explicit, separate decision to revise the IA spec.

7. No regressions to what Navigation Refresh just shipped

- Do not reintroduce a global alerts page or move alerts out of their owning section (Navigation Refresh's "contextual alerts only" rule still applies).
- Do not duplicate chart logic that already exists in `PetProfile.jsx` (`OuraChartCard`, `chartData` construction) — extend/parameterize it (variable date range) rather than copy-pasting a second version, which is exactly the kind of drift that created the `symptom_logs`/`observations` split described above.
- Any new Supabase table must use `is_pet_owner()`-based RLS, following the pattern of every table since migration 0004 — do not fall back to a bare `created_by = auth.uid()` check, which would break co-owner parity.
- No direct Supabase table calls from new UI components — go through `entities.js`/`entityClient.js`, per Technical Standards (this is already a known, accepted pre-existing gap elsewhere in the app; do not add to it).

Data Requirements

- No schema changes required for a Wellness Score trend chart or reusing existing `symptom_logs` charts — this is a query/rendering gap only (see §1, §3).
- Schema changes ARE required if: (a) `pet_baselines` gets populated (new write paths, no new columns), or (b) AI insights get persisted (new `ai_insights` table). Both must be called out and approved explicitly before implementation, per "avoid unnecessary schema changes" and "no significant schema changes are expected" conventions used in Navigation Refresh.

Open product decisions (need answers before a full screen-level spec can be written)
1. Which metrics get their own trend chart at V1: Wellness Score only, or also Appetite/Energy/Weight? Once answered, each chosen metric also needs its own explicit "which data source powers this" call (see Technical Requirements §1) — Wellness Score is settled (`wellness_scores`), but Appetite/Energy/Weight would each need to say `symptom_logs` vs. `observations`, per metric.
2. Time ranges to support (7D/30D/90D/1Y? something else?)
3. Is the AI summary persisted or regenerated per visit?
4. Does this replace the current Pet Profile "Observations" section, sit alongside it, or live only on the Pets landing page?
5. Is populating `pet_baselines` in scope for this feature, or deferred again?
6. Missing-day/gap rendering — how should a trend line show a skipped or unlogged day (broken line, dotted segment, omitted point)? Ties directly to Product Principle 6 ("missing data is meaningful") — a gap must never be rendered as if it were a normal/flat value.
7. Does the household glance view include memorial (Rainbow Bridge) and sitter-shared pets, or active pets only? Home and Pets already made different choices here (Home: active only; Pets: all three groups) — Insights needs its own explicit answer, not an assumed default.
8. Is any multi-pet comparison needed (side-by-side trend lines across pets), or is this strictly one-pet-at-a-time detail plus a simple household list?
9. Realistic history depth — how far back does real user data actually go today? Affects whether a 90D/1Y range tab is meaningful at launch or premature.
10. Any new analytics/tracking events for Insights (e.g. `insights_viewed`, `insights_range_changed`), matching how Daily Check-In and Add Pet are already instrumented via `src/lib/analytics.js`?

Implementation Notes for Claude Code
- Before writing any code: confirm the 10 open decisions above, and read the current `PetProfile.jsx` Observations/Weight sections plus `checkinClient.js` in full — do not re-derive logic that already exists.
- Treat this as an extension of Pet Profile / Pets, not a new IA branch.
- Any new date-range query function belongs in `src/lib/checkin/checkinClient.js` alongside its siblings, not a new parallel client.
