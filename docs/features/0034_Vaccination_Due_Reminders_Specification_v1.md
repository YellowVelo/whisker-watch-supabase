# 0034_Vaccination_Due_Reminders_Specification_v1

**Status:** Draft
**Date:** 2026-08-01
**Related files:** `supabase/migrations/0005_notifications.sql`, `src/lib/notifications/notificationClient.js`, `src/pages/Notifications.jsx`, `src/components/NotificationBell.jsx`, `src/components/VaccinationSection.jsx`, `src/components/ExportCalendarButton.jsx`, `supabase/migrations/0023_analytics_daily_summary.sql` (pattern reference), `docs/launch-punch-list.md`, `docs/features/0004 Navigation RefreshV2.md`

## Before You Approve This

- This closes one specific item from the punch list's "Contextual Alerts" entry (vaccination due) and deliberately leaves the other two (medication due, weight decreased from baseline) as **not built** — flagged in Non-Goals, not silently dropped. The punch list item itself should be updated to reflect this partial resolution once this spec ships, not left as one undifferentiated bullet.
- This does **not** create a new global "Alerts" page — it reuses the bell/Notifications page that already exists. `0004 Navigation RefreshV2.md` explicitly warns against building a global alerts page and against cluttering Home with historical alerts; this spec respects both by routing everything through the existing bell, not a new surface.
- The `notifications` table needs four new columns (explained in plain language below) to make snoozing, staged escalation, and "don't remind me again for the same vaccine every single day" possible at all — it currently has no way to know which vaccination a given notification is even about. This is a real schema change, not just new application code.
- Reconnecting the calendar-export button (per your decision) restores it exactly as it was already built — both medications and vaccinations, one date per record. No frequency/dosage logic is added or implied by this change.
- **Correction to `docs/launch-punch-list.md` line 143:** that line says native push reminders are "blocked on Capacitor." Investigated during this spec's drafting — that's not accurate. Capacitor (wrapping the app as a native iOS/Android app) and web push (browser-level push notifications for a PWA) are two separate things; web push does not require Capacitor. The real reason to defer push is scope/effort (new subscription table, VAPID keys, service worker changes, an iOS-specific caveat), not a hard technical block. Per your decision, push is deferred anyway — ship the in-app bell now, take on web push as its own follow-up spec once the PWA is out. **Also per your decision: Capacitor/iOS App Store wrapping work itself is being pushed out to future work** — recommend the punch list be updated to reflect both of these (the corrected reasoning, and Capacitor moving to future/not-current-priority) once this spec is approved.

## Functional Requirements

As a vaccination's next-due date approaches, the pet's owner (and any co-owners on a shared pet) should see a reminder about it in the app — without having to go check the Vaccinations page themselves. That reminder shows up in the same "bell" notification icon and Notifications list already used for other in-app notices (today, that's only used for one thing: a notice when a co-owned pet's ownership changes hands).

The reminder escalates in stages as the date gets closer, rather than showing the exact same message for 30 days straight. A fresh, re-worded notification appears at each of these checkpoints, per the copy your mockup specified:

| Days out | Title | Body |
|---|---|---|
| 30 days | Vaccination Due Soon | `{Vaccine} is due for {Pet} in 30 days.` |
| 14 days | Vaccination Due Soon | `{Vaccine} is due for {Pet} in 14 days.` |
| 7 days | Vaccination Due Soon | `{Vaccine} is due for {Pet} next week.` |
| 3 days | Vaccination Due Soon | `{Vaccine} is due for {Pet} in 3 days.` |
| Due today | Vaccination Due Today | `{Pet}'s {Vaccine} vaccination is due today.` |
| Overdue | Vaccination Overdue | `{Pet}'s {Vaccine} vaccination is overdue. Update the record once it's been completed.` |

