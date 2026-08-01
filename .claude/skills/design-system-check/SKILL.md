---
name: design-system-check
description: Audit UI code (changed files by default, or the whole app on request) against docs/foundation/0005 Design System.md and its locked 2026-07-30 amendments. Use after any UI-affecting change, when the user says "check the design system," "review pages against the design system," "design system audit," or "does this match the design system" — and proactively, without being asked, immediately after writing or editing any component/page file in this session.
---

# Design System Check

Catches drift from `docs/foundation/0005 Design System.md` before it ships,
instead of relying on a human to spot it later (see spec 0028 — the app
had already drifted in six+ ways by the time anyone audited it). This
skill is a checker, not a rewriter — it reports findings; fixes only
happen after the user confirms, exactly like every other review in this
repo, unless the user has already said "fix it" for this pass.

## When this runs

- **Automatically, silently, every time** — the end of any turn where you
  wrote or edited a `.jsx` page/component file. Don't wait to be asked;
  don't announce that you're "about to check the design system," just run
  the checklist below against the files you touched and report findings
  (or say clean) before ending the turn.
- **On explicit request** — "check the design system," "audit all pages,"
  "does this match the design system" — against whatever scope the user
  names (a file, a feature, or the whole `src/` tree if they say "all
  pages").

## Scope selection

- Default scope: files changed in the current session (check `git status`/
  `git diff` if unsure what's changed).
- Full-app scope: every `.jsx` file under `src/pages/` and
  `src/components/` — only run this when the user asks for "all pages" or
  a full audit; it's a much bigger read than a per-change check.

## The checklist

Read `docs/foundation/0005 Design System.md` in full first — the
Amendments block at the top (numbered 1–11) is the authoritative,
locked ruleset; the sections below it are the original doc, annotated
inline wherever an amendment supersedes it. Do not work from memory of
this file; it gets amended over time.

Then check the in-scope files against each of these — mechanical checks
first (fast, precise, use Grep), then the qualitative ones (need an
actual read of the file):

### Mechanical (grep-able)

1. **Emoji used as iconography.** Grep the scope for
   `[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]`. Any hit inside app UI (JSX
   returned to the screen) is a violation — Lucide is the only icon
   family (Amendment... iconography §3, "one icon family"). Exception:
   plain-text content genuinely rendered outside our own UI (e.g. an
   `.ics` calendar-export title string consumed by a third-party calendar
   app) — those can't carry a React icon at all; drop the glyph rather
   than "replacing" it, don't leave it in.
2. **Serif/display font residue.** Grep for `DM Serif`, `font-serif`, or
   any custom display-font class. Inter is the only family, full stop
   (Amendment #2) — headings, empty states, dialog titles included.
3. **Hand-rolled glass cards.** Grep for `rgba(255,255,255,` (or similar
   raw white-alpha) used as a card background. The `bg-card`/`border-border`
   token pair is the only sanctioned card treatment (Amendment #4).
4. **Raw color on chips/badges/icon backgrounds.** Grep for raw Tailwind
   color utilities (`bg-red-`, `text-green-`, `bg-amber-`, hex literals in
   `style={{ background: '#...' }}`, etc.) on anything carrying
   status/condition/tone meaning. These must come from `PALETTE`
   (`src/lib/toneColors.js`) or the `--tone-*` CSS tokens (Amendments #5,
   #6).
5. **Sub-13px type.** Grep for `text-[10px]`, `text-[11px]`, `text-[12px]`,
   or Tailwind's `text-xs` (12px) used as a final rendered size. 13px is a
   hard floor (Amendment #7).
6. **Touch targets under 44px.** Grep for `h-8`, `h-9`, `min-h-[36px]`,
   `min-h-[40px]` etc. on anything clickable (`<button>`, `<a>`, elements
   with `onClick`). 44px is the accessibility floor (§8) — icon-sized
   decorative elements that aren't tap targets are fine, judgment needed.
7. **Duplicate component patterns instead of the canonical ones.** Grep
   for a hand-rolled bottom-anchored overlay (`fixed bottom-0` / a custom
   slide-up sheet) instead of `BottomSheet.jsx`; a one-off toggle/pill
   button instead of `PillToggle.jsx`; a one-off circular button instead
   of `IconButton.jsx`; a one-off icon+title+subtitle+chevron row instead
   of `ListRow.jsx`; a one-off "type to confirm" delete flow instead of
   `ConfirmDeleteDialog.jsx` (Amendment #8). New code should import and
   reuse these, not reinvent them.

### Qualitative (needs an actual read)

8. **Primary button treatment.** Charcoal background, Sky Blue outline,
   white text — not a solid Sky-Blue fill (Amendment #1 flags this as a
   known, still-unresolved app-wide bug; don't introduce more instances of
   the wrong treatment in new code, but a pre-existing instance elsewhere
   on the page isn't this pass's job to fix unless asked).
9. **Icon buttons are one component everywhere.** A page's back button and
   a header's action buttons must be the same `IconButton` component — no
   separate "header action" style (Amendment #11).
10. **Persistent chrome traces back to real tokens.** Any header/tab-bar/
    nav-chrome background or border must resolve to `bg-card`/`border-border`
    or `--background`/`--border`, not a one-off hardcoded rgba (Amendment #9).
11. **Multi-series chart colors extend the token system.** A chart needing
    more series colors than `--chart-1`..`--chart-5` should get new
    numbered tokens added, never raw hex outside the system (Amendment #10).
12. **Spacing scale.** 4/8/12/16/24/32px — flag arbitrary values outside
    that scale used for padding/margin/gap on new layout code.
13. **One focal point per screen; generous whitespace; no dense text
    blocks** — a judgment call, not a grep; read the screen holistically.

## Reporting

Report findings the same way a code review would — file:line, what rule
it breaks, one-line plain-language explanation — ranked most-important
first (emoji/serif/glass-card/raw-color violations are unambiguous bugs;
spacing/whitespace calls are softer judgment, label them as such). If the
scope is clean, say so explicitly rather than skipping the report — a
"nothing found" result is still useful signal, especially right after a
change.

Do not silently fix anything found during an *automatic* post-change
check — surface it and ask, same as any other review in this repo. If the
user explicitly asked for an audit and separately says to fix what's
found, then fix directly rather than re-asking file-by-file.
