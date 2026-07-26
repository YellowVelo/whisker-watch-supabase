# 0022_Transactional_Email_Deliverability_Warmup_Specification_v1

**Status:** Approved
**Date:** 2026-07-26
**Related files:** `supabase/functions/_shared/email/sendEmail.ts`, `email_logs` table (migrations 0018–0020, 0032, 0038), `docs/launch-punch-list.md` (P2), DNS records for `wyskerwatch.com`/`send.wyskerwatch.com`/`_dmarc.wyskerwatch.com` (Cloudflare, not in this repo).

## Before You Approve This

- **This is an unusual spec: almost no code changes.** The root cause is sender reputation with a brand-new domain, not a bug — so most of this spec is a monitoring/decision runbook, not a build plan.
- **No conflicts with CLAUDE.md or any locked decision** — this doesn't touch scoring/check-in logic at all.
- **No duplicate/overlapping functionality found** — nothing else in the repo already tracks deliverability or reputation.
- **One real technical debt item flagged in passing, not fixed here:** `sendEmail.ts` has no way to query "how many real (non-test/demo) emails have we sent and how did they do" as a single number today — you'd need to join `email_logs` to `profiles` by hand each time. Not a blocker, just worth knowing before doing this check repeatedly by hand.

## Functional Requirements

1. Confirm, in plain terms, why the branded confirmation email is landing in spam — done via investigation: the technical setup (the digital signatures and permission records that prove an email really came from Wysker Watch) is correct; the likely cause is that `wyskerwatch.com` is a brand-new sender with no track record yet, which every major mail provider treats cautiously regardless of correct setup.
2. Give a clear, written way to tell whether that's actually improving over time, instead of guessing.
3. Give a clear, written trigger for when it's safe to turn DMARC from "watch only" into "actually enforce" — which is the strongest lever available for building trust with mail providers, but risky to flip too early on an unproven setup (done wrong, it can cause *legitimate* mail to get blocked, not just spoofed mail).

## Acceptance Criteria

- **Given** this spec is approved, **when** it's checked off, **then** there's a written place (this doc) stating exactly what to look at, how often, and what number/result means "ready to tighten DMARC."
- **Given** 50 real (not test/demo) confirmation emails have been sent since this plan starts, **when** they're reviewed, **then** if delivery succeeded (via `delivered_at`) with zero hard bounces and zero spam complaints, DMARC moves from `p=none` to `p=quarantine`. `p=reject` (full enforcement) is a separate, later step — not automatic at the same milestone.
- **Given** the 50-send checkpoint is reached but shows real bounces or complaints, **when** that happens, **then** DMARC stays at `p=none` and the cause gets investigated before trying again — this is a safety gate, not just a counter.

## Visual Reference

None — this is a backend/operations plan, no UI involved.

## Technical Spec

- **No schema or code changes.** Everything needed to measure this already exists: `email_logs.template_name = 'verify-email'`, `email_logs.related_entity_type = 'profiles'`, `sent_at`, `delivered_at`, `bounced_at`, `complained_at` (all added by migration 0038, the bounce/delivery webhook feature).
- **How to count "real" sends** (excluding test/demo signups, so the count reflects genuine outside senders): join `email_logs` to `profiles` on `related_entity_id = profiles.id` where `template_name = 'verify-email'`, and exclude rows where `profiles.account_type` is `test` or `demo`. Documented reference query (not new code — run manually via `supabase db query --linked` against prod when checking progress):
  ```sql
  select count(*) filter (where el.delivered_at is not null) as delivered,
         count(*) filter (where el.bounced_at is not null) as bounced,
         count(*) filter (where el.complained_at is not null) as complained,
         count(*) as total
  from email_logs el
  join profiles p on p.id::text = el.related_entity_id
  where el.template_name = 'verify-email'
    and p.account_type not in ('test', 'demo');
  ```
- **DMARC change, when the checkpoint is met:** update the `_dmarc.wyskerwatch.com` TXT record in Cloudflare from `p=none` to `p=quarantine` (a DNS dashboard change, not a code deploy — same place the existing record was added 2026-07-25).
- **What to check in the meantime:** the `dmarc-reports@wyskerwatch.com` mailbox (already receiving DMARC's own aggregate reports). Lynn owns checking this mailbox — these are technical XML files, not easily human-readable directly; a free DMARC report viewer (several DMARC-monitoring services offer one) makes them readable, but choosing a specific tool is left open rather than prescribed here.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found — no existing deliverability-tracking or reputation-monitoring code anywhere in the repo.
- **Technical debt nearby:** No single query or view already answers "how many real emails have we sent and how did they perform" — it requires the manual join above every time. Worth a follow-up if this becomes a frequent check (e.g. a small ops view), but not building that now since it's not required to run the check by hand.
- **Orphaned features nearby:** Unchanged from prior findings — `welcome` and `password-reset` templates are registered but never called. Not relevant to this spec.
- **Punch list / known issues in this area:** This spec directly addresses the P2 item "Branded transactional email... lands in spam." It supersedes that item's original guess (an SPF/DKIM/DMARC misconfiguration) with the actual finding (correct setup, reputation/warm-up issue) — the punch-list entry is being updated to match as part of approving this spec.

## Non-Goals

- **Not attempting to force an immediate fix.** Sender reputation with mail providers can't be fixed by a deploy — it's earned over real time and real volume, and this spec's job is to make that visible and trackable, not to pretend it can be skipped.
- **Not moving DMARC straight to `p=reject`** at the same milestone as `p=quarantine` — that's a stricter, riskier step reserved for a later, separate decision once quarantine mode itself has run cleanly for a while.
- **Not building an automated dashboard/alert** for the volume check — this is a manual, periodic check using the query above, not new tooling.
- **Not addressing the `sendEmail.ts` "no easy real-vs-test count" debt** noted above — flagged, not fixed, here.

## Open Questions

None outstanding. Both items raised during drafting were resolved directly by the user: the 50-send checkpoint is confirmed as-is, and Lynn confirmed she already owns checking the `dmarc-reports@wyskerwatch.com` mailbox.

## Changelog

- **v1 (2026-07-26):** Initial draft, approved same day. Investigation found DNS (SPF/DKIM/DMARC) already correctly configured and email content clean — the punch-list item's original guess of a misconfiguration doesn't hold. Real likely cause: brand-new sending domain with no reputation history yet. Scoped as a monitoring/warm-up runbook (no code changes) rather than a bug fix, per user's explicit choice among three scoping options presented.
