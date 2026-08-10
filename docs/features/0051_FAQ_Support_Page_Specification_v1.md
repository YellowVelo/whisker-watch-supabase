# 0051_FAQ_Support_Page_Specification_v1

**Status:** Approved
**Date:** 2026-08-10
**Related files:** `src/pages/Support.jsx`, `src/App.jsx`, `src/components/BottomTabBar.jsx`, `src/components/ui/accordion.jsx`, `docs/foundation/0005 Design System.md`, `docs/launch-punch-list.md`, `e2e/fixtures.js`

## Before You Approve This

Plain-language flags from the self-review pass:

- **The Support page is currently an empty placeholder.** It has no content and no support email today — this spec is filling in genuinely new ground, not replacing a working feature. Low risk, but worth knowing you're not overwriting anything real.
- **There's an unused accordion (expand/collapse) building block already sitting in the code**, installed but never styled or used anywhere. Rather than build a second one, this spec reuses and re-skins that existing one so the FAQ matches the rest of the app's look. If it turns out to be awkward to re-skin once someone starts building it, that's a legitimate reason to come back and build a fresh one instead — flagged as an Open Question below so it doesn't get silently swapped without you knowing.
- **The email `support@wyskerwatch.com` does not exist anywhere in the app or its settings today** — not as a reply-to address for any automated email, not as a constant anywhere in the code. This spec only adds it as *display text with a tap-to-email link* on the Support page. It does not set up a real inbox, autoresponder, or make sure anyone is actually monitoring that address — that's an operational step outside of what code can do, and it's called out as a Non-Goal below.
- **No conflicts found** with CLAUDE.md's locked decisions, with the Design System's locked rules, or with anything on the current launch punch list — FAQ/Support content isn't tracked anywhere else, so there's no risk of two efforts colliding.

## Functional Requirements

