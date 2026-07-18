Feature Specification
Daily Check-In, Vibe & Trends

Document

01 Features/Trends/Trends.md
This version's scope now extends beyond Trends into the Daily Check-In flow, Home, and Pet Profile, since all four are driven by the same underlying model. Recommend this becomes the canonical spec for that whole surface area rather than staying filed under Trends alone — see Open Questions.

Status

Replaces all scoring in the app. Wellness Score V1 (0-100, severity-weighted, backs the Pet Profile rings), Health Score V2 (0-10, equal-weight), and the severity-weighted N/100 blend explored during this version's planning are all retired. Trends and Overview continue to exist but display symptom counts, never a score. Legacy Base44 data migration is scoped but not yet executed — see Migration Plan and Open Questions.

Version History

v2 — Original spec. Only Overview was implemented; Trends was listed as a tab but never given defined content.

v3 — Reconciled the spec with what was actually built and defined Trends for the first time. Introduced Health Score V2 (0-10, equal-weight, multi-select).

v4 — Addressed Trends granularity, migration, and a "positive baseline, visible subtraction" reframing of Health Score V2. Superseded by this version before implementation.

v5 (this version) — Discovery during v4 planning surfaced that the app had accumulated three separate, never-fully-reconciled scoring systems: Wellness Score V1 (0-100, severity-weighted, still driving the Pet Profile rings), Health Score V2 (0-10, equal-weight), and a proposed severity-weighted N/100 blend that would have made a fourth. None of V1's severity weightings were ever clinically validated, and its Stable/Monitor/Declining trend labels implied a level of interpretation the app has no basis for. Rather than reconcile three scoring systems, this version removes scoring as a concept entirely. Replaces all of it with two independent daily signals: a subjective owner-reported Vibe (Great Day / Off Day / Tough Day) and an objective, unweighted count of symptoms logged, used only to show an up/down/equal direction. The two signals never inform each other. Adds Nausea as a Health attribute. Moves Behavior into Wellbeing. Adds "Not Observed" to Water Intake and Bathroom. Adds "Regurgitated" to Vomiting. Defers Medication Exception. Retires the 5-ring Pet Profile display in favor of a single Vibe icon.

Owner

Product

Audience

Claude Code

Purpose

Replace every numeric score in the app — Wellness Score V1, Health Score V2, and the rings that render V1 — with two independent daily signals: a subjective Vibe the owner reports directly, and an objective count of distinct symptoms logged, used only to show whether more or fewer things were logged than the day before. Extend the Daily Check-In, Home, Pet Profile, and Trends screens to reflect this. Scope what's needed to eventually bring pre-existing Base44 data into the new model.

Core Model

I. Vibe — subjective, owner-reported, replaces the prior two-way Normal/Changed split.

The daily check-in's opening question becomes a three-way self-report instead of a binary: "How are things today?" (exact copy TBD by design — should follow the existing per-pet question pattern already used elsewhere in config.js, e.g. "How was {name}'s day {dayWord}?").

Answers: Great Day, Off Day, Tough Day.

daily_check_ins.status changes from ('normal', 'changed', 'skipped') to ('great', 'off', 'tough', 'skipped').

Great Day inherits today's "normal" behavior exactly, renamed: nothing logged, no category picker shown, and an explicit baseline row is still written for every counted category (unchanged rule from the equal-weight migration).

Off Day and Tough Day both open the same category picker → per-category detail flow already built in DailyCheckInSheet.jsx. Nothing about save behavior, validation, or downstream processing distinguishes them — the only difference is which label gets stored. Both are equally real, equally complete data points.

Skipped is unchanged.

II. Symptom Count — objective, derived, wholly independent of Vibe.

Computed as the total number of distinct symptoms logged that day across the 11 counted categories (see Attribute Model). Medication Exception, Weight, and Other are excluded — see their entries below for why.

Persisted once per completed (non-skipped) day, not computed live at read time — this supports fast historical queries later without re-deriving history on every read.

Direction (up / down / equal / unknown) compares today's persisted count to yesterday's. Fewer symptoms than yesterday = up. More = down. Same = equal. Either day unknown (skipped or missing) = unknown. This is the existing computeAttributeDirection pattern (scoring.js) — already built for per-attribute chips — extended to run once more at the aggregate level. It replaces computeHealthScoreDirection and computeTrend entirely, along with their unvalidated thresholds.

III. The two signals never inform each other.

Vibe is always a deliberate, independent owner input. It is never derived, inferred, or defaulted from symptom count or symptom data — in the live app, and during migration of historical records alike. A day can be "Off Day" with one symptom logged, or "Tough Day" with several. The app does not reconcile, flag, or attempt to correct for the two signals disagreeing. This is a hard rule, not a display nicety.

