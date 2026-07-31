Design System

## Amendments — 2026-07-30 (Design System Consolidation)

A UI audit (`docs/Audit_Findings.md`) found the shipped app had drifted from this doc in several places, and other places where the app had converged on a de facto pattern the doc never actually specified. The decisions below are locked — they resolve those conflicts by choosing one answer, not by describing what's currently shipped. Sections further down are left as originally written where they weren't in conflict; where a section below is superseded by one of these amendments, it's marked inline with "Amended 2026-07-30" rather than rewritten in place, so the history of what changed and why stays visible.

1. **Primary buttons — doc wins, code is wrong.** Primary buttons are Charcoal background, Sky Blue outline, white text (§4, unchanged). The app currently ships solid Sky-Blue-fill/dark-text primary buttons everywhere (Add Pet, Save Check-in, Continue, dialog confirmations) — that's the thing that needs to change in a later code pass, not this doc.
2. **Typography — one family only.** Inter (SF Pro on iOS) is the only type family, full stop — including headings, empty-state copy, and dialog titles. The serif display face (DM Serif Display) found in empty states, dialog titles, and one pet-name heading is dropped entirely; nothing should use it going forward.
3. **Text opacity — collapsed to 3 tiers.** The app had drifted into at least 8 distinct white-opacity values for "muted" text. Going forward there are exactly three:
   - Primary text: white 100%
   - Secondary text: white 70%
   - Tertiary/disabled text: white 45%
   Every other in-use value (25/30/35/40/50/60/80/85%, etc.) maps to whichever of these three it's closest to in intent, not in number.
