
# **Feature Specification — Trends v5, reconciled to current implementation**
**Document:** 01 Features/Trends/Trends.md
**Owner:** Product
**Audience:** Claude Code
**Status:** Reconciled to current implementation as of 2026-07-18 (see Revision Notes). Replaces Trends v3 and v4. Removes all scoring logic. Fully adopts Vibe + raw symptom counts.

---

## **Purpose**
Provide a dedicated screen for visualizing changes in a pet's health and wellbeing over time using **raw symptom counts**, **explicit daily observations**, and **Vibe** as the owner‑reported context.
This screen is **read‑only** and reflects the unified Daily Check‑In model.

---

# **Core Model Alignment**
Trends adopts the v5 Daily Check‑In model:

### **1. No scoring exists anywhere**
- Wellness Score V1 (0–100) → removed
- Health Score V2 (0–10) → removed
- N/100 blended score → removed
- All deduction logic → removed
- All severity weighting → removed
- All baseline comparison → removed

### **2. Two independent daily signals**
- **Vibe** (Great Day / Off Day / Tough Day / Skipped)
- **Symptom Count** (raw count of distinct symptoms logged across 11 categories)

### **3. Charts display raw symptom counts only**
Per‑day, per‑attribute states:
- **Normal (0 symptoms)**
- **1 Symptom**
- **2+ Symptoms**
- **Not Observed** (Water Intake, Bathroom only)
- **Skipped**
- **No Check‑In**

### **4. Updated attribute model**
**Health (6):** Appetite, Water Intake, Bathroom, Stool, Vomiting, **Nausea**
**Wellbeing (5):** Energy, Mobility, Breathing, Skin/Itching, **Behavior**
**Weight:** separate, not part of symptom counts

Vomiting and Nausea, though both counted as Health attributes for symptom-count purposes, **render as one combined chart card** (`VomitingNauseaCard`), not two independent attribute cards — see Chart Model below.

---

# **Screen Structure**

The screen is organized into four sub-tabs (`role="tablist"`, under the pet header): **Overview**, **Trends**, **Patterns**, **Compare**.

- **Overview** is the default landing sub-tab. It shows a fixed set of cards regardless of entry point: Appetite, Water Intake, Energy (as `ObservationCard`s), the Weight card, and the AI Insight Summary card.
- **Trends** shows every attribute in the selected group (Health or Wellness) as its own card, plus Weight (Health group only) — see Chart Model below. This is where deep-linked chips land.
- **Patterns** and **Compare** are both **unbuilt placeholders** — selecting either shows "*[Patterns/Compare] coming soon — This view isn't available yet.*" No chart, data, or interaction exists behind them.

The v4 spec this document replaces did not describe this sub-tab structure at all and implicitly assumed one flat screen; that flat screen is now specifically the **Trends** sub-tab, with **Overview** as a separate, narrower default view.

---

# **Functional Requirements**

## **1. Entry Points**
Trends is a top-level route (`/pet/:petId/trends`), not nested inside Pet Profile. Users reach it via:
- **Tapping a pet's card on Home or Pets** — lands on the **Overview** sub-tab, no group/metric pre-selected.
- **Tapping a Health attribute chip on a Home card** — deep-links directly into the **Trends** sub-tab, Health group, with that attribute scrolled into view and briefly highlighted.
- **Tapping a Wellbeing chip on a Pets-tab or Pet Profile card** — deep-links into the **Trends** sub-tab, Wellness group (UI label is "Wellness," not "Wellbeing"), same highlight behavior.
- **The legacy "Trends" tab inside the old tabbed Pet Profile page** (`/pet/:petId/profile?tab=trends`) redirects here (`?section=trends`) rather than rendering its own charts — kept only so old links/bookmarks keep working.

Navigation preserves the selected pet.

Entry point determines:
- Which sub-tab opens (Overview by default; Trends when a metric/group is specified)
- Active group (Health or Wellness) within the Trends sub-tab
- Initial scroll position (deep‑linked attribute), highlighted briefly on arrival

---

## **2. Header**
Displays:
- Back button
- Pet photo
- Pet name (with a small memorial icon, if applicable)
- Species, breed, sex (one line)

There is no calendar button and no overflow menu on this screen — both were part of the original spec but were never built.

---

## **3. Chart Model**
### **All charts use raw symptom counts. No numeric score. No 0–10 axis.**

### **Chart Types**
- **Bar charts** for all Health + Wellbeing attributes (`TrendChart` `variant="observation"`)
- **Line chart** for Weight only (`variant="line"`)

### **Tap Interaction — not implemented**
No chart or bar in the current codebase has any tap/click handler. Tapping a bar does not reveal per-day observation values, and there is no "Not Observed" callout on tap — this entire interaction described in earlier versions of this spec does not exist yet. If built, it would need to be added to `TrendChart.jsx`, `ObservationCard.jsx`, and `VomitingNauseaCard.jsx`, none of which currently handle any pointer events beyond the existing time-range/group toggle buttons.

---