Attribute Model

Health (6, in this order): Appetite, Water Intake, Bathroom, Stool, Vomiting, Nausea.

Wellbeing (5, in this order): Energy, Mobility, Breathing, Skin/Itching, Behavior.

Tracked separately, own row everywhere, part of neither group: Weight. (Already modeled this way today via config.js's SEPARATE_TRACKED_ATTRIBUTES — no structural change needed, just confirming it stays separate under the new model too.)

Deferred, not shown in this round's check-in flow: Medication Exception. Assume owners are administering medication as prescribed; exception handling is future scope. The category is not removed from the data model — only from this round's UI — so it can come back later without a schema change.

Unaffected, out of scope for this version: Other (free text).

New or changed options within existing categories:

Nausea (new category, multi-select): Lip licking, Burping, Drooling, Ate non-food items, Hunched posture. Carried over verbatim from the legacy nausea_symptoms array — same values, now a first-class Health category instead of unmigrated legacy data.

Water Intake: add "Not observed."

Bathroom: add "Not observed."

Vomiting: existing options (No, Once, More than once, Hairball only) plus new "Regurgitated."

"Not Observed" is a real, explicit logged answer — it satisfies "record everything," the same way every other category's baseline row does. But it is not a symptom: excluded from the symptom count entirely. It is also not the same as "Normal" — Normal means the owner actively observed no change; Not Observed means the owner didn't have the opportunity to observe (didn't see the pet drink or use the bathroom that day). Check-in and Trends must keep these visually and semantically distinct, never collapsed into one state.

Functional Requirements — Daily Check-In

1. Entry points unchanged from v3/v4.

2. Opening question changes to the three-way Vibe self-report (Great Day / Off Day / Tough Day), replacing the Normal/Changed binary. Skip remains available.

3. Great Day: saves immediately, identical to today's markNormal path. Writes an explicit baseline row for all 11 counted categories. No picker shown.

4. Off Day / Tough Day: opens the existing category picker, now listing 11 selectable categories (6 Health + 5 Wellbeing; Medication Exception removed from the picker this round), then the same per-category answer flow already built.

5. Every completed (non-skipped) day, regardless of which Vibe was chosen, writes an explicit row for all 11 categories — a baseline row where nothing was selected for that category, one row per distinct symptom otherwise. Unchanged rule, now extended to Nausea and Behavior's new home in Wellbeing.

6. Saving a check-in computes and persists that day's total symptom count (the 11-category sum). No other calculation is performed — no score, no weighting.

Functional Requirements — Home (PetSummaryCard)

Replace the current −/10 circle with a single Vibe icon:

Great Day → Sun
Off Day → CloudRainWind
Tough Day → CloudHail
Skipped / no check-in yet today → BadgeHelp

(BadgeHelp — a badge shape containing a question mark — is the closest existing icon to "badge-question-mark," which does not exist in the pinned lucide-react version. Confirmed both BadgeHelp and the three Vibe icons above exist in the exact version pinned in package.json.)

Icon color: flat sky blue for every state, using the existing PALETTE.sky / --accent-sky token. No tone-based (good/warn/bad) color mapping — this replaces, and simplifies away, today's STATUS_TONE logic for this element.

The attribute grid becomes 6 chips: Appetite, Water, Bathroom, Stool, Vomiting, Nausea.

Weight moves out of the grid and renders as its own separate line on the card, not as a 7th grid chip.

Chip content and logic are otherwise unchanged: each chip continues to show its existing up/down/equal direction via computeAttributeDirection (today's distinct symptom count for that attribute vs. yesterday's). This is a documentation update to reflect the new attribute list, not a functional change to how chips work.

Functional Requirements — Pet Profile (ring replacement)

The 5-ring row (Wellness, Appetite, Energy, Symptoms, Weight — all 0-100) is retired entirely, along with the WellnessRing component that renders it.

Replaced with a single Vibe icon, same icon and color rules as Home, above.

Weight needs its own display element on this page too, now that it's no longer one of the 5 rings. Assumption, pending confirmation: mirror Home's pattern — Vibe icon plus a separate Weight line beneath it. This wasn't explicitly specified; flagged in Open Questions rather than silently decided.

This page's rings were previously marked explicitly out of scope in the codebase when the V2 Wellbeing chips shipped on the Pets-tab card. That carve-out no longer applies — the rings it was protecting are what's being removed here.

Functional Requirements — Trends & Overview Charts

No numeric point-value system exists anymore — this fully reverses v4's Core Model. Charts represent raw, unweighted symptom counts per attribute per day.

Per-day, per-attribute states: Normal (0 symptoms), 1 Symptom, 2+ Symptoms, Not Observed (Water Intake and Bathroom only), Skipped, No Check-in.

Tapping or pressing a day's bar reveals the specific observation value(s) logged that day. This requirement is unchanged from v4 — still purely a read/display gap, since the specific value has always been captured at logging time — and now also covers Nausea's specific values.

The Health (6) / Wellbeing (5) group toggle continues to organize the screen, updated to the new attribute lists.

Deep-linking (Home's attribute chips, Pets/Pet Profile's Wellbeing chips → Trends, scrolled to the tapped attribute) continues to work unchanged, extended to include Nausea (Health group) and Behavior (Wellbeing group).

Still open: the exact visual/layout treatment for these charts. A screenshot was provided referencing an older view, but which prior view was meant hasn't been confirmed yet — see Open Questions. This section specifies the states and data the charts must support; final layout is pending.

Business Rules

Vibe is always a deliberate, independent owner input. Never derived, inferred, or defaulted from symptom count or symptom data, in the live app or during migration.

Great Day is the same "confirmed normal, nothing to log" state as today's "normal" status, renamed — not a new behavior.

Off Day and Tough Day are both real, distinct, independently meaningful values. Never collapsed into one internal "changed" state, never treated as interchangeable by any downstream logic.

"Not Observed" is a real logged answer, distinct from both "Normal" and a missing/skipped day. Excluded from the symptom count.

Every completed (non-skipped) day writes an explicit row for all 11 counted categories (unchanged rule, now covering Nausea and the expanded Wellbeing group).

Symptom count is persisted once per completed day, never computed live.

Medication Exception is out of scope for this round's check-in UI; assume full medication adherence. The category stays in the data model for future reintroduction.

No severity or graded weighting is used anywhere in this model. Every logged symptom counts equally toward the aggregate, and the aggregate itself is never converted into a score of any kind.

Data Requirements

daily_check_ins.status constraint updated: ('great', 'off', 'tough', 'skipped'), replacing ('normal', 'changed', 'skipped'). This is a rename/expansion of an existing enum column, not a new table.

New persisted field for daily symptom count. Proposed: a new column on daily_check_ins (e.g. symptom_count), written at save time. wellness_scores is being retired as a concept for this purpose, so a new table for a single integer seemed like unneeded surface area — flagged for confirmation as an implementation choice, not an explicit instruction.

observation_types / observation_options extended: new Nausea type plus its 5 options; new "Not Observed" options for Water Intake and Bathroom; new "Regurgitated" option for Vomiting.

Retrieve, per attribute per day: list of distinct observation values logged (unchanged from v4 — still needed for the Observation Detail tap interaction).

observation_options.severity_score stays in the schema, unused, rather than being dropped — consistent with the existing precedent of not making destructive schema changes when a value simply stops being read.

Migration Plan

Same source as before: 11 rows in symptom_logs (imported via migrations 0003 and 0007), covering Harper, Auggie, and Tribble, dated 2026-05-20 through 2026-06-15. The target model has changed; the plan below supersedes v4's.

Vibe: legacy rows get no Vibe value. Base44 never asked "how did the day feel" — that data doesn't exist and must not be fabricated by inference from symptom severity or count (see Business Rules, Core Model III). Migrated days render with a "not recorded" Vibe state — see Open Questions for the exact icon/display treatment.

Symptom count: migrated days do get a real, computable symptom count, and do participate in up/down/equal direction math, since that's objectively derivable from the legacy fields. This is independent of the missing Vibe — a day can have a real count and no Vibe at the same time.

Vomiting mapping: legacy vomiting is a raw integer episode count; the current model is enumerated (No / Once / More than once / Hairball only / Regurgitated). Still unresolved — needs an explicit rule (e.g., 0 → No, 1 → Once, 2+ → More than once) before Phase 1 mapping can be finalized. There is no way to retroactively recover whether a legacy count included a hairball-only or regurgitation event.

Nausea: legacy nausea_symptoms maps directly and cleanly onto the new Nausea category's 5 options — same values, no ambiguity.

Fields with no home: pain_signs, medication_given (moot given the Medication Exception deferral), and free-text notes. Flagged for manual review, never silently dropped or guessed.

Phases (carried forward from v4, retargeted): Phase 0 Audit (largely complete — source, dates, and schema are known), Phase 1 Mapping (value-by-value, including the open Vomiting question above), Phase 2 Backfill (versioned, idempotent, additive-only insert into the current model), Phase 3 Recompute (now means recomputing symptom counts, not a Health Score), Phase 4 Validate (spot-check migrated days against source), Phase 5 Reconciliation flag (conflicting or ambiguous legacy entries go to a manual-review list, never silently resolved).

Validation Rules

status must be one of 'great', 'off', 'tough', 'skipped'.

symptom_count: non-negative integer, or null for a skipped/no-check-in day.

A non-zero symptom count must have at least one corresponding observation record — no count exists without a record backing it, carried over from v4's anti-drift principle.

UI Components

Vibe icon component (Sun / CloudRainWind / CloudHail / BadgeHelp), flat sky-blue color, shared by Home and Pet Profile.

Existing AttributeTrendChip, NavCard, and chart components are reused as-is structurally; only the attribute lists feeding them change. No new visual language is introduced beyond the Vibe icon itself.

Acceptance Criteria

✓ Daily check-in asks "How are things today?" with Great Day / Off Day / Tough Day / Skip as the answers.
✓ Great Day behaves identically to today's Normal path.
✓ Off Day and Tough Day both open the category picker; nothing in save behavior distinguishes them beyond the stored label.
✓ No score of any kind — V1, V2, or the blended N/100 — is computed, displayed, or stored anywhere in the app after this ships.
✓ Home's card shows a Vibe icon (not a numeric circle), 6 chips (Appetite, Water, Bathroom, Stool, Vomiting, Nausea), and a separate Weight line.
✓ Pet Profile's 5-ring row is removed and replaced with a single Vibe icon.
✓ Symptom count is persisted once per completed day and drives an up/down/equal indicator via day-over-day comparison only.
✓ Vibe is never computed from symptom data anywhere, including migrated historical records.
✓ Nausea is fully wired: loggable, counted, chip-visible, chart-visible, and deep-link-eligible.
✓ Behavior appears under Wellbeing, not as an unscored, ungrouped category.
✓ Medication Exception does not appear in this round's check-in flow but remains in the data model.

Edge Cases

Owner picks "Tough Day" but logs only one symptom, or "Off Day" with several — expected, not flagged as inconsistent.
An Off/Tough Day where the owner opens the picker but ultimately selects nothing in any category — behavior undefined; see Open Questions.
Legacy migrated day: real symptom count, no Vibe — must render distinctly from a skipped day (which has no count at all), despite both potentially sharing a "no Vibe recorded" visual treatment.
Legacy Vomiting count where the true event type (hairball vs. regurgitation vs. plain vomiting) can't be recovered from a bare integer — goes to the migration exceptions list.
Rapid Vibe changes on the same day (owner re-opens and changes Great Day to Off Day) — existing edit/re-save behavior should apply; no new rule introduced here.

Open Questions

1. [Product] Weight's exact display treatment on Pet Profile now that the rings are gone. Assumed to mirror Home's "own separate line" pattern — please confirm or redirect.
2. [Product] Trends screen's exact visual/layout treatment. Still waiting on confirmation of which prior view the reference screenshot was pointing to.
3. [Data/Engineering] Legacy Vomiting integer-count → enumerated-option mapping rule, needed before migration Phase 1 can finalize.
4. [Product] Historical (migrated) records with no Vibe — same icon/treatment as a live Skipped day, or a visually distinct third "unrecorded" state?
5. [Product] An Off/Tough Day where the owner selects zero symptoms across every category in the picker — does this behave like Great Day, or remain a distinct zero-symptom Off/Tough day?
6. [Engineering] Confirm the proposed storage location for persisted daily symptom count (new column on daily_check_ins) or redirect to a different design.

Implementation Notes for Claude Code

This is a replacement, not an addition. computeHealthScore, computeTrend, computeHealthScoreDirection, computeDayScore, scoreLabel, explainScore, and the entire severity_score-driven scoring path in scoring.js are retired. computeAttributeDirection survives and is reused for both per-attribute chips and the new aggregate direction — same function, called at two granularities, not two implementations.

HEALTH_SCORE_ATTRIBUTES and WELLBEING_ATTRIBUTES in config.js are updated in place — add Nausea to the first, add Behavior to the second — preserving the existing single-source-of-truth pattern rather than introducing a new list anywhere else.

Rename constants and functions that reference "Health Score" once it no longer exists (e.g. HEALTH_SCORE_ATTRIBUTES → consider HEALTH_ATTRIBUTES). A cleanup pass, not required for functional correctness, but avoids shipping misleading names next to code that no longer computes a score.

Analytics events health_score_calculated and wellness_score_calculated are retired. Replace with an equivalent event (e.g. vibe_recorded) capturing status and symptom_count, so downstream analytics isn't silently broken by this change.

The WellnessRing component and its rendering block in PetProfileContent.jsx are removed in favor of the new Vibe icon component.

observation_options.severity_score stays in the schema, unused, rather than being dropped in a destructive change — consistent with existing precedent.

The migration script remains a separate, versioned, idempotent operation, per prior precedent. Phase 3's "recompute" step now recomputes symptom counts, not a Health Score.
