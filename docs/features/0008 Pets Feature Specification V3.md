# **0008 Pets Feature Specification V3**

**Document:** `01 Features/Pets/Pets.md`

**Status:** Reconciled to current implementation as of 2026-07-18 (see Revision Notes)

**Owner:** Product

**Audience:** Claude Code (Engineering)

**Purpose:**

The Pets screen is the owner's permanent overview of every pet in their care.

Unlike Home, which answers **"How are my pets today?"**, the Pets screen answers:

**"Tell me about every pet I manage."**

It serves as the entry point into each pet's long‑term health profile while providing a high‑level summary of **today's Wellbeing observations only**.

This screen also separates active pets from Rainbow Bridge pets, includes a third section for pets shared by a sitter, and allows new pets to be added.

This feature aligns with Navigation & Information Architecture by making **Pets** the central destination for long‑term pet management.

---

# **Functional Requirements**

## **1. Screen Header**

Display:
- Paw icon
- Title: **My Pets**
- Subtitle: *All the pets in your care, in one place.*

Top‑right action:
- **Add Pet** (primary button, plus icon)
- Launches the existing Add Pet workflow.

---

## **2. Active Pets Section**

Header: **ACTIVE PETS**

Supporting text: *Pets you monitor every day*

Show only pets where:
- `is_memorial = false`

Ordering:
- Most recently added pet first (`entities.Pet.list('-created_date')`) — **not** "active pets first, then `created_at` descending" as a two-part rule; there's only one active-pets query and it's a flat, single sort.

---

## **3. Pet Card (Active Pets)**

Each active pet's card is the shared `PetProfileContent` component in its collapsed state (`context="pets"`, rendered inside `ExpandablePetProfileCard`) — the same component that powers the standalone Pet Profile page. This has real consequences for what a collapsed card can and can't show, detailed below.

### **Identity**
- Photo
- Name
- Breed
- Species
- Sex
- Age (calculated, never stored)

### **Status Chips**
Condition chips from `pet.conditions`, rendered one per entry that exists — there is **no fixed enum of example values and no "Healthy" fallback chip** on this screen. If a pet has zero conditions logged, **no chip renders at all** here. ("Healthy" as a fallback badge is a Home-screen-only behavior, on a different component — `PetSummaryCard.jsx` — not shared with this screen.)

### **Medication Chip — does not exist on this screen**
The collapsed Pets-tab card has no medication-count chip. `PetProfileContent`'s collapsed identity block renders only photo/name/species/breed/sex/age/condition chips — the medication count only appears later, inside the **expanded** Medications nav card (reachable via "Show More," see §6 below), not as a summary chip on the collapsed card. (A medication-count chip does exist on Home's `PetSummaryCard`, a different, unrelated component — don't assume the two screens share this element.)

### **Today's Logs (Wellbeing Only)**
The Pets screen shows **only Wellbeing attributes**, per the v5 model and surface‑area rules:

**Wellbeing attributes shown on PETS:**
- Energy
- Mobility
- Breathing
- Skin/Itching
- Behavior

Each chip displays:
- Icon (none currently — chips are text + direction indicator only, no per-attribute icon; verify before assuming icons exist)
- Category label
- Today's directional state, compared to yesterday (up/down/equal/unavailable), not a raw value

