# Feature Specification: Daily Check-In, Observation Data Model, and Wellness Score V1

## Purpose

Build the first usable version of Wysker Watch’s Daily Check-In system.

The goal is to let owners quickly record whether each pet had a normal day or whether something changed. The system should store observations as primary data, compare them against each pet’s baseline, and generate a simple Wellness Score and trend.

This supports Wysker Watch’s behavior-first, baseline-first, low-friction product direction.

---

# 1. Daily Check-In UX Requirements

## Recommended UI Pattern

Use a **bottom sheet / modal check-in flow**, not a full page takeover.

Reason: the Daily Check-In should feel fast, lightweight, and interruptible.

## Entry Points

Daily Check-In can be launched from:

* Home screen pet card
* “Daily Check-In” section on Home
* Pet profile
* Future notification/widget

## Initial State

For each pet, show:

**How is Harper today?**

Options:

* Today was normal
* Something changed
* Skip today

## Behavior

### Today was normal

When selected:

* Create a daily check-in record.
* Mark status as `normal`.
* Do not create individual observation records.
* Assume baseline remained unchanged.
* Recalculate Wellness Score.
* Return user to Home.

### Something changed

When selected:

* Open observation category selector.
* User selects only changed categories.
* User answers only relevant follow-up questions.
* Save observations.
* Recalculate Wellness Score.
* Return user to Home.

### Skip today

When selected:

* Create a daily check-in record.
* Mark status as `skipped`.
* Do not assume normal.
* Do not calculate a new Wellness Score from missing data.
* Return user to Home.

This is important because missing data is not the same as normal data.

---

# 2. Observation Categories V1

When “Something changed” is selected, show these categories:

* Appetite
* Water
* Bathroom
* Stool
* Vomiting
* Energy
* Mobility
* Breathing
* Skin / Itching
* Mood / Behavior
* Medication
* Weight
* Other

Only selected categories open follow-up questions.

---

# 3. Check-In Questions and Answers

## Appetite

Question:

**How did Harper eat today?**

Answers:

* Normal
* Ate a little less
* Ate much less
* Did not eat
* Ate more than usual

Optional note/photo.

## Water

Question:

**Did Harper drink differently today?**

Answers:

* Normal
* Less than usual
* More than usual
* Much more than usual

## Bathroom

Species-specific.

Cats:

**Was Harper’s litter box use different today?**

* Normal
* More frequent
* Less frequent
* Straining
* Outside the litter box
* Blood noticed

Dogs:

**Was Harper’s urination different today?**

* Normal
* Asked to go out more
* Accident indoors
* Straining
* Blood noticed

## Stool

Question:

**Was Harper’s stool different today?**

Answers:

* Normal
* Softer than usual
* Diarrhea
* Constipated / no stool
* Blood noticed

## Vomiting

Question:

**Did Harper vomit today?**

Answers:

* No
* Once
* More than once
* Hairball only

Optional:

* Food
* Bile / liquid
* Unknown
* Add photo

## Energy

Question:

**Was Harper’s energy different today?**

Answers:

* Normal
* Slightly lower
* Much lower
* Higher than usual

## Mobility

Species-specific.

Cats:

**Did Harper move differently today?**

* Normal
* Hesitated before jumping
* Jumped less than usual
* Used stairs/ramps differently
* Seemed stiff
* Could not reach usual places

Dogs:

**Did Harper move differently today?**

* Normal
* Walked less
* Limping
* Difficulty standing
* Difficulty with stairs
* Difficulty getting into car/furniture
* Seemed stiff after resting

## Breathing

Question:

**Was Harper’s breathing different today?**

Answers:

* Normal
* Coughing
* Panting at rest
* Breathing harder than usual
* Sneezing / nasal discharge

## Skin / Itching

Question:

**Did Harper scratch, lick, or chew more today?**

Answers:

* Normal
* Scratching more
* Licking paws/body
* Chewing skin
* New hair loss or irritated area

## Mood / Behavior

Question:

**Was Harper’s behavior different today?**

Answers:

* Normal
* Hiding more
* Restless
* Clingier than usual
* Less interested in people/play
* Aggressive or unusually reactive
* Confused / pacing

## Medication

Question:

