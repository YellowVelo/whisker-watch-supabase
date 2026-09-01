# 0063_Production_Storage_RLS_Policy_Restoration_Specification_v1

**Status:** Shipped
**Verified:** 2026-08-30 — production `pg_policies` query confirmed match with dev/staging; real-account smoke test on "Scan Record" passed (Lynn).
**Date:** 2026-08-30
**Related files:** `supabase/migrations/0002_storage_bucket.sql`, new migration `supabase/migrations/0052_restore_storage_policies.sql`, `src/api/storageClient.js`, `src/components/VaccinationSection.jsx`, `docs/features/0061_Invoice_Scan_MultiPet_Vaccination_Review_Specification_v1.md`, `docs/features/0062_Toast_System_Position_Fix_Specification_v1.md`

---

## Before You Approve This

- **This is the confirmed root cause of "Scan Record fails in production."** It was found by directly querying the real database's security rules (not guessed from reading code) — see Technical Spec for exactly what was checked and how.
- **This affects every file upload in production, for every user, not just Vaccinations.** Photo uploads, any future document-upload feature — anything that writes to Supabase's file storage — has been silently broken in production this whole time. This isn't new debt introduced by spec 0061; it predates it.
- **Something outside this repo's normal change-tracking removed these rules from production**, even though the tracking system says they're still there (explained plainly in Repo Findings & Risks). That's a process gap worth understanding, not just patching around.
- No conflicts found with any locked decision in CLAUDE.md or the Design System doc — this is a pure backend permissions fix, no UI change.

## Functional Requirements

1. A signed-in owner uploading a file in production (starting with the Vaccinations "Scan Record" feature, but this applies to any current or future upload) must have that upload actually succeed, the same way it already works in the dev and staging environments.
2. The rule enforced must stay exactly as originally designed (from `0002_storage_bucket.sql`): anyone can *view* a file in the shared "uploads" storage area (needed so the AI-scanning feature and any image previews work), but a person can only *add, change, or delete* files inside their own personal folder — never someone else's.

## Acceptance Criteria

