
# **0009 Pet Profile Feature Specification V3**

**Document:** 01 Features/Pet Management/Pet Profile.md  
**Status:** Ready for Implementation  
**Owner:** Product  
**Audience:** Claude Code (Engineering)  

---

## **Purpose**

The **Pet Profile** is the permanent health record for each pet.  
It serves as the **central hub for long‑term health management**, providing identity, baseline, medical information, observations, and historical data.  

Unlike **Home**, which answers *“How are my pets today?”*, and **Pets**, which answers *“Tell me about every pet I manage”*, the **Pet Profile** answers:  
**“Show me everything about this pet’s health story.”**

---

## **Functional Overview**

- The Pet Profile is accessed **directly** from either **Home** or **Pets**.  
- Within **Pets**, the profile expands **inline** via the **Show More** control.  
- The profile is composed of **summary cards**, each routing into existing management modules (Baseline, Conditions, Medications, Food, Vaccinations, Weight, Observations, Timeline, Health Records).  
- Overflow actions (Share, Edit Pet, Rainbow Bridge, Delete Pet) are accessed via the **Show More** menu.

---

## **Functional Requirements**

### **1. Header**

**Display:**
- Back navigation (returns to originating screen: Home or Pets)
- Pet photo (or species avatar if missing)
- Pet name
- Species
- Computed age (derived from birth date)
- **Wellness Chips** (e.g., Healthy, CKD Stage II, IBD, Behavior, Diabetes, Arthritis)

**Behavior:**
- Header data loads immediately when profile opens.
- Overflow menu (via **Show More**) reveals:
  - Share
  - Edit Pet
  - Rainbow Bridge
  - Delete Pet

---

### **2. Summary Cards**

Each card displays a concise summary and routes into its respective management module.

| Card | Display | Interaction | Empty State |
|------|----------|--------------|--------------|
| **Baseline** | Pet’s normal behavior summary | Opens Baseline Management | “Set up your pet’s baseline.” → **Set Up** |
| **Conditions** | Active diagnoses | Opens Condition Management | “No conditions added.” → **Add Condition** |
| **Medications** | Active medication count | Opens Medication Management | “No medications.” → **Add Medication** |
| **Food** | Active food count | Opens Food Management | “No food configured.” → **Add Food** |
| **Vaccinations** | Status (Up to Date / 4 / 5 / Overdue) | Opens Vaccination Management | “No vaccinations recorded.” → **Add Vaccination** |
| **Weight** | Current weight + trend + sparkline | Opens Weight History | Placeholder chart → **Record Weight** |
| **Observations** | Today’s summary (Appetite, Water, Energy, Stool, Activity) | Opens Observation History | “No observations yet.” → **Start Daily Check‑In** |
| **Vet Report** | CTA to export clinic‑ready report | Opens Vet Report Export | — |
| **Timeline** | Total event count | Opens Timeline | “Events will appear as your pet’s health history grows.” |
| **Health Records** | Document count | Opens Health Records | “No records uploaded.” → **Upload Record** |

---

## **Navigation**

### **Entry Points**
- **Home → Pet Profile**  
  (Tap pet card on Home)
- **Pets → Pet Profile**  
  (Tap pet card or expand inline via Show More)

### **Inline Expansion**
- Within **Pets**, tapping **Show More** expands the Pet Profile inline.
- **Show Less** collapses the profile back to the summary card view.

### **Back Navigation**
- Always returns to the originating screen (Home or Pets).
- Bottom navigation remains visible across all screens:
  - Home | Pets | Menu

---

## **Empty States**

Each card defines its own zero state and CTA.  
No partial data should appear during loading.

---

## **Loading States**

Display skeleton placeholders for:
- Header
- Wellness summary
- Summary cards

Do not display partially loaded values.

---

## **Error States**

- **Unable to load profile:** show inline error with **Retry** and **Back**.  
- Individual cards may display “Unavailable” without blocking the rest of the profile.