**Was anything different with Harper’s medication today?**

Answers:

* No change
* Missed dose
* Dose changed
* New medication
* Side effect noticed
* Stopped medication

## Weight

Question:

**Was Harper’s weight updated today?**

Answers:

* Enter weight
* Skip

Weight is optional and should not be required daily.

## Other

Question:

**Anything else you noticed?**

Input:

* Free text
* Optional photo

---

# 4. Data Model Requirements

## Replace / Extend Symptom Logging

Do not build condition-specific symptom tables.

Create generalized observation-based tables.

## Tables

### daily_check_ins

Stores one daily status per pet.

Fields:

* id
* owner_id
* pet_id
* check_in_date
* status: `normal`, `changed`, `skipped`
* completed_at
* source: `app`, `notification`, `widget`, `sitter`
* notes
* created_at
* updated_at

Rules:

* One check-in per pet per date.
* `normal` means owner actively reported no changes.
* `skipped` means unknown.
* Missing record means not logged.

### observation_types

Defines reusable observation types.

Fields:

* id
* code
* label
* category
* species_applicability: `cat`, `dog`, `both`
* answer_type: `enum`, `number`, `text`, `boolean`
* baseline_supported
* score_supported
* default_logging_interval
* active

Examples:

* appetite
* water_intake
* urination
* stool
* vomiting
* energy
* mobility
* breathing
* itching
* behavior
* medication_exception
* weight

### observation_options

Defines answer choices.

Fields:

* id
* observation_type_id
* value
* label
* severity_score
* sort_order
* active

Example:

Observation type: appetite

* normal = 0
* ate_little_less = -5
* ate_much_less = -15
* did_not_eat = -30
* ate_more = -2

### observations

Stores actual owner observations.

Fields:

* id
* owner_id
* pet_id
* daily_check_in_id
* observation_type_id
* value
* numeric_value
* severity_score
* notes
* photo_url
* observed_at
* created_at
* updated_at

Rules:

* Observations are only created for changes or specific logged values.
* Historical observations must not be overwritten.
* Edits should preserve auditability if possible.
* One observation can support many future insights.

This follows the product principle that observations are the primary truth and reusable across insights.

### pet_baselines

Stores each pet’s normal.

Fields:

* id
* owner_id
* pet_id
* observation_type_id
* baseline_value
* baseline_numeric_value
* baseline_notes
* confidence_level: `low`, `medium`, `high`
* source: `onboarding`, `manual_edit`, `system_suggested`
* effective_from
* effective_to
* created_at
* updated_at

Rules:

* Baselines can be edited.
* Old baselines should be preserved by ending `effective_to`.
* Do not overwrite historical baseline context.

### wellness_scores

Stores calculated score snapshots.

Fields:

* id
* owner_id
* pet_id
* check_in_date
* daily_check_in_id
* score
* trend: `stable`, `improving`, `monitor`, `declining`, `unknown`
* score_reason_summary
* created_at

Rules:

* Score is derived from observations.
* Score should be explainable.
* Skipped days should not generate misleading scores.

---

# 5. Wellness Score Requirements

## Purpose

The Wellness Score summarizes owner-reported observations.

It must not diagnose, predict disease, or replace veterinary advice.

## V1 Scoring Model

Start each logged day at 100.

Subtract points for deviations.

Normal day:

* Score = 100
* Trend still calculated from recent history

Changed day:

* Score = 100 minus observation severity deductions

Skipped day:

* No new score
* Trend may display as unknown if too many days are missing

## Example Severity Weights

| Observation      | Mild | Moderate | Significant |
| ---------------- | ---: | -------: | ----------: |
| Appetite         |   -5 |      -15 |         -30 |
| Water            |   -5 |      -10 |         -15 |
| Urination        |   -8 |      -15 |         -25 |
| Stool            |   -5 |      -15 |         -25 |
| Vomiting         |   -8 |      -20 |         -25 |
| Energy           |   -5 |      -15 |         -20 |
| Mobility         |   -8 |      -15 |         -25 |
| Breathing        |  -10 |      -20 |         -30 |
| Skin / itching   |   -5 |       -8 |         -12 |
| Mood / behavior  |   -5 |      -10 |         -20 |
| Medication issue |  -10 |      -15 |         -20 |
| Weight           |   -5 |      -15 |         -25 |

