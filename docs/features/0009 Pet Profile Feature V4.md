
# **0009 Pet Profile Feature Specification V4**

**Document:** 01 Features/Pet Management/Pet Profile.md
**Status:** Reconciled to current implementation as of 2026-07-18 (see Revision Notes)
**Owner:** Product
**Audience:** Claude Code (Engineering)

---

## **Purpose**

The **Pet Profile** is the permanent health record for each pet.
It serves as the **central hub for long‑term health management**, providing identity, baseline, medical information, observations, and historical data.

Unlike **Home**, which answers *"How are my pets today?"*, and **Pets**, which answers *"Tell me about every pet I manage"*, the **Pet Profile** answers:
**"Show me everything about this pet's health story."**

---

## **Functional Overview**

- The Pet Profile is implemented as one shared component (`PetProfileContent`), rendered exactly one way today: **inline, inside the Pets tab** (`context="pets"`) — expands in place via **Show More**, no page navigation. A second rendering, as its own page at `/pet/:petId` (`context="profile"`), used to exist but was unreachable dead code (nothing ever linked to it after spec `0023` retired the standalone page) and was deleted in spec `0026`. `/pet/:petId` (`PetProfile.jsx`) still exists purely as a compatibility redirect to `/pets` for old bookmarks/links — it renders no Pet Profile content of its own.
- The profile is composed of **summary cards**, each routing into existing management modules (Baseline, Conditions, Medications, Food, Vaccinations, Weight, Observations, Vet Report, Timeline, Health Records).
- **Share, Edit Pet, Rainbow Bridge, and Delete Pet** are **always-visible action pills** in a row once the profile is expanded — they are not hidden behind an overflow/"..." menu.

---

## **Functional Requirements**

### **1. Header**

**Display:**
- Pet photo (or species icon avatar if missing)
- Pet name
- Species, breed, and sex (e.g. "Dog · Golden Retriever · Male")
- Computed age (derived from birth date)
- **Condition chips** — one chip per entry in `pet.conditions` (e.g. CKD, IBD, Diabetes, Arthritis). Rendered only when at least one condition exists; there is no "Healthy" default chip and no fixed enum of chip values — any string in `pet.conditions` renders as its own chip.

**Wellbeing chips:** below the identity block, the collapsed Pets-tab card shows five directional Wellbeing chips (Energy, Mobility, Breathing, Skin/Itching, Behavior), each tappable and each deep-linking to that attribute's Trends chart. No score is shown here. (A separate Vibe icon + Weight strip used to render here on the now-deleted standalone page context — see Functional Overview above; it never appears in the current app.)

**Behavior:**
- Header identity data loads first and independently of the rest of the profile.
- **Show More / Show Less** toggles whether the action-pill row and every summary card below render at all — it does not open a menu; everything it reveals is visible inline immediately.
- Once expanded, the action-pill row (Share / Edit Pet / Rainbow Bridge / Delete Pet) is always visible directly under the Wellbeing chips — not behind a further tap.

---

### **2. Summary Cards**

Each card displays a concise summary and routes into its respective management module. Cards that fail to load show "Unable to load" in place of their subtitle but do not block the rest of the profile from rendering.