- Given a signed-in production user, when they use "Scan Record" (or any other upload) on a real production account, then the file upload succeeds and the flow proceeds to the AI scan step, instead of failing immediately with "Something went wrong."
- Given the fix is applied, when the underlying database permissions are inspected directly, then production's storage permissions exactly match what dev and staging already have — same four rules, same conditions, nothing extra, nothing missing.
- Given the fix is applied, when an owner tries (hypothetically, this isn't a new capability being added, just confirming the existing rule still holds) to write into another user's upload folder, then it's still blocked, exactly as it is today in dev/staging.

## Test Plan

- Production's storage permissions match dev/staging exactly → **Not a Playwright test.** This is a database configuration fact, not something observable by clicking through the app, and Playwright's E2E suite only ever targets `wysker-watch-dev` (per `CLAUDE.md` and this repo's existing convention) — it has no access to production at all, by design. Verification: after the migration is applied, run the same direct query used to diagnose this bug (`select policyname, cmd, qual, with_check from pg_policies where schemaname='storage' and tablename='objects'`) against production via the Supabase CLI, linked to the production project ref, and confirm the four policy names/conditions match dev's exactly. This is a one-time manual verification step, documented here so it isn't reinvented differently next time this kind of check is needed.
- A real upload succeeds in production after the fix → `[Manual]` — this specifically needs a real production account and a real file, which is outside what the automated suite can safely or usefully simulate (E2E only runs against dev). Recommend Lynn does one real smoke test with Harper's account after this ships, the same way she found this bug in the first place.
- Dev and staging are unaffected → `[Playwright: existing e2e/vaccination-scan-review.spec.js suite]` — already passes against dev today; re-running it after this migration ships (which only adds missing production policies, doesn't touch dev/staging) confirms nothing regressed there.
- **Seeding/access constraints:** Applying and verifying this fix requires direct database access to production (via the Supabase CLI, linked to the production project) — this is expected and unavoidable for a permissions fix like this; it is not something a normal signed-in app session could ever do (by design — RLS policies aren't something a regular user account can create or inspect).

## Visual Reference

None — this is a backend permissions fix with no visual/UI change.

## Technical Spec

- **Schema:** New migration file, `supabase/migrations/0052_restore_storage_policies.sql` (next sequential migration number — the repo's most recent is `0051_test4_sitter_fixture_account.sql`). Content: the exact same four `create policy` statements from `0002_storage_bucket.sql` (`uploads_public_read`, `uploads_insert_own_folder`, `uploads_update_own_folder`, `uploads_delete_own_folder`), each preceded by `drop policy if exists <name> on storage.objects;` so the migration is safe to run regardless of whether a given policy already exists — this makes it safe to run even though production's own history claims `0002` already ran (see Repo Findings & Risks for why that claim can't be trusted at face value here). Note for whoever implements this: this exact idempotent-migration pattern (`drop ... if exists` immediately before `create`) doesn't currently appear anywhere else in this repo's migration history — it's the standard, correct Postgres approach for a safely-rerunnable policy statement, not something copied from an existing precedent here, since Postgres has no native `create policy if not exists`. The storage *bucket* itself (`uploads`, public, no size/type restrictions) is confirmed to already exist identically in dev/staging/production — only the access-control policies are missing in production, so this migration does not touch the bucket definition at all, only the policies.
- **Components/files touched:** None in `src/` — this is entirely a database-side fix. `storageClient.js` and `VaccinationSection.jsx` are listed above only because they're what *calls* into these permissions and is what will start working once this ships; neither needs to change.
- **Deployment:** Per `CLAUDE.md`'s standing rule, backend changes (migrations) need to be pushed to all three Supabase projects. In this case: dev and staging already have the correct policies (confirmed directly), so pushing the migration there is a no-op (the `drop policy if exists` guard means it runs cleanly without duplicating anything) — only production actually needs the fix to take effect. Still push to all three, per the standing rule, so all three environments' migration histories stay in sync going forward.
- **Design System compliance:** N/A — no UI change.
- **Constraints from CLAUDE.md / locked decisions:** None conflict. This restores the originally-designed behavior from `0002_storage_bucket.sql`; it doesn't change the rule itself.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. No other migration or policy anywhere touches `storage.objects` — `0002` is the only place these rules are defined.
- **Technical debt / risk pattern worth knowing about:** This is the real finding, and it's bigger than just this one bug. Production's own migration-history table says migration `0002` was successfully applied — but when the actual security rules it's supposed to create were checked directly, they weren't there. No other migration ever removes them, so something *outside* the normal migration system (most likely a one-off manual change made directly in the Supabase dashboard, or a database restored from a backup taken before these rules were ever added) caused production's real settings to drift away from what its own history claims. **The practical risk:** "this migration says it's been applied" is not actually proof that its effects still exist — for this project or any other. There is currently no automated check anywhere in this repo (not in CI, not in the deploy process) that would have caught this drift, and it could just as easily happen again, to this policy or a different one, without anyone noticing until a real feature breaks in production the way this one did. A reasonable, low-effort follow-up (not part of this spec's fix, but worth deciding on separately) would be a periodic check — even a simple manual one run occasionally — that directly compares each environment's actual database security rules against each other, the same way this bug was found, rather than trusting the migration history alone.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** Nothing on record anywhere (no punch list entry, no prior spec) mentions this — it was previously invisible because nothing in the app's automated testing exercises a real production upload (E2E only targets dev, per existing convention), so there was no way anything would have caught this without someone testing a real upload feature against real production, which is exactly how it surfaced.

## Non-Goals

- Not building any automated cross-environment policy-diff tooling — flagged above as worth considering separately, but not part of this fix.
- Not auditing every other table's RLS policies across all three environments for the same kind of drift — this spec fixes the one confirmed, concrete case (storage uploads) that's actively breaking a real feature. A broader audit is a reasonable future idea, not scoped here.
- Not changing who can upload files or what they can do with them — the fix restores the original, already-designed rule exactly as `0002` defined it; it doesn't loosen or tighten anything.

## Open Questions

None — investigation and Lynn's decision (write this as a tracked migration, not a one-off manual fix) resolve every open question.
