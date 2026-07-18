003 Daily Check-In V2
Aligned to Daily Check-In, Vibe & Trends v5 — Canonical Specification
1. Purpose
Define the Daily Check-In experience under the new model that replaces all numeric scoring systems (Wellness Score V1, Health Score V2, and ring-based scoring) with two independent daily signals:

Vibe — subjective, owner-reported (Great Day / Off Day / Tough Day / Skipped)

Symptom Count — objective count of distinct symptoms logged across 11 categories

This document supersedes the scoring-based V1 specification and establishes the Daily Check-In flow as implemented in the v5 Source of Truth.

2. Daily Check-In UX Requirements
Entry Points
Daily Check-In can be launched from:

Home screen pet card

Daily Check-In section on Home

Pet Profile

Future notification/widget entry points

Entry points remain unchanged from prior versions.

3. Opening Question
The Daily Check-In begins with a three-way Vibe self-report:

How are things today?

Great Day

Off Day

Tough Day

Skip

This replaces the prior Normal / Something changed / Skip binary.

4. Vibe Definitions & Behavior
Great Day
Behaves identically to prior “Normal” flow.

No category picker shown.

Writes baseline rows for all 11 counted categories.

Persists a daily_check_ins record with status = great.

Off Day / Tough Day
Both open the category picker.

Both follow the same logging flow; the only difference is the stored Vibe label.

Owners select any categories where something was observed.

For each selected category, owners complete the existing per-category detail flow.

Regardless of selections, every completed day writes baseline rows for all 11 categories, plus symptom rows for selected categories.

Skipped
Creates a daily_check_ins record with status = skipped.

No baseline rows written.

No symptom count persisted.

5. Attribute Model
Daily Check-In supports 11 counted categories, grouped as follows:

Health (6)
Appetite

Water Intake

Bathroom

Stool

Vomiting

Nausea (new)

Wellbeing (5)
Energy

Mobility

Breathing

Skin/Itching

Behavior (moved from Mood/Behavior)

Tracked Separately
Weight (not part of symptom count; displayed independently)

Deferred
Medication Exception (remains in schema; removed from UI this round)

Unaffected
Other (free text)

6. Updated Answer Options
Nausea (new category)
Multi-select:

Lip licking

Burping

Drooling

Ate non-food items

Hunched posture

Water Intake
Add: Not observed

Bathroom
Add: Not observed

Vomiting
Add: Regurgitated

Not Observed Rules
Logged explicitly.

Not a symptom.

Must remain visually distinct from “Normal.”

7. Observation Logging Rules
For every completed (non-skipped) day:

Write baseline rows for all 11 categories.

Write one row per distinct symptom selected.

Weight, Other, and Medication Exception do not contribute to symptom count.

Severity weighting is removed entirely.

This ensures consistent, complete daily records.

8. Symptom Count
Definition
The total number of distinct symptoms logged across the 11 counted categories.

Persistence
Stored once per completed day (e.g., daily_check_ins.symptom_count).

Never computed live at read time.

Direction
Compare today’s symptom count to yesterday’s:

Fewer symptoms → up

More symptoms → down

Same → equal

Missing/skipped → unknown

Uses the existing computeAttributeDirection logic.

9. Home Screen Requirements
Vibe Icon
Replace numeric score with:

Great → Sun

Off → CloudRainWind

Tough → CloudHail

Skipped → BadgeHelp

Icon color: flat sky blue (PALETTE.sky / --accent-sky)

Attribute Chips
Show 6 chips:

Appetite

Water

Bathroom

Stool

Vomiting

Nausea

Each chip shows up/down/equal direction based on per-attribute symptom count.

Weight
Displayed as a separate line.

10. Pet Profile Requirements
Ring System Removed
The 5-ring Wellness Score display is retired.

Replacement
Single Vibe icon (same rules as Home)

Weight displayed separately (exact placement pending product confirmation)

11. Trends & Overview Requirements
Charts Display
Charts show raw symptom counts, not scores.

Per-Day States
Normal (0 symptoms)

1 Symptom

2+ Symptoms

Not Observed (Water, Bathroom only)

Skipped

No Check-in

Tap Interaction
Tapping a bar reveals specific logged values.

Grouping
Health (6) and Wellbeing (5) toggles updated to new attribute lists.

Deep Linking
Unchanged; extended to include Nausea and Behavior.

12. Business Rules
Vibe is never inferred from symptom data.

Symptom count is never converted into a score.

Off Day and Tough Day are distinct, meaningful values.

“Not Observed” is a real logged answer.

Every completed day writes baseline rows for all categories.

No severity weighting anywhere.

Medication Exception remains in schema but is not shown.

13. Data Model Requirements
daily_check_ins.status
Updated enum:

great, off, tough, skipped

symptom_count
New persisted integer field.

observation_types / observation_options
Updated with:

Nausea + 5 options

Not Observed (Water, Bathroom)

Regurgitated (Vomiting)

severity_score
Remains in schema but unused.

14. Analytics
Retire:

wellness_score_calculated

wellness_score_trend

Add:

vibe_recorded (status + symptom_count)

15. Acceptance Criteria
✓ Daily Check-In asks “How are things today?” with Great / Off / Tough / Skip
✓ Great Day behaves like prior Normal
✓ Off/Tough open picker; only label differs
✓ No numeric score exists anywhere
✓ Home shows Vibe icon + 6 chips + Weight
✓ Pet Profile shows Vibe icon; rings removed
✓ Symptom count persisted and drives direction
✓ Vibe never inferred
✓ Nausea fully supported
✓ Behavior appears under Wellbeing
✓ Medication Exception removed from UI

16. Edge Cases
Off/Tough Day with only one symptom → valid

Off/Tough Day with zero symptoms → product decision pending

Migrated days: symptom count present, Vibe absent

Legacy vomiting integer mapping unresolved

Rapid Vibe changes → existing edit behavior applies