## **4. Attribute Cards**
Each attribute card (Overview and Trends sub-tabs) displays:
- Current day's state and subtitle (e.g. "Not checked in today")
- A bar chart of historical states for the selected time range
- A legend for the observation states
- No tap-to-detail interaction (see above — not implemented)

**Vomiting + Nausea are one card, not two.** `VomitingNauseaCard` renders a single combined panel for both attributes; the Health group's attribute list explicitly excludes `vomiting` and `nausea` from its per-attribute card loop and appends this one combined card instead.

### **Weight Card**
- Displays latest weight
- Shows line graph of weight history
- Trend annotation (up/down/equal) based on weight change
- Weight is **not** part of symptom counts
- Appears in the **Overview** sub-tab always, and in the **Trends** sub-tab only when the **Health** group is active (it does not appear under the Wellness group)

---

## **5. Insight Summary Card**
Only shown in the **Overview** sub-tab. It is AI-generated (calls the shared `invokeAI` client, the same underlying mechanism as `ask-vet-assistant`), with a prompt that explicitly instructs: *"Never diagnose, recommend treatment, or create alarm — describe observations only."*

The AI is given only four inputs: **Appetite, Water Intake, Energy, and Weight** trend data. It is **not** given the Vibe status, the aggregate symptom count, or any of the other eight Health/Wellbeing attributes (Bathroom, Stool, Vomiting, Nausea, Mobility, Breathing, Itching, Behavior) — none of those reach the prompt.

It requires at least 2 non-skipped check-ins among the pet's 10 most recent before it will call the AI at all; otherwise it returns no summary (see Empty States).

Example, reflecting the real input set (Appetite/Water/Energy/Weight only):
> "Tribble showed fewer symptoms today in Appetite and Water Intake, and weight is holding steady."

