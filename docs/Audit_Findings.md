# UI Audit vs. Design System — Findings

Audit date: 2026-07-30. Compares actual rendered UI (read from source: JSX/inline styles) against [0005 Design System.md](foundation/0005%20Design%20System.md), covering Home, Pets, Pet Profile, BottomTabBar, Daily Check-In, and Settings.

## Scope note

**CareMenu doesn't exist in the current codebase** — confirmed in [0008 Navigation & Information Architecture_V4.md:17](foundation/0008%20Navigation%20&%20Information%20Architecture_V4.md): "CareMenu (the per-pet slide-out hamburger menu) is gone — the file was deleted, not just deprecated." Skipped for this audit. Live rendering in a browser was not used (would require an authenticated session); findings are from reading the actual JSX/inline styles behind each page, not from the docs.

---

## Home (`src/pages/Home.jsx`, `src/components/PetSummaryCard.jsx`, `src/components/CheckInStatusBanner.jsx`)

- **Colors**: Semantic palette (`--tone-good/warn/bad/neutral`, `--accent-sky`) is used correctly via `PALETTE`/`toneColors.js` for Vibe icons and trend chips — this is the one subsystem that matches doc §1 cleanly.
- **Primary button inverted vs spec**: "Add Pet" empty-state CTA uses `bg-primary text-primary-foreground` → solid Sky Blue fill, dark text. Doc §4 says Primary buttons should be "Charcoal background, Sky Blue outline, white text" — the opposite treatment.
- **Card system**: every card (`PetSummaryCard`, `CheckInStatusBanner`, "Pet Sitter" row, `CompleteProfileBanner`, Catch-Up banners) is hand-rolled with inline `rgba(255,255,255,0.04–0.08)` fills/borders instead of the `bg-card`/`border-border` tokens already defined in `src/index.css`. None of this uses the shadcn/Tailwind card system that other screens use.
- **Text opacity sprawl**: `text-white/50`, `/45`, `/40`, `/35`, `/30`, `/25`, `/85`, `/80` all appear as distinct "muted text" tiers just within Home + its two child components.
- **Type scale**: H1 `text-[28px] font-bold` (doc range is fine, though doc says "semi-bold" not bold). Caption text uses `text-[13px]`/`text-[14px]` bracket values rather than a shared class.
- **Chip inconsistency**: condition chips here use plain `rgba(255,255,255,0.08)` background, no border — different treatment than the same concept on Pet Profile (see below).

## Pets (`src/pages/Pets.jsx`, `src/components/ExpandablePetProfileCard.jsx`, `src/components/PetProfileContent.jsx`)

- Same glass-card `rgba(255,255,255,x)` pattern as Home, same text-opacity sprawl (`/45`, `/40`, `/35`, `/30`, `/25`).
- **Serif font appears for empty states**: "No pets yet" uses `font-serif text-2xl` (DM Serif Display) — not mentioned anywhere in doc §2 (Inter/SF Pro only). This is a distinct, undocumented type family used only in empty states and dialogs (see Settings below).
- **Section eyebrows** ("Active Pets", "Pets I Sit", "Rainbow Bridge"): `text-[13px] font-bold tracking-widest uppercase` — a whole style (uppercase + wide tracking + bold) that has no entry in the doc's type hierarchy at all.
- **PetProfileContent's `NavCard`** (Baseline/Conditions/Medications/Food/etc.) duplicates almost the exact same "icon circle + title + subtitle + chevron" shape as Settings' `MenuListRow`, but independently built with different padding (`py-4` vs `py-3.5`), different min-heights (none vs `min-h-[64px]`), and different prop shapes — same component pattern implemented twice.
- **Condition chip, second treatment**: here conditions render with `background: rgba(244,199,107,0.12)` **and** `border: 1px solid rgba(244,199,107,0.3)` — doc §4 Chips says "no outlines," and this contradicts the border-less chip used for the same data on Home.
- **Pet name heading reused at H1 size inside a card**: `text-[28px] font-bold` for the pet's name in the identity block — same size token as the page H1, even though this is a card-level heading, not a screen title.
- Deep-dive on the **standalone `/pet/:petId` route**: it's a pure redirect stub (`src/pages/PetProfile.jsx`) — no UI to audit there, confirming the nav doc.

