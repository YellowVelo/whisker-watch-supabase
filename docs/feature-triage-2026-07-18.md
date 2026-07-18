# Feature Documentation Triage — /docs/features (2026-07-18)

**Method:** Read every file in `docs/features/`, cross-checked claims (UI
screens, data fields, scoring/status logic, user flows) against the current
codebase — primarily `src/lib/checkin/{scoring,config,chipLabels,checkinClient}.js`,
`src/api/entities.js`, `supabase/migrations/*.sql`, `supabase/functions/*`,
and the relevant pages/components. Read-only pass; no code or other docs
were changed.

**Context:** `docs/features/` is meant to hold specs "confirmed current
against the codebase" (per `CLAUDE.md`). All 14 files here were touched in a
reorg commit on 2026-07-18 that acted on an earlier triage
(`docs/feature-triage-2026-07-14.md`) of `docs/review-features/`. This pass
re-verifies that the reorg's "confirmed current" claim actually holds for
each file, now that they live in `docs/features/`.

**Key finding that drives most classifications below:** the app retired
three prior scoring systems — a 0–100 "Wellness Score V1," a 0–10 "Health
Score V2," and an equal-weight multi-select version — in favor of the
current model: `daily_check_ins.status` is `great`/`off`/`tough`/`skipped`
(subjective Vibe) plus an unweighted `symptom_count` (objective,
direction-only). Migration `0026_vibe_and_symptom_count.sql` confirms the
enum rename (`normal`→`great`, `changed`→`off`, new `tough`, `skipped`
unchanged) and the retirement of `computeHealthScore`/`computeDayScore`/
`computeTrend`. Any doc still describing numeric scores, health rings, or
Stable/Monitor/Declining labels is stale on that point, even if the rest of
the doc is accurate.

---

## Report Table