---

## **Business Rules**

- Computed age derives from birth date.  
- Life stage is derived and not editable.  
- Condition count = active diagnoses.  
- Medication count = active medications.  
- Food count = active foods.  
- Vaccination status derives from active vaccination records.  
- Weight summary uses latest recorded weight.  
- Observation summary reflects latest Daily Check‑In.  
- Timeline contains all historical health events.  
- Health Records contain uploaded veterinary documentation.  
- Deleting or memorializing a pet is initiated from the overflow menu.  
- Shared pets respect permission model.  
- Memorial pets remain viewable; editing depends on permissions.  
- Summary counts must never be negative.  
- Wellness metrics require available scoring data.

---

## **Validation Rules**

- Profile data must belong to the authenticated owner or authorized co‑owner.  
- Only active medications and foods contribute to counts.  
- Weight trend requires ≥ 2 recorded weights.  
- Derived values (age, life stage, counts, trends) must be computed dynamically.  
- No redundant data persistence.

---

## **Data Requirements**

**Pet**
- Photo  
- Species  
- Breed  
- Sex  
- Birth Date  
- Age (derived)  
- Life Stage (derived)  
- Conditions  
- Medications  
- Food  
- Vaccinations  
- Weight History  
- Observation Summary  
- Wellness Scores  
- Timeline Events  
- Health Records  
- Last Updated  
- Share Metadata  

---

## **Implementation Notes for Claude Code**

- Preserve approved visual design (spacing, typography, colors, iconography).  
- Implement as a composition of summary cards that route into existing modules.  
- Route all data access through the **entity client layer** — never query Supabase directly from UI components.  
- Use existing data model and relationships for pet identity, onboarding, medications, observations, wellness scores, and health records.  
- Derive computed values dynamically.  
- Load independent sections separately so one failure doesn’t block rendering.  
- Follow Navigation & IA: Pet Profile is the permanent health record reached from both Home and Pets.  
- Inline expansion (Show More / Show Less) must preserve layout and accessibility.  

**Before coding:**
1. Inspect Add Pet, Pet Profile, Daily Check‑In, and data layer implementations.  
2. Identify reusable components.  
3. Confirm baseline fields exist or require migration.  
4. Propose smallest clean implementation plan in plain English.  
5. Then implement.

**After coding:**
- Run lint/type/tests.  
- Summarize files changed.  
- Note migrations created.  
- Document follow‑up items or assumptions.

---

## **Acceptance Criteria**

A user can:
- View complete pet identity and wellness summary.  
- Navigate directly from Home or Pets to Pet Profile.  
- Expand and collapse profile inline via Show More / Show Less.  
- Access Baseline, Conditions, Medications, Food, Vaccinations, Weight, Observations, Timeline, and Health Records.  
- Share, edit, delete, or memorialize a pet via overflow menu.  
- Return to originating screen.  
- Use screen readers to identify each card and action.

---

## **Edge Cases**

- Pet without photo → show species avatar.  
- Pet without breed → omit field gracefully.  
- Pet without medications → show empty state.  
- Pet with multiple diagnoses → display all chips.  
- Pet without today’s check‑in → show “No check‑in yet.”  
- Pet with only one weight entry → show current weight, no trend.  
- Pet with no health records → show upload prompt.  
- Shared pet → respect permission model.  
- Memorial pet → profile viewable, editing limited.  
- Network reconnect after failure → reload profile.  
- Large number of events → paginate Timeline.

---

This V3 version now fully reflects:
- The **direct navigation model** (Home → Pet Profile, Pets → Pet Profile).  
- The **inline expansion behavior** shown in your screenshots.  
- The **modular card architecture** and **overflow actions**.  
- All new data and business logic introduced in the Pet Profile update.  

Would you like me to produce a **side‑by‑side diff summary** next (V2 vs V3) to show exactly what changed for engineering handoff?