## Pet Profile detail / tabs (`src/pages/PetProfileTabs.jsx` — reached via `/pet/:petId/profile`)

This file is the biggest outlier in the app:

- **Light-theme colors hardcoded into a dark app**: `conditionColors` map uses `bg-amber-100 text-amber-800`, `bg-blue-100 text-blue-800`, `bg-purple-100 text-purple-800`, `bg-rose-100 text-rose-800`, `bg-orange-100 text-orange-800`, `bg-green-100 text-green-800`, `bg-gray-100 text-gray-800` — pale light-mode chip colors that would look badly out of place against Midnight Charcoal. (This map also appears to be **dead code** — never referenced in the render.)
- Rainbow Bridge card/button here use `hover:bg-purple-50 hover:border-purple-200 text-purple-700` and `bg-purple-50 border-purple-200 ... text-purple-800`/`text-purple-600` — again light-mode Tailwind classes, inconsistent with the purple-on-dark treatment used for the same "memorial" concept everywhere else (Pets/PetProfileContent use `text-purple-400`/`text-purple-300` on transparent dark backgrounds).
- **Pet name uses a third heading style**: `font-serif text-4xl` (36px) — bigger than doc's H1 ceiling (28–32px) and the only place a pet's name is rendered in serif rather than the bold-sans treatment used on Home/Pets.
- Uses `bg-card rounded-2xl border border-border` for its tab panels — the *other* card system (shadcn tokens), not the glass-card pattern used on Home/Pets/Settings. So this single screen mixes three different visual systems (light-mode Tailwind color chips, shadcn `bg-card`, and serif display type) not seen together anywhere else.
- Confirmed as effectively legacy per the CLAUDE.md doc-lag warning — the "History" and "Trends" tabs here just `<Navigate>` elsewhere immediately.

## BottomTabBar (`src/components/BottomTabBar.jsx`)

- Cleanest component in the audit. Icon family is Lucide throughout (matches doc §3's approved options), touch targets are ≥44px, active/inactive states use color + scale (not color-only, satisfying doc §8's "avoid color-only indicators").
- Background uses yet another one-off value: `rgba(10,12,22,0.92)` — close to but not identical to `--background` (`hsl(228 9% 10%)` ≈ `#17181c`) or `--card`. A fourth "near-black" value in the palette that isn't tied to a token.

## Daily Check-In (`src/components/DailyCheckInSheet.jsx` / `src/components/DailyCheckInModal.jsx`)

- **Primary CTA again inverted vs spec**: "Continue" and "Save check-in" buttons use `background: PALETTE.sky` (solid Sky Blue fill) with dark text — same deviation as Home's "Add Pet." Every primary CTA in the app does this; it's systemic, not a one-off.
- Bottom-sheet shell (`rounded-t-3xl`, backdrop blur, drag handle) is hand-built here, and **also hand-built separately** in `PetProfileContent.jsx`'s `WeightQuickLogSheet` — same visual shell duplicated in two files instead of a shared `BottomSheet` component.
- Category picker buttons and enum-answer buttons both reimplement the "active pill" pattern independently (different padding/height: `min-h-[48px]` vs `min-h-[40px]`) for what's visually the same toggle-chip concept.
- Font sizes drop to `text-xs`(12px)/`text-sm`(14px) for helper copy ("lbs (optional)", incomplete-selection hint) — 12px is below the doc's documented Caption floor of 13–14px.

## Settings / Menu (`src/pages/Settings.jsx`, `src/components/MenuListRow.jsx`)

