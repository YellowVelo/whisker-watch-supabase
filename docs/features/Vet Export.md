# **Vet Export**

**Document:** `Vet Export.md`

**Status:** New as-built documentation, written 2026-07-18. This feature
was previously fully undocumented in `docs/` — the code itself references
a "Vet Export Feature Spec v2" (`src/pages/VetExport.jsx`'s file comment,
`supabase/functions/generate-vet-report/index.ts`'s comments cite "spec
§4.2," "§5.1," "§7," "§9") that **does not exist anywhere in this repo**,
under any filename, in `docs/features/`, `docs/Archive/`, or
`docs/review-features/`. Either it was never checked in, or it lived
outside this repo (e.g. a doc tool/chat thread) and was lost. This
document is the first written Vet Export spec actually saved to the repo,
reconstructed from the current implementation rather than corrected from
a prior draft. Updated the same day with a "Proposed Enhancements"
section (see below), reconciling a separately-sourced product-review
document against this implementation — that document turned out to
describe the feature's pre-2026-07-11 state, so most of its findings were
already resolved; the genuinely-still-open parts are recorded there.
Verified against `src/pages/VetExport.jsx`,
`src/lib/checkin/vetReportClient.js`,
`supabase/functions/generate-vet-report/index.ts`,
`src/components/PetProfileContent.jsx`, and `src/components/CareMenu.jsx`.

**Owner:** Product

**Audience:** Claude Code (Engineering)

**Purpose:**

Vet Export generates a clinic-ready PDF summarizing one pet's health
history — wellness scores, baselines, daily observations, weight trend,
medications, vaccinations, diet, and bloodwork — so an owner can hand a
vet a single document instead of describing months of at-home tracking
verbally. It answers **"Can I bring my vet a summary of everything I've
logged?"**

The report is generated entirely server-side, on demand, per request —
nothing is pre-computed or cached. There's no stored "reports" table;
every download re-queries live data and re-renders a fresh PDF.

---

# **Functional Requirements**

## **1. Entry Point**

The only way to reach Vet Export today is the **"Vet Report"** nav card
inside the expanded Pet Profile content (`PetProfileContent.jsx`,
shared by both the standalone `/pet/:petId` page and the Pets screen's
"Show More" expansion — see `docs/features/0009 Pet Profile Feature V4.md`
and `docs/features/0008 Pets Feature Specification V3.md`). It links
directly to `/pet/:petId/export`. This entry point is independent of
`CareMenu` — CareMenu itself has no "Vet Report" item.

## **2. Vet Export Page**

`src/pages/VetExport.jsx`, route `/pet/:petId/export`:

- Fetches only minimal pet identity (`entities.Pet.get(petId)`) for the header — name, photo, breed. It does **not** fetch report contents itself; that's entirely the Edge Function's job.
- Header: Back button, and a `CareMenu` trigger (hamburger icon) — this instance of CareMenu is used for lateral navigation to *other* pet sections (History, Trends, Meds, Baseline, Food, Labs, Vaccines, Sitter, AI, Menu, About) from this page, not as a way to reach Vet Export itself.
- Body: pet identity block, then a single card — "Vet Report" heading, a one-line description ("Generate a clinic-ready PDF with {pet's name}'s wellness history, observations, medications, vaccinations, diet, weight trend, and bloodwork"), and a **Download Report** button.
- Clicking Download calls `downloadVetReport(petId, pet.name)`, shows "Generating…" on the button while in flight, and surfaces any error via a toast.

## **3. Report Generation**

`src/lib/checkin/vetReportClient.js` — data-layer wrapper, per Technical
Standards (no direct Supabase/fetch calls from UI components):

- Uses a raw `fetch`, not `supabase.functions.invoke`, because the response is a binary PDF (`invoke` assumes/parses JSON).
- `POST` to `${SUPABASE_URL}/functions/v1/generate-vet-report` with `Authorization: Bearer <session token>`, `apikey`, and `{ petId, format: 'pdf' }` as the JSON body.
- On success: builds a `Blob` from the response, creates an object URL, and triggers a browser download named `<pet-name>-vet-report.pdf` (name slugified to `[a-z0-9]+` with `-`, or falls back to `pet`).
- On failure: reads a structured `{ error: { message } }` JSON body if present for the toast copy; falls back to a generic message if the response isn't JSON.

`supabase/functions/generate-vet-report/index.ts` — the Edge Function
that actually assembles the report:

- **Client-callable with the user's own JWT** — not a service-role function. The Supabase client inside the function is created with the caller's `Authorization` header, so every query runs under the caller's own RLS.
- **Access control is structural, not a separate check.** The function fetches the `pets` row for `petId` under the caller's own RLS (`is_pet_owner()`); if the caller doesn't own/co-own the pet, the query simply returns no row, and the function responds `403 forbidden` — deliberately not `404`, so the response doesn't reveal whether the pet ID exists at all.
- Validates `petId` is a well-formed UUID (400 `invalid_pet_id` if not) and that `format === 'pdf'` (400 `unsupported_format` otherwise) — **DOCX was scoped out**; `'pdf'` is the only supported value today, per the function's own comment (no DOCX-with-charts library exists in this project).
- Fetches, in parallel: `profiles` (owner name/email only — no phone or emergency-contact column exists on `profiles`), `wellness_scores` (see Known Issue below), `pet_baselines` (`effective_to is null` — current baseline only), `observations` (last 180 days, capped at 500 rows, plus `observation_types` for label lookup), `medications`, `vaccinations`, `food_logs` (last 180 days, capped at 500 rows), `symptom_logs` (`weight_grams` only, last 180 days — this is where weight comes from; there is no separate `weight_observations` table), and `bloodwork`.
- Renders the PDF by hand using `pdf-lib` directly (no PDF templating library) — a small custom `ReportBuilder` class handles page flow, text wrapping, tables, and even a hand-drawn line chart (no canvas/chart library is available in the Deno Edge Function runtime), since `pdf-lib` itself has no page-flow or layout concept.
- Returns `200` with `Content-Type: application/pdf` and a `Content-Disposition: attachment` filename, or a structured `{ error: { code, message } }` JSON body on 400/401/403/500.

## **4. Report Sections (in order)**

1. **Cover / Identity** — name, species/breed, sex, altered status, DOB, microchip number, condition list, "Prepared for" (owner name + email), generation timestamp.
2. **Wellness Overview** — see Known Issue below; currently empty for any pet whose check-ins are post-migration-0026 (i.e. essentially all current usage).
3. **Baselines & Deviations** — table of `pet_baselines` rows (metric, baseline value, confidence, source); empty-state note if none exist (expected today — nothing in the app currently writes to `pet_baselines`).
4. **Daily Observations** — table of the last 180 days' non-trivial observations (excludes `value === 'normal'`/`'none'`), capped at 150 rows shown with a truncation note if more exist.
5. **Weight Trend** — line chart + table, converted from `symptom_logs.weight_grams` to pounds, last 180 days.
6. **Medications** — table (name, dosage, frequency, prescribing vet, active/inactive).
7. **Vaccinations** — table (vaccine, date given, next due, notes).
8. **Diet & Food Logs** — table, last 180 days, capped at 150 rows with a truncation note if more exist.
9. **Bloodwork** — per-record panels (Renal, Liver, Endocrine, Other), only rendering panels/fields that have a non-null value on that record.

Every section renders a plain-language empty-state sentence
("No baseline has been established for this pet yet.", etc.) rather than
an empty table or omitting the section — the report always shows all
section headings regardless of what data exists.

---

# **Known Issue: Wellness Overview is effectively dead for current check-ins**

The Wellness Overview section queries `wellness_scores`, filtered to
`health_score_version === 'health_score_v2'`. Per
`docs/foundation/0007 Data Model_V2.md` §3.19 and migration
`0026_vibe_and_symptom_count.sql`'s own comment ("Nothing here drops
`wellness_scores`... those retired columns are left in place, unused"),
**nothing has written to `wellness_scores` since the Vibe model shipped
(2026-07-13).** The current model (`daily_check_ins.status` +
`symptom_count`) has no health-score concept at all, by design.

Practical effect: any pet whose check-in history is entirely post-Vibe
(true for every new pet, and true going forward for existing pets too)
will show "No Health Score data has been recorded for this pet yet" in
this section — the very first content section of the report, ahead of
everything else. Only pets with surviving pre-migration-0026
`health_score_v2` rows will show real data here, and that data will only
ever get *older*, never refreshed. This is a real product gap, not a bug
in the generation code itself (the function correctly reflects what's in
the table) — it's the report design lagging behind the last scoring-model
retirement. Needs a product decision: drop the section, or replace its
data source with something derived from the current Vibe/symptom-count
model.

---

# **UI Components**

- Header (Back button, CareMenu trigger)
- Pet identity block (photo, name, breed)
- Vet Report card (heading, description, Download button)
- CareMenu (shared component, lateral navigation only)
- Toast (error display)

---

# **User Interactions**

### **Tap "Vet Report" nav card (from Pet Profile / Pets "Show More")**
Navigate to `/pet/:petId/export`.

### **Tap "Download Report"**
Button shows "Generating…" and disables while the Edge Function runs.
On success, the browser downloads a PDF named `<pet-name>-vet-report.pdf`.
On failure, a destructive toast shows the error message.

### **Tap the CareMenu trigger on this page**
Opens the same slide-out Care panel used elsewhere, for jumping to
another section of this pet's data (not related to the export itself).

---

# **Navigation**

- **In:** Pet Profile / Pets expanded card → "Vet Report" nav card → `/pet/:petId/export`. This is the only entry point in the current app.
- **Out:** Back button (`navigate(-1)`), or any CareMenu item.

---

# **Business Rules**

- Only the pet's owner or co-owner can generate a report for that pet — enforced structurally via RLS (`is_pet_owner()`), not a separate authorization check in application code.
- A caller without access gets `403`, not `404` — the response never confirms or denies whether a given `petId` exists.
- Only `format: 'pdf'` is supported; any other value is a `400`.
- Observations and food logs are windowed to the last 180 days and capped at 500 fetched / 150 rendered rows each, with an explicit truncation note when data is cut off — older history is never silently included or silently dropped without a note.
- Every section always renders, even with no data — empty sections show an explanatory sentence, never a blank gap or a hidden heading.
- No report is stored anywhere — every download is generated fresh from current data; there's no history of previously generated reports.

---

# **Data Requirements**

Tables read (all via the caller's own RLS, `security` not elevated for
reads — only the pets/report data flows through, all scoped to one
`petId`):

- `pets` — full row (identity fields used: `name`, `species`, `breed`, `sex`, `altered_status`, `birth_date`, `microchip_number`, `conditions`, `photo_url`)
- `profiles` — `first_name`, `last_name`, `email` (report preparer only)
- `wellness_scores` — `check_in_date`, `health_score`, `health_score_version`, `score_reason_summary` (see Known Issue — effectively dead data source going forward)
- `pet_baselines` — full row, filtered to `effective_to is null`
- `observations` + `observation_types` — last 180 days, capped 500
- `medications` — full row
- `vaccinations` — full row
- `food_logs` — last 180 days, capped 500
- `symptom_logs` — `date`, `weight_grams` only, last 180 days
- `bloodwork` — full row

No new database changes are required by this document — it describes
what already exists. (A future fix to the Known Issue above would
require either a new query against the current check-in model or a
product decision to drop the section — out of scope here.)

---

# **Acceptance Criteria**

A user with access to a pet can:
- ✓ Reach Vet Export from that pet's expanded profile card
- ✓ See the pet's identity while the page loads
- ✓ Download a PDF report on demand
- ✓ See a clear error if generation fails
- ✓ Navigate to other pet sections via CareMenu without leaving the flow entirely
- ✗ See current Health Score data in the Wellness Overview section for a pet whose check-ins are all post-migration-0026 (see Known Issue — currently always empty for such pets)

A user without access to a pet:
- ✓ Cannot generate a report for it (`403`, indistinguishable from a nonexistent pet ID)

---

# **Edge Cases**

- Pet with zero data in every section: report still generates successfully, every section shows its empty-state sentence.
- Pet with more than 500 observations/food logs in the last 180 days: fetch itself is capped at 500; rendering is separately capped at 150 with a truncation note — a pet could have data between 150 and 500 that's fetched but not rendered, silently past the visible table (the truncation note covers this, but doesn't state an exact count of what's hidden).
- Pet with `wellness_scores` history entirely older than the last "current" check-in (i.e., only pre-Vibe rows exist): Wellness Overview shows real but explicitly stale data — the report gives no visual indication that this score is old/no-longer-maintained.
- Direct navigation to `/pet/:petId/export` for a pet the user doesn't own (e.g. a stale/shared link): Edge Function returns 403; the page itself still renders pet identity via `entities.Pet.get`, which is separately RLS-scoped — if that also fails, the page shows "Pet not found," a different failure mode than the download's own 403 toast.
- Slow network / large report: no explicit timeout handling visible in either the client wrapper or the Edge Function beyond the browser's own fetch behavior.

---

# **Loading States**

- Page load: centered spinner while `entities.Pet.get` resolves.
- Report generation: Download button shows "Generating…" and is disabled; no separate full-page loading state.

---

# **Error States**

- Pet not found / inaccessible via `entities.Pet.get`: "Pet not found." (page-level, not a toast).
- Report generation failure (any 400/401/403/500 from the Edge Function, or a network failure): destructive toast, using the Edge Function's own `error.message` when the response is valid JSON, otherwise a generic "Could not generate the vet report. Please try again."

---

# **Implementation Notes for Claude Code**

- Route all data access through `vetReportClient.js` / the Edge Function — don't add a second, client-side PDF generation path (the previous client-side `window.print()` implementation was deliberately replaced; see file history if reconstructing that period matters).
- Any new report section needs both the Edge Function query and a corresponding `ReportBuilder` call (`heading`/`table`/`paragraph`/`lineChart`) — there's no shared "report schema" to update elsewhere.
- If a data source referenced by this report changes (as `wellness_scores` already has, silently), update this Edge Function in the same change — this is exactly how the Wellness Overview section went stale.
- The "Vet Export Feature Spec v2" cited in code comments could not be located anywhere in this repo. If it turns up elsewhere (a doc tool, an old chat thread), reconcile it against this document rather than assuming this document is wrong — this one was written directly from the shipped implementation.

---

# **Proposed Enhancements (Not Yet Built)**

Added 2026-07-18, reconciling an external product-review document against
the current implementation. That document turned out to describe the
*pre*-2026-07-11 state of this feature (before commit `7a27f70` added real
PDF generation and moved the entry point onto Pet Profile) — most of its
"current problems" are already fixed. The items below are the parts that
survived verification against current code and schema as genuinely open;
each is annotated with what was checked. One recommendation from that
source document (making a "Wellness Score" the report's primary summary)
is **not** included here — see the callout at the end of this section.

### **1. Email Vet Report**
No send-to-vet capability exists today — the feature is generate/download
only. Proposed as a second capability, separate from report generation:

- **`generate-vet-report`** (existing) — client-callable with the user's own JWT, returns the PDF to the browser. Unchanged.
- **`send-vet-report`** (new) — receives an already-generated PDF and a vet email address, sends the email, logs delivery. Should run under the **service role**, not the user's JWT — the client should never call an email-sending function directly (matches the existing pattern in `supabase/functions/send-email`, which this would presumably reuse or sit alongside).

### **2. Prominent Secondary Entry Point**
Confirmed: the only current entry point is the "Vet Report" nav card
inside the expanded Pet Profile card stack (§1 above) — there's no
standalone call-to-action higher up the page. A "Share with Vet" or
"Generate Vet Report" button near the top of Pet Profile (above the
expandable stack) would make the feature discoverable without requiring
"Show More" first.

### **3. Missing Pet-Identity Fields**
Verified against `pets` schema (migration `0008_add_pet_identity_fields.sql`):
`akc_registered`, `akc_registered_name`, `breeder`, and `gotcha_date` /
`gotcha_date_precision` are all real, captured columns — none are
currently read by `generate-vet-report`'s cover section (which reads only
`sex`, `altered_status`, `birth_date`, `microchip_number`, `conditions`).
(Note: the source document also listed a distinct "AKC number" field —
no such column exists in this schema; only `akc_registered_name` does.
Any future work should not assume that field is real without adding it.)

### **4. Observation Photos**
Verified: `observations.photo_url` is a real column (migration
`0014_daily_checkins_wellness.sql`), and several check-in categories
(`appetite`, `vomiting`, `other`) support attaching one
(`hasPhoto: true` in `src/lib/checkin/config.js`). The report's
observations query selects only `observed_at, observation_type_id,
value, numeric_value, notes` — photos are fetched nowhere and never
appear in the PDF. Note this is nontrivial: `pdf-lib` can embed images,
but the current `ReportBuilder` has no image-layout support today, and
photos would need to be fetched from Storage (not just the DB row) before
embedding.

### **5. Weight Trend Truncation Is Silent**
Confirmed by re-reading the Edge Function directly: unlike Observations
and Food Logs — both of which show an explicit "data truncated" note when
more rows exist than are rendered — the Weight Trend table
(`[...symptomLogs].reverse().slice(0, 60)`) silently drops anything past
the most recent 60 entries with no note at all. Same category of problem
the source document raised generally ("No Silent Truncation"), confirmed
as a real, specific instance here.

### **6. Report Metadata**
The report currently includes only a bare "Report generated: {date}"
line and the "Prepared for" owner name/email. Not included: app/build
version, the report's time zone, an explicit statement of the reporting
period (the 180-day window is implied by per-section notes, never stated
up front), or a report identifier.

### **Not proposed: "Wellness Score" as the primary summary**
The source document recommended making a "Current Wellness Score" the
report's central health summary. This is not carried forward — the app
retired scoring entirely (Wellness Score V1, Health Score V2, and the
equal-weight multi-select version) in favor of the Vibe + symptom-count
model, two days after this report's current implementation shipped (see
Known Issue above). If a "current health summary" section is built, it
should summarize Vibe/symptom-count trends from `daily_check_ins`, not
reintroduce a score. This directly supersedes the first Open Question
below.

---

# **Open Questions for Product**

- Given the above, should the dead Wellness Overview section be dropped, replaced with a Vibe/symptom-count-based summary, or left as historical-only data with a "last updated" caveat? (Whichever is chosen, it should not be a revived score — see "Not proposed" above.)
- Which of the six proposed enhancements above, if any, are prioritized for a near-term build?
- Should generated reports be retained (a "past reports" list) instead of being fully ephemeral, or is on-demand-only intentional?
- Longer-term ideas raised by the source document but explicitly out of scope for now: secure share-link (vs. email), FHIR/HL7-compatible export, an AI-generated clinical summary, and comparison against previously generated reports. Noted here for the record, not proposed as near-term work.
