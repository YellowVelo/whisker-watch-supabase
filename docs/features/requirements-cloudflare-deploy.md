# Requirements: Cloudflare Workers Deploy Config

**Status:** Implemented (07-04), undocumented. This doc describes what exists today.
**Source files:** [wrangler.jsonc](../../wrangler.jsonc), [vite.config.js](../../vite.config.js)

## Purpose

Whisker Watch is hosted on Cloudflare Workers (static assets + SPA routing), not Vercel/Netlify/a traditional Node host. `wrangler.jsonc` is the only in-repo artifact describing that hosting target. A contributor who has never touched Cloudflare needs to be able to find "how does this get deployed" without asking Lynn directly — today they can't, because README has no deployment section at all.

## Functional Requirements

- Document the current `wrangler.jsonc` configuration in plain language: Worker name (`whisker-watch-supabase`), SPA fallback behavior (`not_found_handling: single-page-application` — unmatched routes serve `index.html` instead of a Cloudflare 404 page), `nodejs_compat` flag, and `observability.enabled` (Cloudflare's built-in request logging).
- Document the build → deploy pipeline: `npm run build` (Vite) produces `dist/`, which Wrangler uploads as the Worker's static asset bundle.
- Document the actual deploy command(s) a contributor runs locally, and how that differs from (or matches) whatever runs the manual-deploy gate (see [requirements-deploy-gate.md](requirements-deploy-gate.md) — these two docs should cross-reference each other, since one is meaningless without the other).
- List required Cloudflare-side secrets/bindings, if any beyond what's already covered by Supabase env vars (confirm during implementation — `wrangler.jsonc` currently declares none).

## Empty States / Load Errors

Not applicable — this is a config/docs task, not a runtime feature.

## Business Rules

- `compatibility_date` must only move forward, and any bump should be tested locally (`wrangler dev`) before a real deploy, since it can change Workers runtime behavior.
- The SPA fallback (`not_found_handling`) is load-bearing for client-side routing (React Router) — removing it would break every deep link (e.g. sharing a direct pet profile URL) with a raw 404.

## Data Requirements

None — no database involvement.

## Acceptance Criteria

- [ ] README has a new "Deployment / Hosting" section covering: hosting provider (Cloudflare Workers), what `wrangler.jsonc` controls, the build command, and the deploy command.
- [ ] The section explains SPA fallback in one sentence so a reader understands why it's there (deep links / client-side routes wouldn't resolve without it).
- [ ] The section links to or mentions the manual-deploy gate doc so a reader doesn't assume `wrangler deploy` alone ships to production.
- [ ] No behavior change — this is documentation only; `wrangler.jsonc` itself is not modified.

## Edge Cases

- A contributor runs `wrangler deploy` locally without realizing a manual gate exists downstream (dashboard-side) — covered by the cross-reference above, not by this doc alone.
- `compatibility_date` drifts far behind "today" over time with no process to bump it — worth a one-line callout ("bump periodically; test with `wrangler dev` first") rather than a full policy.

## Implementation Notes for Claude Code

- This is a README edit only. Do not touch `wrangler.jsonc`, `vite.config.js`, or any CI config.
- Keep it short — a subsection under "## Deployment", not a new top-level doc file, since it's tightly coupled to the existing Stack/Local setup sections.
- Verify the actual deploy command before writing it into README: `package.json` currently has **no `deploy` script** (only `dev`, `build`, `lint`), and no `.github/workflows` exist. That means deploys most likely go through Cloudflare's own git-integration build (Cloudflare watches the repo/branch and builds+deploys on push), which would also explain why a "manual-deploy gate" lives entirely in the Cloudflare dashboard rather than in-repo — it's probably the gate between "build succeeded" and "promote to production" in that pipeline. Confirm this with the user (Lynn) before documenting a specific mechanism, rather than guessing.