- Same glass-card `rgba(255,255,255,x)` pattern for the account card, install-app card, and all three menu-item groups — consistent *within* this page, but still the same competing system vs. `bg-card`/`border-border` used elsewhere (e.g., its own Dialogs use `border-border`, so even this one screen mixes both systems).
- **Serif dialog titles**: every dialog (Sign Out, Delete Account x2, Reset Account, Seed Test Data) uses `font-serif text-2xl` — consistent with each other, but this is the third distinct heading treatment found in the app (bold-sans H1, serif page-empty-state, serif dialog-title), and none of it is in doc §2's Inter-only hierarchy.
- Account-type badges (`Production`/`Test`/`Demo`/`Owner`) use yet another color convention: `text-emerald-400 bg-emerald-400/10`, `text-amber-400 bg-amber-400/10`, `text-violet-400 bg-violet-400/10`, `text-sky-400 bg-sky-400/10` — raw Tailwind palette colors, not the semantic `--tone-*`/`--accent-sky` tokens used everywhere else for status color.
- MenuListRow's icon-circle backgrounds are per-item inline hex-with-opacity (`rgba(251,191,36,0.14)`, `rgba(232,121,249,0.14)`, `rgba(52,211,153,0.14)`, etc.) — a fifth ad hoc micro-palette, distinct from `PALETTE`'s five named tokens.
- Two independent "type X to confirm" destructive-delete dialogs (delete account here, delete pet in `PetProfileContent.jsx`) — same interaction pattern, built twice with separate markup.

---

## Cross-app summary — most common inconsistencies

1. **Primary buttons contradict doc §4 app-wide.** Doc: charcoal bg / sky outline / white text. Reality: solid sky-blue fill / dark text, on every "Add Pet," "Save check-in," "Continue," and confirm button. This is the single most consistent *deviation* from spec — consistent, but consistently wrong relative to the written doc.
2. **Two incompatible card systems coexist**: hand-rolled `rgba(255,255,255,0.04–0.08)` "glass" cards (Home, Pets, Settings, PetSummaryCard, chips, NavCard) vs. the shadcn `bg-card`/`border-border` tokens (PetProfileTabs' tab panels, all Dialogs). Neither is wrong per se, but they render visibly differently on the same background and nothing signals which to use where.
3. **No shared muted-text scale.** At least 8 distinct `text-white/NN` opacity values (25/30/35/40/45/50/60/70/80/85) are used interchangeably for "secondary" text across every page audited, instead of 2–3 defined tiers.
4. **Three unrelated heading treatments for what should be one type hierarchy**: bold-sans H1 (`text-[28px] font-bold`, Home/Pets/Settings page titles and pet names), serif display (`font-serif text-2xl`/`text-4xl`, empty states + dialog titles + PetProfileTabs' pet name) — the serif family isn't in doc §2 at all.
5. **Color tokens bypassed for status/badges.** `PALETTE`/`--tone-*` is used correctly for Vibe/trend chips, but account-type badges, MenuListRow icon backgrounds, and PetProfileTabs' condition-color map all invent their own raw Tailwind/hex colors instead.
6. **Duplicated component patterns instead of shared primitives**: NavCard vs. MenuListRow (tappable icon+title+subtitle+chevron row), two independent bottom-sheet shells, two independent "type-to-confirm" delete dialogs.
7. **PetProfileTabs.jsx is the clear outlier** — light-mode Tailwind color classes (amber-100/blue-100/purple-50 etc.) baked into an otherwise all-dark app, plus dead code (`conditionColors`). Worth a closer look given it's still a live route even though its own tabs mostly redirect elsewhere.
8. **What's actually consistent and working**: Lucide icons everywhere (satisfies doc §3), 44px minimum touch targets enforced globally via `index.css`, lightweight opacity/transform transitions everywhere (satisfies doc §6), and the semantic tone palette (teal/amber/red/sky/gray) is correctly centralized in `toneColors.js` for the components that actually use it.
