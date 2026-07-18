You are a Senior Systems Engineer on the Wysker Watch Application.
All of the context you need for the specification below is in the Claude Whisker Watch Project. If you are unsure about a specification, ask.
Prior to writing code, explain what you are going to do in plain English.
Before writing code, call out any issues.
Ensure you are testing your code for issues ahead of time.
Write a test plan so we can test in development before deployment.

# Feature Specification — V2 (as-built reconciliation)

## Pet Management – Add Pet Expansion

**Document:** `01 Features/Pet Delete Test and Demo Accounts.md` (V1)

**Status:** V1 largely shipped. This V2 reconciles the original spec against what's actually in the codebase as of 2026-07-17, and marks what's genuinely still open.

**Owner:** Product

**Audience:** Claude Code (Engineering)

---

## How to read this document

Each section below is the original V1 requirement, annotated with **[AS BUILT]** notes describing what actually shipped, where it lives, and where it diverges from the original spec. Sections with no material changes are left as-is. Diverges are called out explicitly rather than silently updated, so Product can decide whether the code or the spec should move.

---

## 1. Delete Single Pet

**Status: Shipped, matches spec closely, with two behaviors the original spec didn't anticipate.**

Implemented in [`supabase/functions/delete-pet/index.ts`](../../supabase/functions/delete-pet/index.ts).

### [AS BUILT] Three outcomes, not one

The V1 spec assumed every pet has a single owner and "delete" always means permanent deletion. In practice pets can have co-owners (`pet_co_owners`), so `delete-pet` has three outcomes depending on the caller's relationship to the pet:

| Caller is... | Result | mode |
|---|---|---|
| Sole owner (no linked co-owners) | Pet and all dependent data permanently deleted | `deleted` |
| Primary owner, pet has a linked co-owner | Ownership transfers to the oldest linked co-owner; pet is **not** destroyed; new owner gets an in-app notification | `transferred` |
| A co-owner (not primary) | Only the caller's own `pet_co_owners` row is removed; pet and all its data are untouched; primary owner gets an in-app notification | `left` |
| No relationship to the pet | 403 | — |

**Decision needed:** Should the UI's confirmation copy for "Delete Pet" change depending on which of these three outcomes will occur (e.g. co-owners see "Leave [Pet Name]?" instead of "Delete [Pet Name]?")? The current spec's confirmation flow (typed-name confirmation, "This cannot be undone") describes the `deleted` case only. Recommend the UI branch on this before presenting the modal, not after the delete call returns.

### [AS BUILT] `pet_sits` cleanup (schema detail the original spec's "inspect the schema" note didn't surface)

`pet_sits.pet_ids` is a `uuid[]` with no foreign key — Postgres can't cascade-delete an array element. `delete-pet` explicitly strips the deleted pet's id out of any `pet_sits` record it belongs to (or deletes the whole `pet_sits` row if it becomes empty) **before** deleting the pet, and aborts the entire operation if that cleanup fails. This is the one pet-owned relationship that required custom code rather than a schema-level `ON DELETE CASCADE`.

### [AS BUILT] Cascade coverage confirmed

All other pet-owned tables (symptom logs, food logs, medications, vaccinations, weight records, photos/documents, timeline events, daily check-ins, etc.) use `ON DELETE CASCADE` on `pet_id` at the schema level — no additional explicit cleanup code was needed for those. Pet photo in Storage is removed explicitly (non-fatal if it fails — an orphaned storage object is preferred over blocking the delete).

### Unchanged from V1
- Never touches `auth.users`, never reuses delete-account logic, always scoped by `pet_id` + ownership check performed server-side.
- RLS/ownership enforced via service-role function checking `created_by = auth.uid()` (or co-owner row), not client-side trust.

### Still open
- Confirm the "Edit Pet / Over the Rainbow Bridge / Delete Pet" menu and the typed-name confirmation modal are implemented client-side as specified (not verified in this pass — recommend a follow-up UI check).
- Decide on the co-owner-aware confirmation copy above.

---

## 2. Test Accounts