### **Value Rules**
- **No check‑in yet today:** chip shows **"No check‑in yet"** — confirmed exact copy (`AttributeTrendChip.jsx`, `state === 'no-checkin'`).
- **Fetch failed for this attribute:** chip shows **"Unable to load"** (`state === 'unavailable'`) — not previously documented.
- **Unknown:** if today's check‑in exists but no value was logged for that attribute.
- **Not Observed:** if explicitly selected during check‑in.
- **Never collapse Unknown or Not Observed into Normal** (Product Principle #6: *Unknown ≠ Normal*).

### **Card interaction — corrected, this is the most significant change in this revision**
There is **no chevron and no full-card tap target that navigates to Pet Profile.** Instead, a "Show More" toggle at the bottom of the card **expands the card in place** — no navigation occurs. Expanding reveals the same action-pill row (Share/Edit Pet/Rainbow Bridge/Delete Pet) and summary cards (Baseline/Conditions/Medications/Food/Vaccinations/Weight/Observations/Vet Report/Timeline/Health Records) that the standalone Pet Profile page shows — it's the identical shared component, just embedded inline instead of on its own route. "Show Less" collapses it back to the state described above.

---

## **4. Shared with Me Section — not previously documented**

Displayed only when the signed-in user has active **sitter** access (`PetSitterAccess`/`PetSit`, via `getSharedPetsForUser()`) to at least one pet they don't own — **not** co-owned pets, which appear in Active Pets like any owned pet.

Header: **SHARED WITH ME**

Rows use a separate, deliberately lighter `SharedPetRow` component — a bare identity link (photo/species icon, name) with **no chip UI of any kind**: no condition chips, no Wellbeing chips, no medication count. This is a known, undecided gap, not a design decision documented anywhere as intentional. Tapping a row **does** navigate — to that pet's Trends screen (`/pet/:petId/trends`), not Pet Profile, and not an inline expansion like Active Pets get.

---

## **5. Rainbow Bridge Section**

Displayed only when memorial pets exist.

Header: **RAINBOW BRIDGE**

Supporting text: *Pets who will always be with us*

Memorial pet cards use the same `ExpandablePetProfileCard`/`PetProfileContent` component as Active Pets, so they behave identically: identity + condition chips collapsed, "Show More" expands inline (not a navigation) to reveal a reduced action-pill row (Share/Edit Pet/Delete Pet — no Rainbow Bridge action, since the pet is already memorialized) plus the same summary cards.

Memorial pet cards display:
- Identity
- Status chips
- **In Memory** label with Rainbow Bridge icon (purple)

Do **not** display:
- Today's Logs
- Vibe
- Symptom count
- Any daily check‑in data

This part of the original spec is accurate — confirmed via `PetProfileContent.jsx`'s `isMemorial` branch, which skips straight to the "Forever in our hearts" block and never renders the Wellbeing-chips row.

---

## **6. Add Pet**

Selecting **Add Pet** launches the existing Add Pet workflow (`AddPetDialog`, `returnTo="/pets"`).

After successful creation:
- Return to Pets
- Refresh list
- Scroll newly created pet into view (matches the same highlight/scroll pattern used elsewhere on this screen for deep-linked pets)

---

## **7. Expanded Card Contents (new section — not in the prior draft)**

Since "Show More" expands the card in place rather than navigating, it's worth documenting what that reveals, since it's effectively part of this screen's UI even though it's implemented as shared Pet Profile content:

- Action pills: Share, Edit Pet, Rainbow Bridge (Active only), Delete Pet
- Summary cards, in order: Baseline, Conditions (opens Edit Pet sheet — no separate Condition Management screen), Medications, Food, Vaccinations, Weight, Observations (only tappable before today's check-in exists), Vet Report, Timeline, Health Records (links to the Bloodwork tab)
- Delete Pet is a two-step, co-owner-aware confirmation flow

See `docs/features/0009 Pet Profile Feature V4.md` for the full spec of this shared content — this document doesn't duplicate it in detail, just notes that it's reachable from here.

---

# **UI Components**

- Header
- Primary Button
- Section Header
- Pet Card (shared `PetProfileContent`, collapsed + expanded states)
- Status Chips
- Today's Log Chips (Wellbeing only)
- Show More / Show Less toggle — **not** a Chevron; there is no separate chevron affordance
- `SharedPetRow` (bare identity link, Shared with Me section only)
- Rainbow Bridge Card
- Empty State
- Loading Skeleton
- Error Banner

---

# **User Interactions**

### **Tap "Show More" on an Active or Rainbow Bridge Card**
Expands the card in place. No navigation occurs.

### **Tap a Shared with Me Row**
Navigate: **Pets → Trends** (not Pet Profile).

### **Tap Add Pet**
Launch Add Pet dialog.

### **Return from Add Pet**
Reload pets.
Highlight newly added pet.

### **Pull to Refresh**
Refresh:
- Pets list
- Shared-with-me list
- Today's Wellbeing logs (each fetched independently — a failure in one doesn't block the others)

---

# **Navigation**

Bottom Navigation:
- Home
- **Pets (active)**
- Menu

Navigation Flow — corrected:
- Home pet-card tap → **Trends** (not Pet Profile)
- Pets Active/Rainbow Bridge card → **inline expansion, no navigation** (not "Pets → Pet Profile")
- Pets Shared-with-Me row → **Trends** (not Pet Profile)
- Pets → Add Pet → Pet Onboarding → Pets

The standalone `/pet/:petId` Pet Profile page (as opposed to the inline-expanded content on this screen) is reached only via two flows unrelated to this screen: completing Pet Onboarding's "start check-in" link, and accepting a co-owner invite. Neither Home nor Pets links to it directly.

---

# **Empty States**

### **No Pets**
Display:
- Illustration
- Headline: **No pets yet**
- Body: *Add your first pet to begin tracking their health.*
- Primary CTA: **Add Pet**

Hide:
- Active Pets section
- Shared with Me section
- Rainbow Bridge section

### **No Shared with Me Pets**
Hide section entirely (not previously documented, but matches the same "hide if empty" pattern as Rainbow Bridge).

### **No Rainbow Bridge Pets**
Hide section entirely.

### **Pet Has No Medications**
Not applicable to this screen's collapsed card (see §3 — no medication chip exists here to hide). Applies only inside the expanded Medications nav card.

### **No Logs Today**
Display Wellbeing categories with:
- **"No check‑in yet"**

Do not imply Normal when no data exists.

---

# **Loading States**

Display skeleton cards including:
- Photo
- Name
- Status chips
- Today's Log chips

Do not shift layout after loading.

---

# **Error States**

### **Unable to load pets**
Display inline error.
Primary button: **Retry**

### **Unable to load today's logs**
Display: **"Unable to load"** — not "Unavailable," which was the prior draft's wording (`AttributeTrendChip.jsx`'s actual copy for the `unavailable` state).
Pet remains selectable/expandable.