| File Name | Feature Described | Status | Evidence (files/lines checked) | Recommended Action |
|---|---|---|---|---|
| `0001 Add Pet.md` | Add Pet form: species, photo, identity, birth/gotcha date precision, microchip, AKC fields | **CURRENT** | `src/components/AddPetDialog.jsx:26-31` (form state) and `:188-199` (submit payload) — `photo_url`, `sex`, `altered_status`, `microchip_number`, `akc_registered`/`akc_registered_name`/`akc_registration_number`, `breeder` all present, matching the doc's field list exactly. | Move to /docs/features as-is |
| `0002 Pet Onboarding.md` | Card-based onboarding wizard: health status → conditions → medications → baseline, autosave/resume via `current_step` | **CURRENT** | `src/components/onboarding/OnboardingWizard.jsx:38` (`current_step` persisted), `:73-193` (switch on `current_step` renders `ChoiceCard`/`ConditionsCard`/`MedicationEntryCard` in the doc's card order). | Move to /docs/features as-is |
| `0004 Navigation Refresh.md` | Three-tab IA (Home/Pets/Menu), Pet Profile as long-term hub | **STALE** | Nav structure itself matches `src/App.jsx`/`BottomTabBar.jsx`. But the doc still describes "Today's Wellness Score" and numeric trend labels at lines 45, 79, 88 ("Stable"), 97 ("Monitor"), 133, 146, 245, 282, 289 ("Cards display the pet's current Wellness Score, trend..."). No numeric score or Stable/Monitor language exists anywhere in current Home/Pets/Pet Profile — replaced by `VibeIcon` + direction chips (`src/components/PetSummaryCard.jsx:154-156`). | Needs update before moving — strip all "Wellness Score"/"Stable"/"Monitor" content from the Home/Pets/Pet Profile sections; nav structure itself is fine |
| `0006 Pet Delete Test and Demo Accounts V2.md` | Pet deletion (sole-owner delete vs. co-owner transfer vs. leave), test/demo/owner account infrastructure | **CURRENT** | `src/lib/accountType.js:14-31` (`isProductionAccount`/`isTestAccount`/`isDemoAccount`/`isOwnerAccount`, matching the doc's line-138 claim of four `account_type` values incl. `owner`); `src/lib/seedTestData.js:282-293` (seed scenario keys `empty`/`healthy_dog`/`multi_pet`/`demo_showcase` match doc exactly); `supabase/functions/invite-co-owner/index.ts:103-113` confirms the doc's line-173 claim that co-owner invite emails are suppressed for test/demo accounts. **Note:** an unrelated file with the identical name exists at `docs/Archive/0006 Pet Delete Test and Demo Accounts V2.md` (different content, "Pet Management – Add Pet Expansion") — filename collision, not a content problem with this file. | Move to /docs/features as-is |
| `0007 Home Feature Specification V2.md` | Home screen: greeting, notification bell, Vibe icon + attribute chips, catch-up banner | **CURRENT** | `src/pages/Home.jsx:59` (checkIns state comment: "carries .status Vibe + .symptom_count"); `src/components/PetSummaryCard.jsx:4` (imports `VibeIcon`), `:106` (`status !== 'skipped'`), `:154-156` (renders `VibeIcon` + great/off/tough/skipped labels) — matches the doc's Vibe-model description, no numeric score anywhere. | Move to /docs/features as-is |
| `0009 Pet Profile Feature V3.md` | Pet Profile: header, wellbeing summary, nav cards (Baseline/Conditions/Medications/Food/etc.) | **STALE** | Despite the "V3" (reconciled) label, line 131 still requires "Wellness metrics require available scoring data" and line 161 lists "Wellness Scores" as a data requirement. Actual `src/components/PetProfileContent.jsx` (per `:573-591` in prior review) renders a single `VibeIcon` + separate Weight button — no wellness-score data model exists to fetch. This is the one file in `docs/features/` whose "confirmed current" status from the 2026-07-18 reorg does not hold up. | Needs update before moving — remove "Wellness Score"/"Wellness metrics" language (lines 131, 161); re-verify the rest of the nav-card structure line-by-line |
| `0010 Trends Feature SpecificationV4.md` | Trends screen: Vibe + symptom-count model, Health(6)/Wellbeing(5) attribute lists | **STALE** | Core model claims are accurate (no numeric score, matches `config.js`). But the doc never mentions the actual sub-tab structure: `src/pages/PetTrends.jsx:43-47` defines `SECTIONS = [overview, trends, patterns, compare]`, rendered as sub-tabs at `:184-186` — none of "Patterns" or "Compare" appear anywhere in the doc (checked, no matches). Vomiting and Nausea also render as one combined card in code, not as separate attribute cards as the doc's grouping implies. | Needs update before moving — add the Overview/Trends/Patterns/Compare sub-tab structure; reconcile Vomiting+Nausea card grouping |
| `0011 Menu Screen Specification.md` | Menu/Settings screen: account type badges, `isInternalAccount()` gating, delete-account flow | **CURRENT** | `src/pages/Settings.jsx:22-25` — account-type badge labels (Production/Test/Demo/Owner) match exactly, including the `owner` badge added after this doc's stated reconciliation date. | Move to /docs/features as-is |
| `0012_DailyCheckIn_Vibe_Trends_Specification_v5.md` | **Canonical** Vibe/scoring spec — status enum, symptom count, attribute categories | **CURRENT** | `supabase/migrations/0026_vibe_and_symptom_count.sql:16-21,60` — status enum rename (`normal`→`great`, `changed`→`off`, new `tough`) matches doc line 43 exactly; `src/lib/checkin/config.js:100-103,241` confirms the `nausea` category the doc requires (line 97, 154) is present. This is the doc CLAUDE.md points to as canonical, and it holds up. | Move to /docs/features as-is |
| `0013 CoOwner EmailsV2.md` | Co-owner invite: `generateLink()`/`verifyOtp()` mechanism, invite vs. recovery token-type branching | **CURRENT** | `supabase/functions/invite-co-owner/index.ts:146` (`admin.generateLink({type:'invite'})`), `:206` (recovery-type `generateLink()` for resends) — matches the doc's described mechanism exactly, not the older bespoke token-table design from the pre-reorg `0013 CoOwner Emails.md`. | Move to /docs/features as-is |
| `0014 Email Send Feature.txt` | Shared server-side email system: Resend integration, template renderer, initial template list | **STALE** | `supabase/functions/_shared/email/templates/` contains `co-owner-invitation-reminder.ts` in addition to the doc's listed templates (co-owner-invitation, welcome, verify-email, password-reset) — doc has zero mentions of "reminder" anywhere (checked, no matches). Not wrong, just incomplete. | Needs update before moving — add the co-owner-invitation-reminder template to the template list |
| `0014 User Profile Timezone Settings.md` | Timezone auto-detect (`Intl.DateTimeFormat`) with manual-override, auto-populate-once semantics | **CURRENT** | `src/lib/timezone.js:20` (`isValidIanaTimezone`), `:33` (`detectTimezone`), `:57` (`shouldAutoPopulateTimezone`) — all three functions the doc names exist with matching signatures/semantics. | Move to /docs/features as-is |
| `003 Daily Check-In V2.md` | Daily Check-In sheet: Vibe status, symptom categories incl. Nausea/Behavior, Medication Exception removed from picker | **CURRENT** | `src/components/DailyCheckInSheet.jsx:16` (`PICKER_CATEGORIES` filters out `medication_exception`), `:70` (`status: 'great'` on the quick-log path), `:206` (great/off/tough/skipped label map) — all match doc claims exactly. | Move to /docs/features as-is |
| `account-deletion-edge-function-spec_1.md` | `delete-account` Edge Function: sole-owner cascade delete, co-owner ownership transfer + notification, storage cleanup, `auth.users` deletion last | **CURRENT** | `supabase/functions/delete-account/index.ts:115-145` (ownership transfer + in-app notification), `:174-188` (storage cleanup), `:195` (`auth.admin.deleteUser` runs last) — matches the doc's described order step-for-step. | Move to /docs/features as-is |

---

## Summary

Total files triaged: **14**

- **CURRENT: 10** — `0001 Add Pet.md`, `0002 Pet Onboarding.md`, `0006 Pet Delete Test and Demo Accounts V2.md`, `0007 Home Feature Specification V2.md`, `0011 Menu Screen Specification.md`, `0012_DailyCheckIn_Vibe_Trends_Specification_v5.md`, `0013 CoOwner EmailsV2.md`, `0014 User Profile Timezone Settings.md`, `003 Daily Check-In V2.md`, `account-deletion-edge-function-spec_1.md`
- **STALE: 4** — `0004 Navigation Refresh.md`, `0009 Pet Profile Feature V3.md`, `0010 Trends Feature SpecificationV4.md`, `0014 Email Send Feature.txt`
- **DEPRECATED: 0**
- **UNCLEAR: 0**

(10 + 4 + 0 + 0 = 14 ✓)

### Highest priority to resolve first

1. **`0009 Pet Profile Feature V3.md`** — the most concerning finding here. It carries a "V3" label implying it was already reconciled in the 2026-07-18 reorg (like `0007 …V2.md` and `003 …V2.md` were), but it still requires a "Today's Wellness Score" element and lists "Wellness Scores" as a data requirement — the exact retired-scoring content every sibling doc in this folder was supposed to have had stripped. Anyone trusting `docs/features/`'s "confirmed current" guarantee is most likely to be misled by this one specifically, because it looks done.
2. **`0004 Navigation Refresh.md`** — heaviest concentration of stale content (8 separate line hits for "Wellness Score"/"Stable"/"Monitor"), even though the top-level nav structure it describes is accurate. Worth a full pass since so much of the doc is affected.
3. **`0010 Trends Feature SpecificationV4.md`** — the model-level claims are right, but the doc is silent on the actual Overview/Trends/Patterns/Compare sub-tab structure that's core to how the screen is actually built; a reader would have no idea "Patterns" and "Compare" exist.
4. **`0014 Email Send Feature.txt`** — lowest-severity gap (one missing template), but cheapest to fix and worth doing in the same pass as the others.