**Status: Shipped, but provisioning model is different from what the spec describes — document as intentional, not a gap.**

### [DIVERGE] Provisioning: email allowlist at signup, not admin toggle

V1 says: *"Only authorized admin/developer users can create or mark accounts as test."* This reads as an in-app admin action. What's actually built ([`supabase/migrations/0010_account_type.sql`](../../supabase/migrations/0010_account_type.sql)):

- `profiles.account_type` (`production` / `test` / `demo`, later extended — see §4) defaults to `production` for every signup.
- A `classify_account_type(email)` SQL function checks the new user's email against a small, hardcoded allowlist (e.g. `test1@wyskerwatch.com`, `test2@wyskerwatch.com`) and assigns `test`/`demo` accordingly at signup, via the `handle_new_user()` trigger.
- There is **no self-service or admin-UI toggle** to convert an existing account. To add a new internal test/demo account, an engineer adds its email to the allowlist in a new migration, then that email is provisioned in Supabase Auth directly (e.g. via the dashboard).

**Recommendation:** Update the spec's "Access Control" language to describe this allowlist-at-signup model explicitly, rather than implying an admin UI exists. If a self-service/admin-toggle flow is still wanted for the future, call it out as a new, separate future phase rather than something V1 silently didn't finish.

### [AS BUILT] Reset Test Account

Implemented as [`supabase/functions/reset-sandbox-account/index.ts`](../../supabase/functions/reset-sandbox-account/index.ts) — named "sandbox" rather than "test" because the same function also serves demo accounts (see §3). Server-side guard: refuses to run unless the caller's `account_type` is `test` or `demo` (403 otherwise). Deletes all pets the caller owns/co-owns as primary, their dependent data (via cascade), pet photos in Storage, and any leftover co-owner links — never touches `auth.users`.

### [AS BUILT] Seed Data — scenario list is smaller than spec'd, plus one scenario the spec didn't ask for

Implemented in [`src/lib/seedTestData.js`](../../src/lib/seedTestData.js), surfaced in Settings (`src/pages/Settings.jsx`) gated by `isInternalAccount(user)`.

Spec asked for 10 scenarios. Shipped:

| Scenario | Status |
|---|---|
| Empty Account | ✅ shipped (`empty`) |
| Healthy Dog | ✅ shipped (`healthy_dog`) |
| Multi-Pet Household | ✅ shipped (`multi_pet`) |
| Healthy Cat | ❌ not built |
| Senior Cat with CKD (standalone scenario) | ❌ not built as a standalone seed — CKD cat only exists inside `insights_trends` and `demo_showcase` |
| Cat with IBD | ❌ not built |
| Dog with Allergies | ❌ not built |
| Pet With Medications (standalone) | ❌ not built as standalone — meds only seeded inside `demo_showcase` |
| Pet With Vaccines (standalone) | ❌ not built as standalone — vaccines only seeded inside `healthy_dog`/`demo_showcase` |
| Pet With Logs (standalone) | ❌ not built as standalone |
| **Insights Trends (Harper/Tribble/Auggie)** | ➕ shipped, not in original spec — 30 days of Daily Check-In history across 3 pets (stable/declining/improving trend) built specifically to test Insights charts |

**Recommendation:** Confirm with Product whether the 6 unbuilt scenarios are still wanted, or whether `insights_trends` + the 3 shipped scenarios cover what QA actually needs. If the remaining scenarios are wanted, scope them as a follow-up rather than assuming V1 is incomplete.

### [AS BUILT] Visual Indicator

`src/components/AccountTypeBanner.jsx` implements the `TEST ACCOUNT` banner as specified (persistent, non-dismissable, amber, distinct from primary app palette). One implementation detail worth noting for future work: it publishes its own rendered height as a `--account-banner-height` CSS variable so other sticky/fixed headers can offset around it — relevant if other features add their own top-of-screen sticky elements later.

### [PARTIAL / GAP CONFIRMED] Notifications / Email

Spec requires: no real reminder emails, no production push notifications, no marketing emails, no vet emails unless explicitly enabled.

Investigated directly — findings:

- **Emails:** No reminder, marketing, or vet email sending code exists in the app at all today; the only real email path is co-owner invites (`supabase/functions/invite-co-owner/index.ts` via `supabase/functions/_shared/email/sendEmail.ts`, Resend-backed). `invite-co-owner/index.ts` **does** check the inviter's `account_type` and skips the real send for `test`/`demo`. However, the shared `sendEmail.ts` helper itself has **no account_type gate** — its own code comments call this "a deliberately deferred gap" because it only receives a recipient address, not which internal account triggered the send. This is independently confirmed in `docs/launch-punch-list.md`: *"Test/demo account email suppression isn't centralized... the new shared `sendEmail()` doesn't [check it]."*
  **Recommendation:** Treat this as tracked tech debt, not done. Any new email-sending feature must replicate `invite-co-owner`'s account_type check by hand until suppression is centralized in `sendEmail.ts` itself.
- **Push notifications:** No push infrastructure (FCM/APNs/web push) exists anywhere in the codebase — only an in-app `notifications` table with no external dispatch. This requirement is currently **not applicable**, not failing; there's nothing to gate yet. Revisit when push is actually built.
- **Analytics:** Implemented differently than the spec's wording ("excluded from production analytics"). `src/lib/analytics.js` tags every event with `account_type` as a property and keeps it in the same table — a deliberate design choice ("flagged but debuggable" per its own comment) rather than dropping test/demo events. Whether the nightly rollup views (`0023_analytics_daily_summary.sql`, `0024_analytics_summary_eastern_time.sql`) filter test/demo out was not fully verified line-by-line.
  **Recommendation:** Confirm with Product whether "flag, keep queryable" satisfies the original "excluded from production analytics" intent, or whether the rollups specifically need a `WHERE account_type = 'production'` filter added.

---

## 3. Demo Accounts

**Status: Read-only demo viewer behavior and admin-gated reset/reseed shipped. The "curated baseline + publish snapshot" data model described in V1 was not built — recommend explicitly descoping it.**

### [AS BUILT] Demo Admin = `account_type = 'demo'` AND `role = 'admin'`

V1 describes "Demo Admin Mode" as a distinct capability. What's implemented ([`src/lib/accountType.js`](../../src/lib/accountType.js)):

- `isDemoAdmin(user)` checks `profiles.role === 'admin'` only — intentionally independent of `account_type`, so that holding the demo account's login credentials alone doesn't grant admin rights.
- `isInternalAccount(user)` is the actual combined gate used to show reset/seed tools in Settings: **every** `test` account qualifies; a `demo` account only qualifies if it is **also** flagged `role = 'admin'`.

This matches the spirit of "Demo must be editable by authorized admins" but there is no separate "Edit Demo Data" mode distinct from the same reset+reseed tooling test accounts use.

### [NOT IMPLEMENTED — recommend explicit descope] Baseline dataset / publish snapshot workflow

V1's "Demo Data Model" section describes: a curated baseline/template dataset, general demo users seeing a "published snapshot," non-admin changes being blocked or temporary, and an admin being able to "publish" changes back to the baseline that all viewers see.

**Nothing like this exists in the codebase.** A repo-wide search for publish/snapshot/baseline-dataset logic returned zero hits. What shipped instead:

- There is one demo account (or a small allowlisted set), not a shared public snapshot viewed by many separate demo logins.
- `reset-sandbox-account` wipes that demo account's own data.
- `SEED_SCENARIOS`'s `demo_showcase` scenario (in `seedTestData.js`) reseeds it with a fixed, hardcoded dataset (a senior cat "Maple" with CKD, a healthy dog "Cooper") every time it's run.
- Demo photos are stored in a `shared/` Storage path specifically so `reset-sandbox-account`'s per-user storage sweep never deletes them across reseeds.

There is no mechanism for an admin to edit demo data live and "publish" it to other viewers, because there are no other concurrent viewers of a shared snapshot — every demo session is the same single account, reset to the same canned state.