---

# **Business Rules**

- Only active pets appear in Active Pets.
- Only pets with sitter access (not co-ownership) appear in Shared with Me.
- Only memorial pets appear in Rainbow Bridge.
- Age is calculated dynamically.
- Life stage is **not** displayed anywhere on this screen — confirmed not present in `PetProfileContent.jsx`'s collapsed or expanded views, despite being listed as a "Computed" data requirement in the prior draft.
- There is no medication count on this screen's cards (see §3) — the prior draft's "Medication Chip" rule doesn't apply here.
- Today's Logs summarize **today's Wellbeing observations only**.
- PETS does **not** display Vibe.
- PETS does **not** display Health attributes or Weight (on the collapsed card — Weight does appear inside the expanded Weight nav card).
- Active/Rainbow Bridge cards expand in place via "Show More" — they are **not** tappable as a single navigation target, and there is no chevron.
- Shared with Me rows **are** a single navigation target (to Trends), with no chip UI and no expansion.
- Pet Profile (in the sense of the full detail view) is reached through the expanded card on this screen, not a separate destination navigated to from a tap.
- No editing occurs from the collapsed card view; editing happens inside the expanded card via the action pills and nav cards.
- Delete Pet is available from the expanded card's action-pill row, not a separate menu — and is a two-step, co-owner-aware confirmation flow, not a single-step action.

---

# **Validation Rules**

Pet must have:
- Name
- Species
- Sex
- Birth precision

Photo optional.
Breed optional.

Today's Logs:
- Show Wellbeing attributes only
- Follow No check‑in yet / Unknown / Not Observed rules

---

# **Data Requirements**

### **Pet**
- id
- photo_url
- name
- species
- breed
- sex
- birth_date
- birth_date_precision
- conditions
- is_memorial

### **Shared with Me**
- Sitter access records (`PetSitterAccess`/`PetSit`) resolving to which pets the signed-in user can view but doesn't own

### **Today's Wellbeing Summary**
- energy
- mobility
- breathing
- skin_itching
- behavior

### **Computed**
- age

No additional database changes required.

---

# **Acceptance Criteria**

