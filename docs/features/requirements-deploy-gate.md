# Requirements: Manual-Deploy Gate

**Status:** Exists in production, zero in-repo representation. This doc's job is to make the gate discoverable, not to build anything new.
**Evidence:** [audit-2026-07-14.md](../audit-2026-07-14.md) notes a 07-12 "verify manual-deploy gate" commit with an empty diff — i.e., a commit made purely to test whether pushing to the tracked branch triggers an automatic production deploy, and confirming it does not.

## Purpose

There is a gate between "code merged/pushed" and "code live in production," configured entirely in the Cloudflare dashboard (not `wrangler.jsonc`, not a GitHub Action, not any file in this repo). Today, if Lynn is unavailable, nobody else — including a future Claude Code session — can discover this gate exists, what it does, or how to change it. This doc exists to close that single point of failure: not to move the gate into the repo, but to write down its existence, purpose, and location so it survives Lynn being unreachable.

## Functional Requirements

- Record, in README or a dedicated ops note, that pushing to the tracked branch does **not** automatically deploy to production — an explicit action in the Cloudflare dashboard is required.
- Record where in the Cloudflare dashboard that setting lives (exact path: e.g. Workers & Pages → [project] → Settings → Builds & deployments, or wherever it actually is — confirm with Lynn, don't guess at Cloudflare's current UI labeling).
- Record who currently has access to Cloudflare account/project settings capable of changing this gate.
- State explicitly that this is a deliberate safety measure (confirmed by the 07-12 verification commit), not a forgotten misconfiguration — so a future contributor doesn't "fix" it by wiring up auto-deploy.

## Empty States / Load Errors

Not applicable — this is a docs/discoverability task, not a runtime feature.

## Business Rules

- The gate must remain manual until there's an explicit decision to automate it — this doc records current intent, it doesn't argue for changing it.
- Any change to the gate (who can trigger it, whether it becomes automatic) should be reflected back into this doc in the same change, so it doesn't immediately go stale like the docs flagged in the 07-14 audit.

## Data Requirements

None.

## Acceptance Criteria

- [ ] A short section (README or new `docs/deploy-gate.md`) states plainly: pushes do not auto-deploy; a manual step in the Cloudflare dashboard promotes a build to production.
- [ ] The exact dashboard location/setting name is recorded (get this from Lynn directly — it cannot be discovered by reading this repo).
- [ ] The doc states this is intentional, referencing the 07-12 verification commit as evidence it was deliberately checked, not accidentally left this way.
- [ ] Cross-referenced from [requirements-cloudflare-deploy.md](requirements-cloudflare-deploy.md) so a reader following the deploy docs hits this note naturally.

## Edge Cases

- Lynn loses Cloudflare dashboard access (lockout, account issue) — this doc alone doesn't solve that, but at minimum a future maintainer knows the gate exists and where to start recovering access, rather than being surprised deploys "don't work."
- A future contributor pushes to the tracked branch, sees nothing happen, and assumes CI/deploy is broken — this doc is the thing that tells them it's working as designed.

## Implementation Notes for Claude Code

- This cannot be fully written from the codebase alone — the dashboard setting's exact name/location has to come from the user. Ask Lynn for it rather than guessing at Cloudflare's UI; a wrong or outdated screen-path is worse than no path at all.
- Keep this as a small, standalone note (a few sentences) rather than a long ops runbook — the goal is "gate exists, here's where, here's why," not a full deployment playbook.