**Recommendation:** Formally descope the baseline/publish-snapshot model from this spec rather than leaving it silently unaddressed. If Product still wants a "many people can browse a read-only shared demo simultaneously, with an admin curating what they see" experience, scope that as a distinct future phase — it's a materially different data model (shared public view) from what's built (single resettable account), not a small gap.

### [CONTENT MISMATCH] Demo pet names don't match spec

V1 names the demo household Tribble, Harper, Auggie, and Goose, each demonstrating a specific care scenario. The shipped `demo_showcase` scenario uses **Maple** (senior cat, CKD, declining trend) and **Cooper** (healthy adult dog, stable trend) — a 2-pet household, not 4, and different names/species pairings. Note: Harper, Tribble, and Auggie names *are* used, but in the unrelated `insights_trends` **test**-account scenario (§2), not the demo account.

**Recommendation:** Either update this spec to describe Maple/Cooper as the shipped demo household, or treat the fuller 4-pet household (with onboarding/allergy/behavior scenarios) as a follow-up expansion of `demo_showcase`.

### Unchanged from V1
- `DEMO MODE` banner: shipped as specified in `AccountTypeBanner.jsx`.
- General demo viewers cannot permanently modify data: enforced by the same RLS/ownership rules as any account — there's no special "read-only for demo" override in the app; it works because there's no UI path for a demo *viewer* (non-admin) to reach mutating actions in the first place, not because of an explicit read-only mode. **Note:** if a future change adds a mutating action that isn't behind the `isInternalAccount`/`isDemoAdmin` check, demo viewers would be able to invoke it — this isn't defense-in-depth today, just an absence of exposed mutating UI.

---

## 4. Shared Technical Requirements

### [AS BUILT] Account Type enum has 4 values, not 3

`supabase/migrations/0025_account_type_owner.sql` added a 4th value: **`owner`** — a real personal-use account (e.g. the founder's own pets), distinct from `production` so it can be excluded from real-user analytics like test/demo are, but **deliberately not eligible** for `reset-sandbox-account` (that function's guard only allows `test`/`demo` — an `owner` account can never be wiped via that path, by construction).

Updated enum: `production | test | demo | owner`.

**Recommendation:** Update the spec's "Account Type" section and the suggested-helper list to include `isOwnerAccount()` alongside `isProductionAccount()` / `isTestAccount()` / `isDemoAccount()` / `isDemoAdmin()` — all five exist in `src/lib/accountType.js` today, plus the combined `isInternalAccount()` helper described in §3.

### Unchanged from V1
- Data isolation between production/test/demo/owner: no operation from one account type affects another — confirmed via the `reset-sandbox-account` guard and RLS ownership checks throughout.
- Delete safety: pet deletion scoped by `pet_id` + `owner_id`/`auth.uid()`, never reuses account-deletion logic — confirmed in §1.

---

## Build Order status

- **Phase 1 (Delete Single Pet):** Shipped, see §1 for nuances.
- **Phase 2 (account_type, Test Account banner/reset/seed):** Shipped, see §2 for provisioning-model and seed-scenario reconciliation, and the notifications/analytics gap.
- **Phase 3 (Demo Account mode, banner, admin edit/publish flow):** Read-only viewer behavior and admin-gated reset/reseed shipped; the baseline/publish-snapshot data model was not built — recommend formally descoping (see §3) rather than treating as an open item on this spec.

---

## Open decisions for Product

1. Should pet-delete confirmation copy branch by outcome (delete / transfer / leave)?
2. Are the 6 unbuilt seed scenarios still wanted, or does the current set (+ `insights_trends`) cover QA's needs?
3. Is "flag test/demo analytics events but keep them queryable" an acceptable implementation of "excluded from production analytics," or do the rollup views need an explicit filter?
4. Should email-suppression-by-account-type be centralized in `sendEmail.ts` now, or tracked as ongoing tech debt?
5. Formally descope the demo baseline/publish-snapshot workflow, or scope it as a distinct future phase?
6. Update this spec's demo household (Tribble/Harper/Auggie/Goose) to match the shipped Maple/Cooper pair, or treat the 4-pet household as a follow-up expansion?