A user can:
- ✓ View all active pets
- ✓ View today's Wellbeing summary
- ✓ View condition chips
- ✓ Expand a card in place to reach full Pet Profile content (Baseline/Conditions/Medications/Food/Vaccinations/Weight/Observations/Vet Report/Timeline/Health Records)
- ✓ Add a new pet
- ✓ Return to Pets after pet creation
- ✓ View pets shared by a sitter, separately, with a bare identity link only
- ✓ View Rainbow Bridge pets separately
- ✓ Expand memorial pet cards the same way as active ones
- ✓ Refresh the screen
- ✓ Use screen readers to identify each card and its expand/collapse state

---

# **Edge Cases**

- Pet without photo
- Pet without breed
- Pet without any conditions logged (no chip renders at all — not "shows a Healthy chip")
- Pet with multiple diagnoses
- Pet without today's check‑in
- Pet without today's Wellbeing logs
- Large number of pets
- Only Shared with Me pets, no owned pets
- Only Rainbow Bridge pets
- Only one pet
- No pets
- Very long names
- Deleted pet while screen open
- Network reconnect after failure

---

# **Implementation Notes for Claude Code**

- Preserve the existing visual design.
- Route all data access through the entity client/data layer.
- Do **not** query Supabase directly from UI components.
- PETS must **not** display Vibe or Health attributes on the collapsed card.
- PETS must display **only Wellbeing attributes** on the collapsed card.
- Calculate age dynamically.
- There is no medication chip or "Healthy" fallback chip on this screen — don't add one without a spec update; those belong to Home's `PetSummaryCard` only.
- The collapsed/expanded card behavior is shared with the standalone Pet Profile page via `PetProfileContent.jsx` — changes to one affect the other. Don't fork this component to make Pets-specific tweaks; extend the shared component with a `context` branch instead, matching the existing `context="pets"`/`context="profile"` pattern.
- Refresh list automatically when returning from Add Pet.
- Keep Rainbow Bridge and Shared with Me sections read‑only from this screen's own controls (editing happens via the expanded card's action pills, for Active/Rainbow Bridge pets only — Shared with Me pets offer no editing surface here at all).
- Ensure loading, error, and empty states preserve layout.

---

## **Revision Notes (V2 → V3)**

This pass corrected the following against the current codebase
(`src/pages/Pets.jsx`, `src/components/ExpandablePetProfileCard.jsx`,
`src/components/PetProfileContent.jsx`, `src/components/AttributeTrendChip.jsx`,
`src/components/PetSummaryCard.jsx` for contrast). The prior V2 draft was
labeled "Ready for Implementation" — a forward-looking spec, not an
as-built reconciliation like the sibling `0004`/`0007`/`0009`/`0010`/`0013`/`0014`
documents — and several of its specifics were never actually built as
written:

1. **Corrected card-tap navigation — the most significant fix.** V2 said the entire card is tappable and navigates to Pet Profile, with a chevron affordance. Neither exists: Active/Rainbow Bridge cards expand **in place** via "Show More," with no navigation and no chevron at all.
2. **Corrected the Navigation Flow section** to match: "Home → Pet Profile" and "Pets → Pet Profile" are both wrong. Home goes to Trends; Pets expands inline.
3. **Added the missing Shared with Me section entirely** — V2 only described Active Pets and Rainbow Bridge, omitting a real, existing third section (sitter-shared pets, bare identity link, no chips, links to Trends).
4. **Corrected Status Chips.** V2 implied a semi-fixed example set including "Healthy" as a fallback value. There's no fallback chip on this screen at all — if a pet has no conditions, nothing renders. ("Healthy" is a real fallback, but only on Home's unrelated `PetSummaryCard`.)
5. **Corrected the Medication Chip claim.** V2 said every card shows a medication count chip. The collapsed Pets-tab card never shows one — that only exists inside the expanded Medications nav card.
6. **Corrected the Error State copy** ("Unavailable" → "Unable to load," confirmed against `AttributeTrendChip.jsx`).
7. **Removed "Life Stage" from Data Requirements/Business Rules** — not displayed anywhere on this screen, despite being listed as a computed field.
8. **Added §7 (Expanded Card Contents)**, since "Show More" surfaces real, substantial screen content (the full Pet Profile card set) that V2 didn't acknowledge existed at all, having assumed a separate navigation target instead.