4. **Card system — standardize on `bg-card` / `border-border` tokens.** The app had two incompatible card systems: the existing `bg-card`/`border-border` token pair (already used in Dialogs and PetProfileTabs' tab panels) and a hand-rolled `rgba(255,255,255,x)` "glass card" pattern (Home, Pets, Settings, PetSummaryCard). The token pair is now the only sanctioned card treatment; the glass-card pattern is retired.
5. **Chips — soft background, no border, semantic tokens only.** Doc §4's "no outlines" rule is reaffirmed (one shipped chip variant had grown a border, contradicting it). Any chip carrying status or condition meaning must source its color from the existing semantic `--tone-*` tokens, never a raw Tailwind color class.
6. **Badges & icon backgrounds — semantic tokens only.** Account-type badges (Production/Test/Demo/Owner) and list-row icon-circle backgrounds must map onto the same `--tone-*` / PALETTE tokens already used for Vibe, instead of the separate raw hex/Tailwind values currently in use for each.
7. **Type scale floor — 13–14px, no exceptions.** Nothing renders below 13px. A few 12px instances shipped (helper copy, some labels) and need to move up to the Caption size.
8. **Component de-duplication — canonical names.** Where two components independently do the same job, one is now canonical:
   - `NavCard` + `MenuListRow` → one shared row component (icon + title + subtitle + chevron), consistent padding, 44px minimum height.
   - The two hand-built bottom-sheet shells → one shared `BottomSheet` component.
   - The two independently-built toggle/pill patterns → one shared pill/toggle component, 44px minimum height.
   - The two "type to confirm" delete dialogs → one shared `ConfirmDeleteDialog` component.

**Resolved 2026-07-31, spec 0028:** `PetProfileTabs.jsx` (and its hardcoded light-mode colors, dead `conditionColors` map) is deleted — Baseline/Medications/Vaccinations/Health Records are now standalone pages built on the same tokens as the rest of the app. No outlier remains here.

A follow-up full-coverage audit (checking every route and shared surface, not just the original six-page sample) found three more places the doc itself had never actually spoken to — not code drifting from a rule, but no rule existing yet. This system governs the whole app, including the parts that came later (the App Shell header and bottom tab bar, added in spec 0023, after this doc was first written) — so rather than carve out exceptions for them, the doc is extended below to cover them under the same principles already in place.

9. **Persistent navigation chrome is not exempt.** The App Shell's header (`AppHeader.jsx`) and bottom tab bar (`BottomTabBar.jsx`) are not a separate "chrome" category outside this system — their background and border must trace back to real tokens (`bg-card`/`border-border`, or `--background`/`--border` directly), not a one-off hardcoded value like the `rgba(10,12,22,0.92)` currently used by both. A blur/translucency effect on top of that is fine; the base color underneath it isn't exempt from being a token.
10. **Multi-series charts extend the token system rather than bypass it.** A chart that needs more colors than the five existing `--chart-1` through `--chart-5` tokens (e.g. Bloodwork's 16 lab values) should get more numbered `--chart-*` tokens added, not raw hardcoded hex values sitting outside the system. "There are more series than tokens" is a reason to add tokens, never a reason to skip them.
11. **Icon buttons are one component everywhere — no "header action" exception.** §4's "Icon buttons: Circular, minimal" applies uniformly: a page's back button and the header's Ask Wysker/Notifications buttons are the same kind of control and must share the same component and styling rules (see Amendment #8's shared icon-button consolidation) — not a distinct "header action" style carved out for itself.

Purpose

The Wysker Watch Design System defines the visual language, interaction patterns, and component standards that create a calm, premium, and emotionally supportive experience. It ensures consistency across all screens, features, and future expansions.

Wysker Watch’s design identity is inspired by Oura: clean, modern, and focused on clarity.

1. Color System

Wysker Watch uses a restrained, wellness‑oriented palette designed to feel calm, trustworthy, and non‑clinical.

Core Colors

Midnight Charcoal (#0D0F12) — Primary background; creates a premium, modern feel.

Soft Sky Blue (#6FB7FF) — Primary accent; conveys calm and clarity.

Teal Green (#4CC7B0) — Health‑positive accent; used for stable or improving states.

Warm Gray (#A9AEB5) — Secondary text and icons.

Pure White (#FFFFFF) — Primary text.

Semantic Colors

Healthy / Stable: Teal Green

Caution / Slight Decline: Amber (#F4C76B)

Concern / Significant Decline: Soft Red (#E57373)

Principles

Avoid harsh reds unless absolutely necessary.

Never rely on color alone to communicate meaning.

Maintain high contrast for accessibility.

2. Typography

Wysker Watch uses a clean, modern type system optimized for readability and emotional calm.

Primary Font

Inter (or SF Pro on iOS)

*(Amended 2026-07-30: this is now the ONLY family, everywhere, no exceptions — see Amendment #2 above. Any serif/display face found in the app is a bug, not a variant.)*

Hierarchy

H1 (Pet Status): 28–32px, semi‑bold

H2 (Section Titles): 22–24px, medium

Body: 16–18px, regular

Caption / Labels: 13–14px, regular

*(Amended 2026-07-30: 13px is a hard floor, not a soft target — see Amendment #7. A few 12px instances shipped and need to move up to this range. Also see Amendment #3 for the collapsed 3-tier text-opacity scale — primary/secondary/tertiary text should use white 100%/70%/45% respectively, not the wider range currently in use.)*

Principles

Generous spacing

Minimal variation in weights

Avoid dense blocks of text

3. Iconography

Icons must be simple, line‑based, and consistent.

Icon Family

Phosphor (Thin / Light) or Lucide (Stroke‑based)

Guidelines

Use one icon family across the entire app.

Avoid anatomical icons unless necessary.

Prefer symbolic representations (e.g., plate for appetite, bolt for energy).

Keep stroke width consistent.

4. Components

Wysker Watch components follow a calm, minimal, wellness‑inspired aesthetic.

*(Amended 2026-07-30: see Amendment #8 — where the app currently has two components independently doing the same job, one canonical version replaces both: a shared row component for NavCard/MenuListRow, a shared BottomSheet, a shared pill/toggle, and a shared ConfirmDeleteDialog.)*

Cards

Rounded corners (12–16px)

Soft shadow or subtle border

One clear focal point

*(Amended 2026-07-30: the "subtle border" fill is now standardized on the `bg-card`/`border-border` token pair — see Amendment #4. The hand-rolled `rgba(255,255,255,x)` glass-card pattern seen elsewhere in the app is retired.)*

Buttons

*(Amended 2026-07-30: Primary spec below is confirmed correct and unchanged — see Amendment #1. The app currently ships the opposite treatment; that's a code bug to fix in a later pass, not a doc change.)*

Primary: Charcoal background, Sky Blue outline, white text

Secondary: Transparent background, subtle border

Icon buttons: Circular, minimal

Metric Circles / Score Badges

Smaller icon

Larger number

Label beneath

Consistent spacing

(Note, 2026-07-18: no current screen uses a numeric score badge — the Wellness/Health Score circular displays this pattern originally described were retired in favor of Vibe icons and direction chips, which show state/trend without a number. Keep this pattern documented for any future numeric metric, but don't assume it's currently in use anywhere.)

Chips

Soft background

No outlines

Used for diagnoses or tags

*(Amended 2026-07-30: reaffirmed as-is — see Amendment #5. Any status/condition color on a chip must come from the semantic `--tone-*` tokens, never a raw Tailwind color.)*

5. Layout & Spacing

Wysker Watch uses a breathable, modern layout.

Spacing Scale

4 / 8 / 12 / 16 / 24 / 32px

Principles

Generous whitespace

One focal point per screen

Avoid clutter

Align content to a consistent grid

6. Motion & Interaction

Motion should be subtle and supportive.

Guidelines

Smooth transitions

No abrupt animations

Reinforce hierarchy (e.g., fade in pet status)

Keep interactions predictable

7. Tone & Personality

Wysker Watch’s design tone is:

Calm

Reassuring

Premium

Supportive

Avoid:

Clinical visuals

Harsh colors

Overly playful elements

8. Accessibility

Accessibility is mandatory.

Requirements

High contrast text

Large touch targets (44px minimum)

Clear labels

Avoid color‑only indicators

9. Platform Considerations

Wysker Watch is mobile‑first.

iOS / Android (Capacitor)

Native‑feeling navigation

Support for widgets

Support for notifications

Web

Responsive layout

Consistent component behavior

Summary

The Wysker Watch Design System creates a calm, premium, emotionally supportive experience. It ensures consistency across the product and provides a foundation for future features, native apps, and AI‑powered insights.

This system is the visual backbone of Wysker Watch—clean, modern, and designed to help owners feel confident and reassured every time they open the app.