| Card | Display | Interaction | Empty State |
|------|----------|--------------|--------------|
| **Baseline** | Pet's normal behavior summary | Opens the Baseline page (`/pet/:petId/baseline`) | "Set up your pet's baseline." → **Set Up** (also shows an **In Progress** state if onboarding was started but not completed) |
| **Conditions** | Active diagnoses | Opens **Edit Pet** sheet — there is no separate Condition Management screen; conditions are edited as chips within Edit Pet | "No conditions added." → **Add Condition** |
| **Medications** | Active medication count | Opens the Medications page (`/pet/:petId/medications`) | "No medications." → **Add Medication** |
| **Food** | Active food count | Opens the Food screen (`/pet/:petId/food`) | "No food configured." → **Add Food** |
| **Vaccinations** | Status (Up to Date / *current*/*total* / Overdue) | Opens the Vaccinations page (`/pet/:petId/vaccinations`) | "No vaccinations recorded." → **Add Vaccination** |
| **Weight** | Current weight + up/down/steady delta + sparkline | Opens the Pet Symptoms/log screen (`/pet/:petId/symptoms`) — there is no dedicated "Weight History" screen, and no quick-log shortcut either (a `WeightQuickLogSheet` shortcut existed in code but was unreachable dead code, deleted in spec `0026`) | Placeholder dashed-line chart → **Record Weight** |
| **Observations** | Today's five observation chips (Appetite, Water, Energy, Stool, Activity) when a check-in exists for today | **Always interactive.** Before today's check-in exists, tapping starts one; once logged, tapping reopens today's entry for editing instead of becoming a static display (spec `0026`) | "No observations yet." → **Start Daily Check-In** |
| **Vet Report** | CTA to export clinic‑ready report | Opens Vet Report Export (`/pet/:petId/export`) | — |
| **Timeline** | Total event count | Opens Timeline (`/pet/:petId/timeline`) | "Events will appear as your pet's health history grows." |
| **Health Records** | Document count | Opens the Health Records page (`/pet/:petId/health-records`) — still backed by the same Bloodwork data/component underneath, so the count always matches what's shown there | "No records uploaded." → **Add Record** |

---

## **Navigation**

### **Entry Points**

Tapping a pet card is **not** how this page is reached — on both **Home** and **Pets**, tapping a pet card navigates to that pet's **Trends** screen (`/pet/:petId/trends`), not to the Pet Profile.

- **Pets → Pet Profile (inline):** tapping **Show More** on a pet's card in the Pets tab expands the shared `PetProfileContent` component **in place**, inside the Pets tab itself — this is the only way Pet Profile content is ever reached today.
- **`/pet/:petId` (compatibility redirect only, renders no Pet Profile content):** Completing **Pet Onboarding**'s "start check-in" action and accepting a **co-owner invite** (`AcceptInvite.jsx`) both still link here, but the route just bounces to `/pets` (spec `0026`) — same as any old bookmark/link.

### **Inline Expansion**

- Within **Pets**, tapping **Show More** expands the Pet Profile content inline (`ExpandablePetProfileCard`, `context="pets"`).
- **Show Less** collapses it back to the identity + Wellbeing-chips summary view.

### **Back Navigation**

- `/pet/:petId` always redirects to **`/pets`** (with that pet expanded there), regardless of how it was reached.
- Bottom navigation remains visible across all screens:
  - Home | Pets | Menu

---

## **Empty States**

Each card defines its own zero state and CTA.
No partial data should appear during loading.

---

## **Loading States**

Display skeleton placeholders for:
- Header (identity block)
- Wellbeing chips
- Summary cards

Do not display partially loaded values.

---

## **Error States**

- **Unable to load profile:** the profile body shows an inline "Unable to load profile." message with a **Retry** button. Back navigation remains available via the persistent page header at all times — it is not a separate button inside this error state.
- Individual cards may display **"Unable to load"** in place of their subtitle without blocking the rest of the profile.

---

## **Business Rules**

- Computed age derives from birth date.
- Condition count = number of entries in `pet.conditions`; conditions are edited via the Edit Pet sheet, not a dedicated Condition Management screen.
- Medication count = active medications.
- Food count = active foods (excluding any with an `end_date` in the past).
- Vaccination status derives from active vaccination records.
- Weight summary uses the latest recorded weight; a trend/sparkline only renders once at least 2 weights are recorded. Weight is logged independently of the Daily Check-In flow.
- There is no numeric score, ring, or trend label anywhere on this screen; Vibe and Weight are two independent signals that never combine.
- The Observations card reflects only today's check-in — once logged, it shows a summary of today's five observation chips and stays tappable, reopening today's entry for editing (spec `0026`).
- Timeline contains all historical health events.
- Health Records reuses the Bloodwork tab's data — there is no separate Health Records store.
- Sharing, editing, moving to Rainbow Bridge, or deleting a pet are initiated from the always-visible action-pill row shown once the profile is expanded — none of these are behind an overflow menu.
- Deleting a pet is a two-step confirmation flow (warning dialog, then type-the-pet's-name-to-confirm) that calls the `delete-pet` Edge Function. The warning copy is co-owner-aware: a sole owner is told the pet and all its data will be permanently deleted; a primary owner with a linked co-owner is told ownership will transfer to that co-owner instead; a non-primary co-owner is told they'll simply be removed from the pet, which the primary owner keeps.
- Shared pets respect the permission model.
- Memorial pets remain viewable; editing is limited (no action-pill row except Share, Edit Pet, and Delete Pet — Rainbow Bridge is not offered again once a pet is already memorialized).
- Summary counts must never be negative.

---

## **Validation Rules**

- Profile data must belong to the authenticated owner or authorized co‑owner.
- Only active medications and foods contribute to counts.
- Weight trend requires ≥ 2 recorded weights.
- Derived values (age, counts, weight delta) must be computed dynamically, not persisted redundantly.
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
- Conditions
- Medications (active)
- Food (active)
- Vaccinations
- Weight History
- Today's Vibe status (`daily_check_ins.status`, today's date only)
- Today's observation values (Appetite, Water, Energy, Stool, Activity)
- Timeline event count
- Health Records count (from Bloodwork)
- Co-owner links (used to determine delete-flow messaging and permissions)
- Last Updated
- Share Metadata

---

## **Implementation Notes for Claude Code**

- Preserve approved visual design (spacing, typography, colors, iconography).
- Implement as a composition of summary cards that route into existing modules.
- Route all data access through the **entity client layer** — never query Supabase directly from UI components.
- Use the existing data model and relationships for pet identity, onboarding, medications, observations, Vibe status, weight, and health records. There is no wellness-score table or field involved in this screen.
- Derive computed values dynamically.
- Load independent sections separately so one failure doesn't block rendering (the codebase splits this into a fast "summary" load and a slower "full details" load, deferred until the card is actually expanded).
- Follow Navigation & IA: the Pet Profile is the permanent health record, reached primarily via inline expansion in Pets (not via pet-card taps on Home/Pets, which go to Trends instead).
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
- View complete pet identity and Wellbeing chips.
- Reach the Pet Profile by expanding a pet's card inline in Pets — the only path today.
- Expand and collapse the profile inline via Show More / Show Less.
- Access Baseline, Conditions (via Edit Pet), Medications, Food, Vaccinations, Weight, Observations, Vet Report, Timeline, and Health Records.
- Reopen and edit today's Daily Check-In at any point after completing it, via the Observations card (spec `0026`).
- Share, edit, delete, or memorialize a pet via the always-visible action-pill row.
- Use screen readers to identify each card and action.

---

## **Edge Cases**

- Pet without photo → show species icon avatar.
- Pet without breed → omit field gracefully.
- Pet without medications → show empty state.
- Pet with multiple diagnoses → display all condition chips.
- Pet without today's check‑in → Observations card shows "No observations yet." and is the tap target to start Daily Check-In; once completed, the same card becomes the tap target to reopen and edit it (spec `0026`).
- Pet with only one weight entry → show current weight, no trend/sparkline.
- Pet with no health records → show "Add Record" prompt.
- Shared pet → respect permission model.
- Memorial pet → profile viewable, editing limited (no Rainbow Bridge action offered again).
- Network reconnect after failure → reload profile via pull-to-refresh or the header's Retry button.
- Large number of events → paginate Timeline.

---

## **Revision Notes (V3 → V4)**

This pass corrected the following against the current codebase
(`src/components/PetProfileContent.jsx`, `src/pages/PetProfile.jsx`,
`src/components/ExpandablePetProfileCard.jsx`, `src/components/PetSummaryCard.jsx`,
`src/pages/AcceptInvite.jsx`, `src/pages/PetOnboarding.jsx`) and Supabase schema
(`daily_check_ins.status`, migration `0026_vibe_and_symptom_count.sql`):

1. **Removed all retired-scoring content.** V3 still required a "Wellness Chips" header element, listed "Wellness Scores" as a data requirement, and said "Wellness metrics require available scoring data." None of this exists — the screen shows a Vibe icon (great/off/tough/skipped) and a separate Weight value, and the two never combine into a score.
2. **Corrected Entry Points.** V3 claimed both Home and Pets navigate directly to Pet Profile on pet-card tap. In current code, pet-card taps on both screens go to **Trends** instead; the standalone `/pet/:petId` page is only reached via the post-onboarding "start check-in" link and the accept-co-owner-invite redirect. The Pets-tab "Show More" inline expansion (which V3 also described) is the actual primary path to Pet Profile content.
3. **Corrected Back Navigation.** V3 claimed the back button returns to "the originating screen (Home or Pets)." It always returns to `/pets`.
4. **Corrected the overflow-menu claim.** V3 said Share/Edit Pet/Rainbow Bridge/Delete Pet live behind a "Show More" overflow menu. They're an always-visible action-pill row shown once the profile is expanded — "Show More" instead controls whether the whole detail section (actions + cards) renders at all.
5. **Corrected Conditions card routing.** V3 implied a dedicated Condition Management screen. There isn't one — conditions are edited via the Edit Pet sheet.
6. **Corrected Weight card routing.** V3 said it opens "Weight History." It opens the Pet Symptoms/log screen; there is no screen by that name.
7. **Corrected Observations card interactivity.** V3 said it always "Opens Observation History." There is no such screen — the card is only tappable (to start Daily Check-In) when today has no check-in yet; once logged, it's a static summary.
8. **Corrected Health Records routing and empty-state label.** V3 implied a dedicated store and said "Upload Record"; it reuses the Bloodwork tab's data and the button reads "Add Record."
9. **Added the two-step, co-owner-aware Delete Pet confirmation flow**, previously undocumented.
10. **Corrected minor copy** ("Unavailable" → "Unable to load"; "No check-in yet." → "No observations yet." / "Check in today").

## **Revision Notes (2026-07-31 update, spec `0026`)**

This pass corrected the doc against `docs/features/0026_Edit_Todays_CheckIn_Specification_v1.md`, which found that item 2 and item 7 above were themselves already stale:

1. **The standalone `/pet/:petId` page never actually rendered Pet Profile content** — spec `0023` (2026-07-28) had already turned it into a bare redirect to `/pets`, but this doc still described `context="profile"` as a live second rendering with its own Vibe icon + Weight strip + quick weight-log sheet. That code was fully unreachable and was deleted (spec `0026`) — this doc's Functional Overview, Header, Navigation, Loading States, Acceptance Criteria, and Edge Cases sections all still described it and have been updated.
2. **The Observations card is no longer read-only once checked in.** It now stays tappable and reopens today's entry for editing, closing a gap the canonical check-in spec (`0012`, line 226) had already assumed was covered ("existing edit/re-save behavior should apply") but that no reachable UI actually provided.
