# 0076_PreAlpha_Frontend_Fixes_Specification_v1

**Status:** Approved by Lynn 2026-11-21 (scope, decisions, copy, and the spec as a whole). Built on `claude/spec-0076-frontend-fixes`; PR open, not merged or deployed yet.
**Date:** 2026-11-21
**Lane:** Frontend (`src/`, `e2e/`, docs only). No migration, Edge Function, CI or `supabase/tests` change.
**Punch list:** PA-20 (P1), PA-28, PA-55, PA-58 (P2), PA-48 (P2, the check-in-history part only). Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`.
**Related files:** `src/pages/Login.jsx`, `src/pages/Register.jsx`, `src/lib/pendingOAuthConsent.js` + `src/lib/AuthContext.jsx` (kept, unchanged), `src/pages/Notifications.jsx`, `src/lib/notifications/notificationClient.js`, `src/lib/petsClient.js`, `src/pages/Pets.jsx`, `src/components/VaccinationSection.jsx`, `src/pages/PetEdit.jsx`, `src/pages/VetExport.jsx`, `src/components/IconButton.jsx`, `e2e/check-in-history.spec.js`, `e2e/login.spec.js`, `docs/testing/QA_Test_Plan.md`, `supabase/migrations/0005_notifications.sql` + `0044_vaccination_due_notifications.sql` (read only)

## Lynn — what I need from you

1. **Review this spec and say "approved" (or tell me what to change).** This blocks everything; I write no code until you approve.
2. **Later, after the PR merges:** promote the frontend build in Cloudflare. I'll name the exact row (branch `main`, commit message starting "Spec 0076").

Nothing in any Supabase dashboard. No Supabase deploy needed.

## Doesn't conflict with the Back End lane (spec 0075)

Spec 0075 (account deletion, branch `claude/gallant-maxwell-vadhux`) changes `delete-account`, `delete-pet`, a new migration `0058`, the backup script, `src/lib/privacyPolicyContent.js` and `CLAUDE.md`. **This spec touches none of those files.** Both specs add test cases to `docs/testing/QA_Test_Plan.md`, but in different sections (0075 in §5.8, this one in the login, notifications and pet sections), so git can combine them. Whichever merges second gets a quick check of that file. Spec 0075 will create new "pet passed to you" notifications. The new Clear buttons treat them like any other notification, so nothing in 0075 needs to change.

## Before You Approve This

1. **Good news on "Clear": vaccine reminders already vanish once they're read.** The Notifications page already hides any vaccine reminder that has been read (`Notifications.jsx`). So marking a reminder read on Clear removes it from the list, the same way deleting it would. It still won't come back, because the daily reminder job sees it was already sent. The one case where it *will* reappear is when the vaccine moves to the next stage (for example "due in 7 days" becomes "due today"). That's a new reminder, and showing it is correct.
2. **Hiding Google also hides the "I agree to the Terms" checkbox on the Login page.** On Login, that checkbox exists only to unlock the Google button; email sign-in never needs it. Without Google it would be a checkbox that does nothing. Register keeps its checkbox, because it also unlocks Sign Up.
3. **Google is hidden with one on/off switch, not deleted.** The Google code (including spec 0047's consent handoff across the redirect) stays in place behind a single setting. Turning Google back on later is a one-line change plus the Supabase and Google setup.
4. **I found a bug in the "is this a pet I only sit for?" check that PA-28 depends on.** Today it counts *any* pet in a sit you were invited to as sitter-only, even a pet you own. Normally harmless, but this spec uses the check to block Edit Pet. An owner who was ever added as a sitter on their own pet's sit (it happens in testing) would be locked out of editing their own pet. The fix: a pet you own or co-own is never sitter-only. This also fixes the Pets tab, which would wrongly put such a pet under "Pets I Sit".
5. **Sitters can only reach Edit Pet and Vet Report by typing the address.** The app never shows them a button to either page (a sitter's pet card only opens Trends). So for those two the fix is a "Only this pet's owners can do this" screen with a Back button, rather than hiding buttons. The database already stops a sitter from saving changes. This makes the page say so up front instead of failing on Save.
6. **Scan Record was the real leak.** When an owner scans a vet invoice, the app sends the names of *all* pets it can see to the AI, including pets the owner only sits for. It could then attach a scanned line to that sitter-only pet, and the save would fail. After this fix, the AI only hears about pets the owner owns or co-owns.
7. **Out of scope, but found: other screens also mix in sitter-only pets.** Home's daily check-in cards, Ask Wysker's pet picker and the Pet Sitter page's pet picker all use the same unfiltered pet list. The Pet Sitter page belongs with PA-60 (sitter permissions, a Back End lane item). I recommend adding Home and Ask Wysker to the punch list as a new item rather than widening this spec. Lynn chose a new item: PA-61.
8. **The 44px "x" fix needs one small addition to the shared icon button.** The shared `IconButton` always draws a bordered circle. That looks wrong inside a soft chip, and the Design System says chips have no outlines. I'll add a plain look (no background or border, still a 44px tap area) to the shared component, rather than hand-building a one-off button. The same tiny "x" buttons exist on the Food and Medication sections (2 more places). They're listed in Repo Findings, not fixed here.
9. **Notifications seeding needs the CLI, so one test is local-only.** Normal users can't create notifications (only the server can), so the new end-to-end test seeds them through `supabase db query --linked`, the same way `vaccination-due-reminders.spec.js` does. That means it's skipped in CI, like that one. The "what does Clear do to each notification" logic also gets a unit test, which does run in CI.
10. **The bell's unread number may be stale today.** The header looks up the count only once, when it first appears, so marking something read may not update the bell until a full reload. This spec makes it look again on every page change. Without that, AC3 couldn't pass.
11. Self-review found no duplicate features, no conflicts with locked decisions and no new debt beyond what's listed above.

## Functional Requirements

1. **Google button (PA-20).** The "Continue with Google" button no longer appears on the Login or Register page, so nobody can reach the error page it leads to today. Login's Terms checkbox, which only served that button, goes too. Email sign-in and sign-up work exactly as before.
2. **Clear notifications (PA-58).** On the Notifications page, people can:
   - **Dismiss one** notification with an "x" on its row.
   - **Mark all read** with one button, which shows only when something is unread.
   - **Clear all** with one button, which shows whenever the list has anything in it. It asks "Clear all notifications?" first.
   For dismiss and Clear all: a vaccine reminder is marked read (which already removes it from the list, and stops it coming back). Every other notification is deleted. Either way it leaves the list straight away. If saving fails, it reappears and an error message explains.
3. **Sitter-only pets stay out of owner-only screens (PA-28).**
   - **Scan Record** only offers the AI, and only matches scanned lines to, pets the person owns or co-owns.
   - **Edit Pet** and **Vet Report**, opened for a pet the person only sits for, show a short "Only this pet's owners can do this" message and a Back button, instead of the form or the download.
   - A pet the person owns or co-owns is never treated as sitter-only, even if they're also listed as its sitter.
4. **Edit Pet's "x" buttons (PA-55).** The buttons that remove a nickname or a favorite activity are easy to tap, with a tap area at least 44 by 44 pixels, while the chips look the same as today.
5. **Check-in history test (PA-48, part).** The automated check-in history tests pass on any day of the month, not only after the 15th.

## Acceptance Criteria

- **AC1.** **Given** a signed-out visitor, **when** they open Login or Register, **then** there's no "Continue with Google" button, and Login has no Terms checkbox. Register still has its Terms checkbox, and Sign Up stays disabled until it's ticked.
- **AC2.** **Given** an existing email account, **when** they sign in from Login, **then** they land on Home, the same as today.
- **AC3.** **Given** a person with one unread ownership notice and one unread vaccine reminder, **when** they tap "Mark all read", **then** the ownership notice shows as read, the vaccine reminder disappears, and the bell's unread count is 0 once they go back.
- **AC4.** **Given** the same two notifications, **when** they tap the "x" on the ownership notice, **then** it disappears and is still gone after a reload (deleted).
- **AC5.** **Given** the same two notifications, **when** they tap "Clear all" and confirm, **then** the list shows "No notifications yet." After a reload it's still empty. The ownership notice no longer exists, and the vaccine reminder still exists but is marked read.
- **AC6.** **Given** "Clear all", **when** they cancel the confirmation, **then** nothing changes.
- **AC7.** **Given** a vaccine reminder that was cleared, **when** the daily reminder job runs again at the same stage, **then** no new reminder appears. (Guaranteed by the existing job's "already sent this stage" check.)
- **AC8.** **Given** a dismiss or clear that fails to save, **then** the notification comes back and an error message is shown.
- **AC9.** **Given** an owner who also sits for a friend's pet named "Rex", **when** they scan a vet invoice that mentions "Rex", **then** the review step never assigns any line to Rex. Unmatched lines go to the pet whose page the scan started on, as today.
- **AC10.** **Given** a sitter, **when** they open `/pet/<a pet they only sit for>/edit` or `/pet/<that pet>/export`, **then** they see "Only this pet's owners can do this" and a Back button, and no form or download.
- **AC11.** **Given** an owner who is also listed as a sitter on a sit for their own pet, **then** that pet stays under My Pets, and Edit Pet and Vet Report work normally for it.
- **AC12.** **Given** Edit Pet with a nickname and a favorite activity, **then** each "x" has a tap area of at least 44×44 pixels, and tapping it removes that chip.
- **AC13.** **Given** any date, including the 1st–15th of a month, **when** `check-in-history.spec.js` runs, **then** it passes.

## Test Plan

- **AC1** → **Playwright**, `e2e/login.spec.js` (extend): on Login and Register, the "Continue with Google" button has count 0; Login has no Terms checkbox; on Register, Sign Up is disabled until the checkbox is ticked.
- **AC2** → already covered by `login.spec.js`'s existing sign-in test. No new test.
- **AC3–AC6, AC8** → **Vitest** unit test for a new `planClear(notifications)` helper in `notificationClient.js`, which decides per row: delete or mark read. Runs in CI. Plus **Playwright** `e2e/notifications-clear.spec.js` (new) for AC3, AC4, AC5 and AC6. It seeds one ownership notice and one vaccine reminder for test1@ with `supabase db query --linked` (the existing `vaccination-due-reminders.spec.js` pattern; normal users can't insert notifications, per migration 0005). It's **skipped in CI** for the same reason as that file. Each test seeds its own fresh rows and deletes them afterwards. AC8 (failure) is covered by the unit test only: forcing a real network failure in Playwright would mean intercepting requests, which this suite doesn't do anywhere yet.
- **AC7** → **not a new test.** It's the existing job's rule in migration 0044 ("already sent this exact stage, read or unread, don't duplicate"). Checked by reading the code. This spec doesn't change it.
- **AC9** → **Vitest** on the pet-filtering helper (owned and co-owned pets kept, sitter-only removed). The full scan isn't Playwright-tested here, because it calls the real AI. `vaccination-scan-review.spec.js` already stubs the AI for the review step, and gets one extra case if its stub can add a sitter-only pet's name cheaply. Otherwise this is manual.
- **AC10** → **Playwright**, `e2e/pet-sitter.spec.js` (extend, using test4@'s existing sitter sign-in in that file): visit both addresses for the test's sitter-only pet and expect the message.
- **AC11** → **Vitest** on `getSitterOnlyPetIds` with mocked data (an owned pet that's also in a sit stays out of the set). Setting up a real "sitter on my own pet" sit in Playwright would collide with the 0073 rule that sit invites can only be claimed by invite, so this stays a unit test.
- **AC12** → **Playwright**, extend `e2e/pet-edit-conditions.spec.js`: measure the "x" button's size (≥44×44) and tap it.
- **AC13** → the fix *is* the test. Verified by running the file with the clock faked to the 3rd of a month (Playwright's `page.clock`), as well as today.
- **Seeding/access constraints:** notifications need the CLI against the linked dev project, as above (local only). Everything else uses normal sessions for test1@ and test4@.
- **QA_Test_Plan.md:** add cases for AC1, AC3–AC6, AC10 and AC12 in their existing sections. Change the Google OAuth row (currently `[Manual]`, Critical) to "Hidden until Google sign-in is set up (spec 0076)".

## Visual Reference

None provided. Layout for Notifications: "Mark all read" and "Clear all" are two small text-style buttons on the right of the page header, on the same row as the title. Each non-reminder row gets an "x" at its right edge. Vaccine reminder rows get the "x" in their top-right corner, beside the existing View and Snooze buttons. Every new control has a 44px tap area. Confirmation uses the shared `BottomSheet` with Cancel and "Clear all".

## Technical Spec

- **Schema:** none. Delete and update are already allowed by `notifications_delete_own` / `notifications_update_own` (migration 0005).
- **PA-20:**
  - New `src/lib/authProviders.js` exporting `GOOGLE_SIGN_IN_ENABLED = false`, with a comment on what turning it on needs (Google Cloud OAuth client, Supabase → Auth → Providers → Google on all 3 projects, redirect list per `0006 Technical Standards.md` §11).
  - `Login.jsx`: wrap the Google button *and* the `login-agree-terms` label in `{GOOGLE_SIGN_IN_ENABLED && …}`.
  - `Register.jsx`: wrap only the Google button.
  - `handleGoogleLogin`, `pendingOAuthConsent.js` and AuthContext's consent read stay as they are.
- **PA-58:**
  - `notificationClient.js` gets `deleteNotification(id)`, `markAllRead()` (`update({read:true}).eq('read', false)`; RLS scopes it to the signed-in person) and `planClear(rows) → { deleteIds, markReadIds }`, with `related_type === 'vaccination_due'` going to `markReadIds`.
  - `clearNotifications(rows)` runs both in one go (`.in('id', …)`).
  - `Notifications.jsx`: optimistic removal with rollback and a destructive toast on error. The header buttons use `Button variant="ghost" size="sm"` with `min-h-11`. The confirmation uses `BottomSheet`. The row's "x" uses `IconButton` (plain look, see PA-55).
  - The non-reminder row is currently one big `<button>`. It becomes a `div` with an inner tap button and a separate "x", so buttons aren't nested inside buttons (which is invalid HTML and breaks screen readers).
  - The bell count: `AppHeader.jsx` fetches `getUnreadCount()` once, when it first appears. If the header stays mounted while you move between pages, the bell can show a stale count, even after today's mark-one-read. Change it to refetch on every route change (`useLocation().pathname` as the effect's dependency). That's one small query per page change.
- **PA-28:**
  - `petsClient.js`: `getSitterOnlyPetIds()` subtracts pets with `created_by === me.id` and pets in `PetCoOwner.filter({ co_owner_user_id: me.id })`.
  - New `listOwnedPets(order)` = `Pet.list(order)` minus sitter-only ids.
  - `VaccinationSection.jsx` `handleScan` uses `listOwnedPets()` in place of `entities.Pet.list()`. If the sitter check fails, it falls back to the current pet only. It never sends the unfiltered list.
  - `PetEdit.jsx` and `VetExport.jsx` call `getSitterOnlyPetIds()` alongside `Pet.get` and render a small shared `OwnersOnlyNotice` (new, `src/components/OwnersOnlyNotice.jsx`: an icon, one line of text and a Back `Button`; tokens only).
  - Copy: "Only this pet's owners can do this." Copy approved by Lynn 2026-11-21.
- **PA-55:**
  - `IconButton.jsx` gets a `variant` prop. `'default'` (today's look) and `'plain'` (`bg-transparent`, no border, still `h-11 w-11`, icon size via `iconClassName`).
  - `PetEdit.jsx` chips use `<IconButton variant="plain" icon={X} iconClassName="h-3.5 w-3.5" aria-label={`Remove ${n}`} className="-my-3 -mr-3" />`. The negative margins keep the chip the same visible size while the tap area grows to 44px.
- **PA-48 (part):** `e2e/check-in-history.spec.js` gets a `showMonthOf(calendar, isoDate)` helper. It clicks "Previous month" once for each month between today and the seeded date, and runs before tapping a seeded day. Same for the two "blank day" tests if the day they pick can fall in the previous month. Also use test1@'s time zone for `isoDateDaysAgo`, not UTC, so the seeded date matches the calendar near midnight.
- **API / Edge Functions:** none.
- **Design System compliance:** checked against `0005 Design System.md` including Amendments 1–12. New controls use `Button`, `BottomSheet` and `IconButton` (#8, #11). There are no new raw colors, and text stays ≥13px (#7). The new `plain` IconButton look exists so the chips keep their "no outline" rule (#5); it's a component-level option, not a one-off button. `OwnersOnlyNotice` uses tokens only and the single type family (#2). Existing debt in `Notifications.jsx` (its skeleton uses `rgba(255,255,255,0.04)`, against #4) is fixed in passing to `bg-card`, since that file is being edited anyway. The `design-system-check` skill runs after the build.
- **Constraints from CLAUDE.md / locked decisions:** Frontend lane only. No Vibe/check-in model change. Error handling follows the existing destructive-toast pattern. User-facing copy goes to Lynn first (OQ2).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none for Clear. The page only has mark-one-read and snooze today. For PA-28, `getSitterOnlyPetIds()` is the one existing sitter-only check (Pets tab, Accept Invite). This spec extends it instead of adding a second one.
- **Technical debt nearby:**
  - `getSitterOnlyPetIds()` wrongly counts owned pets as sitter-only (Before You Approve, item 4). Fixed here.
  - The Food and Medication sections have the same tiny (~22px) "x" delete buttons (`FoodSection.jsx:197`, `MedicationSection.jsx:337`). Not fixed here; worth a punch-list line.
  - The Notifications page has no error handling when loading: a failure leaves the loading skeleton up forever. Fixed in passing (it shows an error line), since this spec rewrites the page's actions.
  - `check-in-history.spec.js` builds dates in UTC (`toISOString`), while the calendar uses the person's time zone.
- **Orphaned features nearby:** none. The Google code stays wired and only goes unused while the switch is off. That's deliberate and documented in `authProviders.js`.
- **Punch list / known issues in this area:**
  - PA-60 (sitter permissions on the Pet Sitter page) is close but Back End lane, and untouched here.
  - PA-12 (Vet Report contents) is separate.
  - PA-48's other half (`toast-visibility.spec.js` timing out sometimes) isn't included. It needs investigation first.
  - PA-13 (consent for invited co-owners/sitters) is unaffected; Login's removed checkbox recorded nothing.

## Non-Goals

- Turning Google sign-in on.
- A server-side "hidden" flag for notifications.
- Filtering sitter-only pets out of Home, Ask Wysker or the Pet Sitter page (PA-61 / PA-60).
- Server-side checks on who may download a Vet Report (PA-12's Edge Function).
- Fixing Food/Medication's small buttons, or the toast-visibility timeout.

## Open Questions

Both resolved by Lynn on 2026-11-21.

1. **Resolved: new item.** Home and Ask Wysker's sitter-only pets are now **PA-61** on the punch list, not part of this spec.
2. **Resolved: copy approved as written:**
   - "Only this pet's owners can do this." (Edit Pet / Vet Report, for sitters)
   - "Clear all notifications?" with buttons "Cancel" and "Clear all"
   - "Mark all read"
   - Error: "Couldn't update your notifications. Please try again."

## Build Notes (2026-11-21)

1. **Where "Mark all read" and "Clear all" sit.** They're on their own row just above the list, right-aligned, not on the title row as the Visual Reference said. The 28px title plus two buttons doesn't fit across a phone screen.
2. **Two new bits of on-screen text that weren't in the approved copy list.** If the Notifications page can't load, it now shows "We couldn't load your notifications." and a "Try again" button. Before, it showed the loading placeholder forever (Repo Findings). Approved by Lynn 2026-11-21.
3. **check-in-history fix, simpler than planned.** The test waits for the month to finish loading, then steps back one month if the seeded day isn't there. Seeds are at most 15 days old, so one step is always enough. The time-zone change wasn't needed, because being a day off either way doesn't change which month the day is in. The previous-month path was checked by temporarily seeding 25 days back (passed, then reverted). Faking the browser clock wouldn't have worked, because the seeding runs outside the browser.
4. **AC9.** The `vaccination-scan-review.spec.js` stub wasn't extended. AC9 is covered by `src/lib/petsClient.test.js` plus a manual scan, as the Test Plan allowed.
5. **Test results.**
   - `npm run lint`, `npm run typecheck` and `npx vitest run` (152/152) all pass.
   - Playwright: every new test passes: `login.spec.js` (Google hidden), `notifications-clear.spec.js` (4, local), `pet-sitter.spec.js` (owners-only notice), and `pet-edit-conditions.spec.js` (44px chips).
   - 5 older tests in `check-in-history.spec.js` and `pet-edit-conditions.spec.js` failed in the combined run, and each passed when run alone.
   - Cause: **`delete-pet` on dev currently crashes (`WORKER_ERROR`)**, so each test's cleanup fails and leaves an identically named pet behind for the next test. That function is being rebuilt by the Back End lane (spec 0075). It isn't touched here.
   - **Full suite re-run later on 2026-11-21: 105/105 passed locally** (nothing skipped). By then `delete-pet` on dev was working again (its outage was temporary), and the 14 leftover test pets were deleted through it.
6. **Design-system-check:** clean for new code.
   - Pre-existing, not changed: Edit Pet's and Vet Report's sticky headers use a hand-picked `z-20` (Amendment #12) and `border-white/8` instead of `border-border`.
   - The "Clear all" confirm button uses the app-wide default primary button style (the known Amendment #1 issue).