(An earlier version of this example mentioned "Mobility" — Mobility is never part of this card's input and could never appear in a real summary.)

---

# **6. Trends Sub-Tab — Attribute Group Charts**
### **Groups**
**Health (6 for symptom-count purposes, 5 chart cards):** Appetite, Water Intake, Bathroom, Stool render as individual cards; Vomiting + Nausea render together as one `VomitingNauseaCard`. Weight also appears in this group as a 6th card.
**Wellness (5):** Energy, Mobility, Breathing, Skin/Itching, Behavior — labeled "Wellness" in the UI toggle, not "Wellbeing."

### **Behavior changes (relative to pre-Vibe versions)**
- Behavior is now part of Wellness
- Nausea is now part of Health (combined into the Vomiting card)
- Weight only appears alongside the Health group, not Wellness

### **Group Toggle**
- Defaults to Health when the Trends sub-tab is opened without a `group` query param
- Switching groups updates visible charts only, and clears any active deep-link highlight

### **Scrolling**
- Deep‑linked attribute is scrolled into view and briefly highlighted (~2.5s) when arriving with `section=trends&metric=...`

---

# **7. User Interactions**
Users may:
- Change date range (24H, 7D, 30D, 90D, 1Y)
- Switch sub-tab (Overview / Trends / Patterns / Compare)
- Switch attribute group (Health / Wellness), within the Trends sub-tab
- Scroll vertically
- Navigate back
- Switch tabs

No editing occurs on this screen. Tapping bars does not currently do anything (see Chart Model).

---

# **8. Empty States**
### **No Symptom Data**
An `ObservationCard` with no history shows "No *[attribute]* history available yet."; one with history but nothing in the selected range shows "No data in this range."

### **No Weight History**
The Weight card's own empty state, shown when there's no recorded weight.

### **No Insight**
When fewer than 2 non-skipped check-ins exist among the last 10, the Insight Summary card renders nothing (no card is shown at all) rather than an explicit "Complete more check-ins…" message — the "no insight yet" state is silent, not an explicit empty-state message.

---

# **9. Loading & Error States**
- Skeleton cards while loading
- Charts load independently (each `ObservationCard`/`WeightCard`/`VomitingNauseaCard` fetches its own data)
- If one metric fails: its own card shows its own empty/error copy — cards never block each other
- Insight failure: "Insights unavailable." (deliberately different copy from other cards' failure states, so it doesn't share `MetricCardShell`)

---

# **10. Business Rules**
- **No scoring exists anywhere.**
- **Every symptom counts equally.**
- **No severity weighting.**
- **No deductions.**
- **No baseline comparison.**
- **Every completed day writes explicit rows for all 11 categories.**
- **Not Observed is a real logged value, not a symptom.**
- **Skipped days are visually distinct from missing days.**
- **Raw observation data is never modified after logging.**
- **Future dates never shown.**
- **Weight uses recorded measurements only.**
- **AI summaries describe observations only; never diagnose** — enforced directly in the prompt sent to the model, not just as a design intention.
- **Vomiting and Nausea are counted separately for symptom-count purposes but always displayed together as one chart card.**

---

# **11. Data Requirements**
Retrieve:
- Pet
- Daily Check‑Ins
- Vibe
- Symptom count (persisted integer)
- Observations per attribute per day
- Weight history
- AI summary (Overview sub-tab only; inputs limited to Appetite/Water Intake/Energy/Weight — see Insight Summary Card)

Remove:
- wellness_scores.health_score
- any score‑based fields
- deduction logic
- severity_score usage (field remains unused in schema — migration `0026_vibe_and_symptom_count.sql` explicitly leaves `wellness_scores`, `observation_options.severity_score`, `health_score_deduction`, and `direction_ordinal` in place, untouched)

Charts must respect:
- Selected time window
- Attribute group (Trends sub-tab only)
- Deep‑link state in URL

---

# **12. Acceptance Criteria**
✓ No numeric score displayed anywhere
✓ All charts show raw symptom counts
✓ Attribute groups updated (Nausea added, Behavior moved, Weight separated)
✓ Chart states include Not Observed, Skipped, No Check‑In
✓ Deep‑linking scrolls to correct attribute
✓ Insight summary references only Appetite/Water Intake/Energy/Weight (not Vibe, not symptom count, not other attributes)
✓ Weight chart remains a line graph
✓ Trends is fully read‑only
✓ All data retrieved through entity layer
✓ Charts update smoothly without page reload
✓ Skipped vs missing days visually distinct
✓ Multi‑select categories show 2+ Symptoms correctly
✓ Nausea fully supported (combined with Vomiting in one card)
✓ Behavior fully supported
✓ No scoring logic remains anywhere
✗ Tap interaction on chart bars — not implemented
✗ Patterns and Compare sub-tabs — not implemented (placeholder only)
✗ Calendar button / overflow menu in header — not implemented

---

# **13. Edge Cases**
- First Daily Check‑In completed today
- Only one historical data point
- All values identical
- Missing days
- Skipped days
- Multi‑select symptoms (2+)
- No weight history
- No observations
- AI summary unavailable
- Extremely long histories
- Deep‑link to nonexistent attribute → no crash
- Migrated days with symptom count but no Vibe
- Not Observed vs Normal must remain distinct
- Navigating to Patterns or Compare → shows "coming soon," not a crash or blank screen

---

# **14. Implementation Notes for Claude Code**
- Remove all scoring code paths
- Remove Health Score components
- Use existing chart infrastructure (TrendChart / ObservationCard / VomitingNauseaCard)
- Attribute lists come from canonical config.js
- Vibe icon not displayed on Trends
- Use persisted symptom_count for direction calculations
- Weight remains separate
- Deep‑link state lives in URL
- No Supabase queries directly from UI
- No new chart implementation—configuration only
- severity_score remains in schema but unused
- If building the tap-interaction or Patterns/Compare sub-tabs described earlier, treat them as net-new work, not a gap-fill — nothing today provides a starting point beyond the empty tab shell.

---

## **Revision Notes (V4 → V5)**

This pass corrected the following against the current codebase
(`src/pages/PetTrends.jsx`, `src/components/trends/{ObservationCard,VomitingNauseaCard,WeightCard,InsightSummaryCard,TrendChart}.jsx`,
`src/lib/checkin/trendsClient.js`, `src/components/PetSummaryCard.jsx`) and Supabase schema
(migration `0026_vibe_and_symptom_count.sql`):

1. **Added the missing sub-tab structure.** V4 described one flat trends screen. The real screen has four sub-tabs (Overview/Trends/Patterns/Compare); Patterns and Compare are unbuilt "coming soon" placeholders, and Overview (not the flat "Trends" view V4 assumed) is what most entry points actually land on.
2. **Corrected the Header.** V4 claimed a calendar button and an overflow menu exist. Neither does.
3. **Corrected Entry Points.** V4's "Pet Profile → Trends tab" doesn't reflect that Trends is a top-level route, not nested in Pet Profile, and didn't account for the legacy tabbed-profile redirect.
4. **Corrected the attribute/chart model.** Nausea is not a standalone chart — it's combined with Vomiting into one `VomitingNauseaCard`, contradicting V4's implied 1:1 attribute-to-chart mapping.
5. **Marked Tap Interaction as entirely unimplemented.** V4 presented "tapping a bar reveals observation values" as current behavior; no chart component has any click handler.
6. **Corrected the Insight Summary Card's actual inputs.** V4 said insights reference "Vibe, Symptom count, Attribute-level changes." The AI prompt only ever sees Appetite/Water Intake/Energy/Weight — not Vibe, not the symptom count, not the other 8 attributes. Fixed the doc's own example, which cited "Mobility" — an attribute the card never sees.
7. **Corrected the "No Insight" empty state.** V4 implied an explicit "Complete more check-ins to unlock AI insights." message; the real behavior is that the card simply doesn't render below the 2-check-in threshold.
8. **Clarified Weight card placement** — always in Overview, only under the Health group in Trends (not Wellness).
9. **Noted the UI group label is "Wellness," not "Wellbeing"** (the attribute set itself is still called Wellbeing Attributes in code/config).