## Score Floor

Score cannot go below 0.

## Score Labels

Display score with plain-language status:

* 90–100: Stable
* 75–89: Monitor
* 60–74: Review today
* Below 60: Significant changes logged

Avoid clinical or alarming language.

## Trend Logic

Trend should be calculated separately from score.

Use recent history:

* Stable: score remains near pet’s recent baseline
* Improving: score improves across recent check-ins
* Monitor: repeated moderate changes or downward movement
* Declining: significant drop or repeated negative trend
* Unknown: not enough data

This supports individualized baselines and trend-based change detection.

## Score Explanation

Each score must have a simple explanation.

Example:

“Harper’s score is lower today because appetite and energy were below normal.”

Do not say:

“Harper may be sick.”

---

# 6. Home Screen Requirements

For each pet card, show:

* Pet name
* Wellness Score
* Trend label
* Check-in status for today
* Quick actions:

  * Normal
  * Change
  * Skip

Example:

Harper
97
Stable
Today checked in

Tribble
82
Monitor
Appetite changed today

Auggie
—
Not checked in today

---

# 7. Multi-Pet Requirements

The Home screen must support household check-ins.

For each pet:

* User can mark normal directly.
* User can open changed flow.
* User can skip.
* Pets are handled independently.

Owner should be able to complete normal-day check-ins for multiple pets in under 30 seconds.

---

# 8. Catch-Up Requirements

If a user missed previous days, show a gentle prompt:

“Want to catch up?”

Options:

* Yesterday was normal
* Something changed yesterday
* Skip

Never shame the user for missing days. This aligns with the UX principle that the experience should assume interruptions and welcome users back.

---

# 9. Additional Requirements

## Baseline Dependency

If a pet does not have a completed baseline:

* Allow Daily Check-In anyway.
* Show a non-blocking prompt:
  “Complete Harper’s profile to make insights more personalized.”

Do not block logging.

## Accessibility

* Large touch targets
* Clear labels
* No color-only status indicators
* Screen-reader friendly controls
* Minimal typing
* Bottom sheet must be dismissible

## Error Handling

If save fails:

“Unable to save check-in. Please try again.”

Do not lose entered answers.

## Analytics Events

Track:

* daily_check_in_started
* daily_check_in_marked_normal
* daily_check_in_marked_changed
* daily_check_in_skipped
* observation_category_selected
* observation_saved
* wellness_score_calculated
* check_in_abandoned
* catch_up_started
* catch_up_completed

## Out of Scope for V1

Do not build:

* AI interpretation of check-ins
* Diagnosis-specific workflows
* Vet report generation from check-ins
* Push notification check-ins
* Widget check-ins
* Wearable integrations
* Complex condition-specific scoring
* Medical advice
* Emergency triage

---

# 10. Acceptance Criteria

A user can:

* Check in one pet as normal.
* Check in multiple pets from Home.
* Mark a pet as skipped.
* Log only changed categories.
* Save appetite, water, bathroom, stool, vomiting, energy, mobility, breathing, skin, mood, medication, weight, and other observations.
* Complete a normal check-in in under 10 seconds.
* Complete a changed check-in without answering unrelated questions.
* See a Wellness Score after logging.
* See a trend label after enough data exists.
* Understand why a score changed.
* Return after a missed day without guilt or penalty.
* Use Daily Check-In even if onboarding/baseline is incomplete.
* Preserve historical observations.

---

# 11. Implementation Notes for Claude Code

* Preserve the existing visual style, spacing, and component patterns defined by the Design System.
* Implement the Daily Check-In as a lightweight bottom sheet or modal flow, not a heavy multi-page form.
* Route all data access through the existing data layer. Do not call Supabase directly from UI components.
* Store observations as reusable behavior records, not condition-specific symptom records.
* Keep scoring logic separate from UI components.
* Keep score calculations explainable and deterministic.
* Do not infer that a skipped or missing day was normal.
* Do not overwrite historical observations.
* Build observation categories and answer options from data/config where possible so new observation types can be added later without rebuilding the flow.
* Keep V1 simple enough to ship.