1. The Support page (reached today from the Menu/Settings screen's "Support" row) stops saying "coming soon" and instead shows real content: a Frequently Asked Questions section and a way to contact support by email.
2. The FAQ section shows a list of questions. Tapping a question expands it in place to reveal the answer, and tapping it again collapses it. Multiple questions can be open at once (no need to close one to open another).
3. The FAQ content itself covers common Alpha-tester questions about how the app works — what it is, how daily check-ins work, sharing a pet with a co-owner or sitter, deleting an account, and what the app is (and isn't) a substitute for. The exact wording of each question/answer is listed below as a starter draft for review, not final copy.
4. A "Contact us" area shows the email address `support@wyskerwatch.com` as tappable text — tapping it opens the device's mail app with that address pre-filled in the "To" field.
5. Nothing about the existing Support page's back-button/header behavior changes.

## Draft FAQ Content (for review — not final)

1. **What is Wysker Watch?**
   Wysker Watch helps you keep track of your cat or dog's day-to-day health and wellbeing in one place — quick daily check-ins, a timeline for medications, vaccinations, vet visits, and more, all in one app.

2. **How does the daily check-in work?**
   Each day you tell us how your pet's day went — Great, Off, Tough, or you can skip. Separately, if you log any symptoms that day, we show whether that count is trending up, down, or steady compared to yesterday. These two things are tracked separately on purpose — a "tough day" doesn't require a symptom, and a symptom doesn't automatically mean a bad day.

3. **Can I share a pet's profile with someone else, like a partner or family member?**
   Yes — you can invite a co-owner by email from the pet's profile. A co-owner has full access to view, log, and edit that pet's information, the same as you.

4. **Can I give a pet sitter temporary access?**
   Yes — there's a separate, more limited "invite a sitter" option that gives someone access while you're away, without giving them full co-owner permissions.

5. **Is Wysker Watch a replacement for my veterinarian?**
   No. Wysker Watch is a tracking and organization tool, not a medical device, diagnostic tool, or substitute for professional veterinary care. Always contact your vet (or an emergency vet) for anything urgent or concerning.

6. **Can I delete my account?**
   Yes — this is available in Settings, and it's a permanent action that removes your account and data. You'll be asked to confirm before it happens.

7. **I found a bug or something looks wrong — what should I do during the Alpha test?**
   Please email us at support@wyskerwatch.com with what you were doing, what you expected, and what happened instead — screenshots help a lot.

8. **How do I contact support?**
   Email support@wyskerwatch.com and we'll get back to you.

## Acceptance Criteria

1. Given a signed-in user navigates to the Support page, when the page loads, then it shows a list of FAQ questions instead of the "coming soon" message.
2. Given the FAQ list is showing, when the user taps a question that is collapsed, then its answer expands below it.
3. Given a question's answer is expanded, when the user taps that question again, then it collapses.
4. Given two different questions, when the user expands both, then both remain expanded at the same time (no auto-collapse of others).
5. Given the Support page is showing, when the user looks at the contact area, then `support@wyskerwatch.com` is visible as tappable text.
6. Given the user taps the support email, then the device's default mail app opens with `support@wyskerwatch.com` pre-filled as the recipient.
7. Given a screen reader or keyboard-only user, when they navigate to an FAQ question, then it is reachable and operable via keyboard (Tab + Enter/Space) and announces its expanded/collapsed state.

## Test Plan

- AC1 (FAQ list replaces placeholder) → Playwright test: navigate to `/support`, assert the "coming soon" text is gone and at least one FAQ question is visible.
- AC2 (tap expands) → Playwright test: click a collapsed question, assert its answer text becomes visible.
- AC3 (tap again collapses) → Playwright test: click an expanded question, assert its answer text is hidden again.
- AC4 (multiple open at once) → Playwright test: expand two different questions, assert both answers are visible simultaneously.
- AC5 (email visible) → Playwright test: assert `support@wyskerwatch.com` text is present on the page.
- AC6 (mailto link) → Playwright test: assert the email element's `href` attribute equals `mailto:support@wyskerwatch.com` (a real Playwright test cannot assert that an OS mail client actually opens — checking the `href` is the correct and standard way to verify this without leaving the browser).
- AC7 (keyboard/screen-reader access) → Not covered by an automated Playwright test in this pass — Radix's Accordion primitive (the component this reuses) ships keyboard nav and `aria-expanded` state out of the box, so this is inherited correctness rather than new code, but it should still get a manual keyboard-only check once built, the same way any new interactive component gets a manual pass before ship.
- **Seeding/access constraints:** none — the Support page and its content are static, reachable by any signed-in user via the existing Menu → Support navigation already used by other e2e specs (see `e2e/fixtures.js`'s existing sign-in fixture). No server-only data or admin-only tables are involved.

## Visual Reference

No mockup or screenshot was provided for this spec. The layout follows the existing Support page's header pattern (back button + title, unchanged) with the FAQ accordion and contact section added below it, styled per the Design System tokens noted in Technical Spec.

## Technical Spec

- **Schema:** None. This is static, hardcoded FAQ content — no new table, column, or migration. If Alpha feedback later calls for FAQ content to be editable without a code deploy, that would be a separate future spec, not part of this one.
- **Components/files touched:**
  - `src/pages/Support.jsx` — replace the "coming soon" placeholder body with the FAQ accordion list and the contact-email section. Header/back-button code stays as-is.
  - `src/components/ui/accordion.jsx` — re-skin the existing (currently unused) Radix accordion primitive to match the Design System's tokens (see below) rather than building a new expand/collapse component from scratch. This is a styling change to an existing file, not a new component.
  - No router change is needed beyond what already exists — `/support` already exists in `src/App.jsx` and is already linked from `BottomTabBar.jsx`'s Menu config; nothing about routing changes since the FAQ lives on the existing page rather than a new one.
- **API / edge functions:** None. No backend calls are needed to display static FAQ text or build a `mailto:` link.
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including its Amendments block. One real conflict found and resolved in this spec, rather than carried forward:
  - The existing `accordion.jsx` primitive uses `text-sm` for the question trigger, which maps to 14px — inside the locked 13–14px floor, so no size violation. However its trigger only has `py-4` padding with no explicit minimum height, which is not guaranteed to reach the locked 44px minimum touch target on all font/content combinations. This spec adds an explicit `min-h-11` (44px) to the accordion trigger when it's themed, rather than trusting padding alone to clear the floor.
  - `hover:underline` in the existing primitive is a desktop-only affordance that does nothing on the mobile-first touch UI this app targets; it's harmless but should be dropped during the re-skin since it doesn't match this app's other interactive-row patterns (e.g. `ListRow` uses background/chevron changes, not underline, to indicate interactivity).
  - Color: the re-skinned accordion must use `bg-card`/`border-border` tokens (matching Amendment #4's card-token standardization) rather than any raw color — no raw hex is introduced by this change.
  - Icon: the chevron indicator already uses `lucide-react`'s `ChevronDown`, consistent with the app's Lucide icon convention — no emoji-as-icon risk.
  - Typography: body/answer text must use the Inter-only, no-serif rule (Amendment #2) and the Secondary-text (white 70%) opacity tier for answers per Amendment #3, rather than an arbitrary opacity value.
  - The `support@wyskerwatch.com` link should visually read as tappable text (e.g. underline or primary-color text), not as a full `IconButton`/`ListRow` — it's inline text with a link behavior, not a navigation row, so neither shared component is a forced fit here; this is noted so it isn't flagged later as a missed reuse opportunity.
- **Constraints from CLAUDE.md / locked decisions:** No conflict. This feature doesn't touch Vibe/check-in scoring, doesn't need its own AI-rate-limit or AI-guardrail work (no AI call involved), doesn't need `useFocusTrap` (it's an in-page section, not a modal/bottom-sheet/full-screen overlay), and doesn't touch the OAuth-redirect sessionStorage pattern. The `design-system-check` skill should still be run against the changed `.jsx` files once this is implemented, per CLAUDE.md's standing instruction — noted here so it isn't skipped at implementation time.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. No FAQ page, component, or content exists anywhere in the app today (checked code and docs).
- **Technical debt nearby:** The `src/components/ui/accordion.jsx` and `src/components/ui/collapsible.jsx` primitives exist in the codebase but are currently unused by any real page — installed but never adopted. This spec is what finally puts one of them to use; flagging so you know this isn't newly introduced debt, it's pre-existing and this closes the gap rather than opening a new one.
- **Orphaned features nearby:** Same accordion/collapsible primitives as above — worth knowing they were sitting there unused before this spec, in case a future audit flags them and wonders why.
- **Punch list / known issues in this area:** None found. Neither "FAQ" nor "Support page" content appears anywhere on `docs/launch-punch-list.md` today — this is genuinely new scope, not something already tracked elsewhere that risks double-work.

## Non-Goals

- Setting up an actual monitored inbox at `support@wyskerwatch.com`, an autoresponder, or any email-receiving infrastructure — this spec only puts the address on the page as a `mailto:` link. Lynn has confirmed this inbox already exists and is monitored, so no further operational setup is needed on that front.
- An in-app contact/feedback form (type a message without leaving the app) — out of scope; only a mailto link is in scope for this Alpha pass.
- A searchable or categorized help center, multiple FAQ pages, or admin-editable FAQ content management — this is a single static list on the existing Support page.
- Any change to how the Support row is presented or reached from the Menu/Settings screen.
- Any change to the Vibe/check-in scoring model itself — FAQ content merely describes it in plain language; it doesn't touch `src/lib/checkin/*`.

## Open Questions

All resolved:

1. **Final FAQ wording/scope.** Confirmed — the 8 questions in the Draft FAQ Content section are approved as-is.
2. **Re-skinning the existing accordion vs. building fresh.** Confirmed — re-skin the existing unused Radix accordion primitive; falling back to a new shared component is acceptable only if re-skinning proves genuinely awkward during implementation, not as a default choice.
3. **Order of FAQ questions.** Confirmed — keep the general → specific → contact order as drafted.
4. **Support email monitoring.** Confirmed by Lynn — `support@wyskerwatch.com` is a real, monitored inbox; no separate operational setup needed.