Each notification carries two buttons: **View/Update Vaccination** (jumps straight to that vaccine's existing edit form on the Vaccinations page) and **Snooze 7 Days** (hides it for a week, then it reappears — worded for whatever the current stage is by then, which may have escalated further while snoozed).

Once a vaccine becomes overdue, the reminder keeps resurfacing (respecting each 7-day snooze) for **14 days past the due date**. After that 14-day overdue window closes, the app stops automatically generating new overdue reminders for that vaccine — it won't nag indefinitely. Any reminder still sitting unread in the owner's Notifications list stays there until they act on it; only the *automatic regeneration* stops.

Separately, the owner should be able to export a pet's known upcoming due dates (both medications and vaccinations) as a calendar file they can import into iOS Calendar, Outlook, Google Calendar, or any other calendar app that accepts a standard `.ics` file. This button already exists in the code but isn't connected to any screen today — this spec reconnects it to the Vaccinations page (and, since it already covers both without extra work, the Medications page too).

## Acceptance Criteria

- Given a vaccination with a `next_due_date` that is now 30, 14, 7, or 3 days away, or due today, when the daily reminder check runs and no notification for that vaccine already exists at that same or a later stage, then the pet's owner (and any co-owners) get a new bell notification with that stage's exact title/body from the copy table above.
- Given a vaccination reminder the owner has not yet interacted with, when a day passes and the vaccine hasn't crossed into the next stage yet, then no duplicate notification is created — the owner sees one active reminder per vaccine at a time, not a growing pile.
- Given a vaccination reminder already showing (say, the 14-day stage), when the vaccine crosses into a closer stage (say, 7 days), then the newer notification replaces the older one as the active reminder (the older one is automatically marked read so it doesn't linger as a stale duplicate).
- Given a vaccination reminder notification, when the owner taps "Snooze 7 Days," then it disappears from their unread notifications immediately and does not reappear for 7 days, after which it reappears automatically — worded for whichever stage applies by then (it may have escalated while snoozed).
- Given a vaccination that is now more than 14 days past its due date with no new record logged, when the daily check runs, then no further automatic overdue reminders are generated for it (any already-sent, still-unread reminder is unaffected and remains visible until the owner acts on it).
- Given a vaccination that the owner has since logged a new/updated `next_due_date` for (i.e., they got the shot and recorded it), when the daily check next runs, then reminders are no longer generated against the old, superseded due date.
- Given a vaccination reminder notification, when the owner taps "View Vaccination" (or "Update Vaccination" on the overdue version), then they land on the Vaccinations page with that specific vaccine's existing edit form already open, ready to update.
- Given a co-owned pet, when a vaccination reminder is generated, then both the primary owner (`pets.created_by`) and every linked co-owner (`pet_co_owners.co_owner_user_id`) receive their own copy of the notification.
- Given the Vaccinations page (and the Medications page), when the owner taps "Export to Calendar," then a `.ics` file downloads containing one all-day calendar event per record that has a due date, exactly as `ExportCalendarButton.jsx` already builds it today.

## Visual Reference

- Provided mobile mockup ("In-App Notification (Bell)" + phone screenshot) → illustrates the 30/14/7/3-day "Vaccination Due" card layout: syringe icon, title, two-line body copy, unread blue tint, and the `View Vaccination` / `Snooze 7 Days` button pair. Directly drives the Acceptance Criteria above and the notification-row layout in the Technical Spec.
- Provided "Overdue Version" mockup → illustrates the overdue-stage wording and button pair (`Update Record` / `Snooze 7 Days`), and its deliberately non-guilt-tripping tone ("explains how to make it disappear" rather than scolding). Directly drives the Overdue row of the copy table above.
- Provided "Notification Detail" mockup (vaccine name, Due date, Veterinarian, Last Given, Notes, with Update/Snooze buttons) → **not built by this spec.** Per your decision, tapping the notification reuses the existing Vaccinations-page edit form instead of building this new detail screen. Keeping the mockup on file is still useful: several of its fields (Veterinarian, Last Given, Notes) already exist on the vaccination record and would need no new schema work if this detail view gets built later.
- Provided "Push Notification (Future)" copy library → **not built by this spec** (push itself is deferred, see Non-Goals), but the wording is preserved here so it doesn't get lost or reinvented later:
  - 30 days — *Vaccination Reminder* — "{Pet}'s {Vaccine} vaccine is due in 30 days."
  - 14 days — *Vaccination Reminder* — "{Pet}'s {Vaccine} vaccine is due in 2 weeks."
  - 7 days — *Vaccination Reminder* — "{Pet}'s {Vaccine} vaccine is due next week."
  - Due today — *Vaccination Due Today* — "{Pet}'s {Vaccine} vaccination is due today."
  - Overdue — *Vaccination Overdue* — "{Pet}'s {Vaccine} vaccination is overdue."

## Technical Spec

- **Schema (`supabase/migrations`, new migration file, e.g. `0044_vaccination_due_notifications.sql`):**
  - Add to `public.notifications`:
    - `related_type text` — e.g. `'vaccination_due'`, distinct from the existing free-text `type` column (kept for backward compatibility with the existing `'ownership_transfer'` rows).
    - `related_id uuid` — the vaccination record's id, so the generator job can tell "have I already notified about *this* vaccine" instead of just "does this user have any unread notification."
    - `stage text` — which checkpoint this notification represents: `'30_day'`, `'14_day'`, `'7_day'`, `'3_day'`, `'due_today'`, or `'overdue'`. This is what makes escalation possible — without it, the generator job has no way to tell "already sent the 14-day one, don't resend it, but *do* send the 7-day one once we get there."
    - `snoozed_until timestamptz` — null by default; set when the owner taps Snooze.
  - A new `security definer` Postgres function (naming pattern matches the existing `save_daily_check_ins` function from migration `0034`), e.g. `generate_vaccination_due_notifications()`, run once daily via `pg_cron` — the same scheduling mechanism already proven in production for the nightly analytics rollup (`supabase/migrations/0023_analytics_daily_summary.sql`, `cron.schedule(...)`). Each run, per vaccination with a `next_due_date`:
    1. Computes days-until-due and buckets it into a stage: `15–30` days → `30_day`; `8–14` → `14_day`; `4–7` → `7_day`; `1–3` → `3_day`; `0` → `due_today`; negative, down to and including 14 days past due → `overdue`; **more than 14 days past due → no stage, nothing generated.**
    2. If there's no vaccination to act on this day (not yet within 30 days, or more than 14 days overdue), does nothing for that vaccine.
    3. Skips generating anything while an active snooze is in effect (`snoozed_until` in the future) for that vaccine, regardless of what stage it would otherwise be at.
    4. Otherwise, if the computed stage is *new* (no existing notification for this `related_id` at that stage, and the snooze — if any — has expired), inserts one fresh notification row **per recipient** (see below) and marks any older, still-unread notification for that same vaccine as read, so the owner only ever sees the single most current stage, not a pile of stale ones.
  - **Recipients:** for each pet, the notification is generated for the primary owner (`pets.created_by`) and every linked co-owner (`pet_co_owners.co_owner_user_id` where that pet is the `pet_id`) — one row per person, so each person's own read/snooze state is independent (e.g. one co-owner snoozing it doesn't hide it for the other). Pet sitters (`pet_sitter_access`) are a separate, temporary-access concept and are **not** included — only full co-owners, matching your "co-owners get what owners get" decision.
  - This function needs `security definer` (bypasses row-level security intentionally, the same way the existing Edge Functions insert ownership-transfer notices using the service-role client) because it has to read across all users' pets/vaccinations to generate reminders, not just the currently-signed-in user's own data.

- **Design System compliance (checked against `docs/foundation/0005 Design System.md`, since no component code exists yet to run the automated design-system-check skill against — this is a manual read of the locked doc against the spec/mockup):**
  - The mockup's solid-blue-fill "View Vaccination" button conflicts with Amendment #1 (locked 2026-07-30): primary buttons must be *Charcoal background, Sky Blue outline, white text*, never a solid fill — that exact solid-fill look is the specific mistake the doc locked against. Implementation should use the app's existing shared `Button` component (`src/components/ui/button.jsx`) at its `default` variant, which already renders the correct charcoal/outline treatment, rather than reproducing the mockup's fill color literally. "Snooze 7 Days" as an outline/secondary button is already consistent with the doc.
  - The icon circle behind the syringe icon should source its color from the existing `PALETTE`/`--tone-*` tokens (the same ones `VaccinationSection.jsx`'s `getReminderStatus` already uses for overdue/due-soon/up-to-date), not a flat raw white circle as drawn in the mockup — per Amendment #6.
  - **Pre-existing gap, fixed as part of this spec (per your decision):** the unread-notification background (`Notifications.jsx:56`) was a hand-rolled raw color, `rgba(111,183,255,0.08)`, not a semantic token — exactly what Amendments #4/#6 lock against. Since this spec is already touching `Notifications.jsx`, it also fixes this in passing: `--accent` (`hsl(199 72% 67%)`, already wired to Tailwind's `accent` color) is the same Sky Blue as the hardcoded value, so the inline `style` is replaced with the Tailwind class `bg-accent/8`. One-line change, no visual difference to the user, brings the row onto a real token.

- **Components/files touched:**
  - `src/lib/notifications/notificationClient.js` — add a `snoozeNotification(id)` function (sets `snoozed_until` to now + 7 days and marks the row read, so it drops out of the unread badge count immediately).
  - `src/pages/Notifications.jsx` — for rows where `related_type === 'vaccination_due'`: render the `Syringe` icon (from `lucide-react`, already used elsewhere for vaccinations in `VaccinationSection.jsx`) in a PALETTE-token-colored circle instead of the generic bell icon; add the "View Vaccination" / "Update Vaccination" button (the app's standard `Button` component, `default` variant — see Design System compliance above; wording depends on `stage === 'overdue'`, per the copy table) that navigates to `/pet/:petId/vaccinations?edit={related_id}`; add a "Snooze 7 Days" button (`Button` `outline` variant). Other notification types (like ownership transfer) keep their current plain-row appearance — none of this is added for them. Also swap the unread-row's inline `rgba(111,183,255,0.08)` style (line 56) for the `bg-accent/8` Tailwind class — applies to all notification types, not just vaccination ones, since it's the same row treatment throughout the page.
  - `src/pages/PetVaccinations.jsx` — read an `edit` query-string parameter on mount (the app already uses this `useSearchParams`-based pattern elsewhere, e.g. `PetTrends.jsx`, `Home.jsx`) and, if present, open `VaccinationSection`'s existing edit dialog pre-loaded with that vaccination's data — reusing the dialog that's already built rather than creating a new one. Also import and render `ExportCalendarButton.jsx`.
  - `src/pages/PetMedications.jsx` (or equivalent) — import and render `ExportCalendarButton.jsx`. No query-param deep link needed here since medication reminders aren't part of this spec.
  - `src/components/ExportCalendarButton.jsx` — no changes needed; already builds both medication and vaccination events correctly.

- **API / edge functions:** None required — this is a database-scheduled function, not an Edge Function, matching the existing analytics-rollup pattern rather than introducing a new mechanism.

- **Constraints from CLAUDE.md / locked decisions:**
  - Respects `0004 Navigation RefreshV2.md`'s "do not create a global Alerts page" instruction by reusing the existing bell/Notifications page.
  - Does not touch or reference any retired scoring system (Wellness Score V1/V2, Stable/Declining/Monitor) — this feature is unrelated to Vibe/symptom-count scoring.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. `VaccinationSection.jsx` already shows an "Overdue"/"Due in Nd" colored chip per vaccine (`getReminderStatus`, lines 21-27), but that's a passive display badge on the Vaccinations page itself — it doesn't notify anyone, doesn't use the bell, and this spec doesn't change or duplicate it.
- **Technical debt nearby:** The medication form's "Get notified when it's due" toggle (`reminder_enabled` in `MedicationSection.jsx`) is a dead switch — it's saved but nothing reads it, and it may not even have a real backing database column (not found in the initial schema migration). This spec does not fix or wire up that toggle — it's explicitly a future-feature item per your direction, not part of vaccination reminders. Flagging so it isn't confused with what's being built here.
- **Orphaned features nearby:** `ExportCalendarButton.jsx` itself is exactly this — a fully built, working component with zero screens rendering it on the `main` branch today. This spec's whole calendar-export requirement is "reconnect this orphaned button," not build a new one.
- **Punch list / known issues in this area:** Directly resolves half of the P3 punch-list item *"'Contextual Alerts' ... was speced ... but never built at all."* The medication-due and weight-decreased-from-baseline halves of that same bullet remain unresolved after this spec ships — recommend splitting that punch-list bullet into three once this lands, so the resolved and unresolved parts aren't tracked as one lump.

## Non-Goals

- Medication-due reminders/alerts (the bell notification kind — not the calendar export, which already covers medication dates today and is unaffected). Explicitly deferred to a future feature, per your direction.
- Weight-decreased-from-baseline alerts. Explicitly deferred to a future feature, per your direction.
- "No check-in today" as a bell/push notification. The existing `CheckInStatusBanner` status chip on Home already covers this in a lighter-weight way and is out of scope for this spec.
- Native push notifications / browser push (an actual banner alert on the phone, even when the app is closed). Deliberately deferred by owner decision, 2026-08-01 — investigated during this spec's drafting and confirmed real web push is technically possible for this PWA *without* needing the not-yet-started Capacitor/native-app wrapping (the punch list's "blocked on Capacitor" framing conflated the two; corrected below). It's still meaningfully more infrastructure than the in-app bell (a new push-subscription table, VAPID key management, service worker changes, and an iOS caveat where push only works if the user has installed the PWA to their home screen, not in a regular Safari tab) — owner decision is to ship the in-app bell reminder first, then take on web push as its own follow-up spec once the PWA is out.
- Live calendar sync (a webcal subscription link that keeps updating automatically, or direct Google/Outlook API integration). Only the existing one-time `.ics` file download is in scope.
- Notifying pet sitters of a shared pet's vaccination reminders. Sitters (`pet_sitter_access`) are temporary-access accounts, distinct from full co-owners (`pet_co_owners`) — only co-owners receive this reminder, per your decision. Extending it to sitters is a separate future call, not assumed here.
- The read-only "Notification Detail" screen from your mockup (vaccine + due date + vet + last-given + notes, with its own buttons). Per your decision, tapping the notification instead opens the existing Vaccinations-page edit form directly — no new detail screen is built by this spec.
- Reminders that stop appearing entirely after 14 days overdue. They don't — the 14-day cap only stops *new automatic* overdue reminders from being generated; if the owner never acted on the last one sent, it stays visible in their Notifications list indefinitely, same as any other unread notification.

## Open Questions

None remaining — wording, staging, snooze behavior, co-owner delivery, the overdue cap, and the tap-through destination were all resolved during drafting. One residual judgment call for whoever implements this: the exact stage-bucketing boundaries above (e.g. treating 15–30 days out as the "30-day" stage rather than a narrower window) are a reasonable interpretation of "escalates at 30/14/7/3 days" for a job that only runs once a day, but weren't spelled out to the pixel in your mockup — worth a quick sanity-check against the copy table during implementation, not a re-ask of you.
