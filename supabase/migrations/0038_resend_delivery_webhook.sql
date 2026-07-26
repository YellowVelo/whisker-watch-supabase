-- Wysker Watch — Resend delivery/bounce/complaint webhook support
--
-- Adds the schema needed to track what actually happens to an email
-- after Resend accepts it (email_logs.status = 'sent' has only ever
-- meant "Resend accepted it," never "confirmed delivered" — see
-- sendEmail.ts's header comment and docs/launch-punch-list.md P2), plus
-- a durable block list for addresses that permanently bounce or
-- complain. See docs/features/0020_Resend_Bounce_Delivery_Webhook_Specification_v1.md
-- for the full design and the reasoning behind each decision below.

-- ── email_logs: per-message delivery lifecycle ──────────────────────────
--
-- These sit alongside the existing `status` column rather than replacing
-- it — `status` still reflects the original send outcome
-- (sent/failed/suppressed), and these layer the later delivery lifecycle
-- on top. `delivered_at` and `complained_at` can both be set on the same
-- row (a message can be delivered, then later reported as spam) — they
-- are independent facts, not mutually exclusive states. There is no
-- `bounce_type`/hard-vs-soft column: Resend's `email.bounced` webhook
-- event is itself always a permanent failure signal (temporary/transient
-- delivery problems are a separate `email.delivery_delayed` event this
-- system deliberately doesn't handle — see the spec's Revision Notes).
alter table public.email_logs
  add column delivered_at timestamptz,
  add column bounced_at timestamptz,
  add column complained_at timestamptz;

-- The webhook looks up a row by this column on every event; today it's
-- unindexed.
create index email_logs_provider_message_id_idx on public.email_logs(provider_message_id);

-- ── resend_webhook_events: dedup ledger ──────────────────────────────────
--
-- Resend/Svix can redeliver the same webhook event more than once (its
-- own retry behavior on a slow/failed response). Recording event_type and
-- provider_message_id alongside the bare id (not just the id alone) costs
-- nothing and makes this table useful for debugging a specific incident
-- later without cross-referencing Resend's own dashboard. No automatic
-- purge/retention policy — rows are small and low-volume; add a cleanup
-- job later only if this ever grows large enough to matter, same as this
-- app has no data-retention/expiry system anywhere else today.
create table public.resend_webhook_events (
  event_id text primary key,
  event_type text not null,
  provider_message_id text,
  received_at timestamptz not null default now()
);

alter table public.resend_webhook_events enable row level security;
-- No policies: service-role writes/reads bypass RLS; every other role is
-- denied both select and insert by default. Same pattern as email_logs.

-- ── email_suppressions: durable per-address block list ──────────────────
--
-- email_logs only has per-attempt rows, not a durable "never email this
-- address again" record — this is that record. A row is only treated as
-- "currently blocking sends" when cleared_at is null (see
-- sendEmail.ts's recipient-suppression check). Rows are never deleted by
-- this feature — clearing sets cleared_at/cleared_by/cleared_note, it
-- doesn't remove the row — so there's always a record that an address
-- bounced/complained at some point, even after it's been cleared.
create table public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null check (reason in ('bounced', 'complained')),
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by text,
  cleared_note text
);

alter table public.email_suppressions enable row level security;
-- No policies: written only by the webhook function, sendEmail.ts (read),
-- and the clear-email-suppression function, all via the service-role
-- client. Every other role is denied both select and insert by default.

-- ── process_resend_webhook_event: the one atomic operation per event ───
--
-- Does everything a single webhook delivery needs in one transaction:
-- claims the event id in the dedup ledger, updates the matching
-- email_logs row, and (for bounced/complained) upserts the suppression
-- list. Because this is one transaction, any failure partway through
-- rolls back the whole thing — including the dedup-ledger claim — so a
-- transient database error results in the event genuinely being
-- unprocessed, and Resend's real retry can actually retry it, rather
-- than silently losing the state update if a later step failed after an
-- earlier step had already committed (see the spec's Revision Notes,
-- item 3, for the bug this design avoids).
--
-- Returns a single row describing what happened, so the calling Edge
-- Function knows what HTTP status/log message to produce:
--   outcome = 'duplicate'   — event_id already seen; nothing else ran.
--   outcome = 'no_match'    — new event, but no email_logs row has this
--                             provider_message_id; ledger entry still
--                             committed so a legitimate retry of this same
--                             unmatched event doesn't reprocess it again.
--   outcome = 'processed'   — new event, matching row found and updated
--                             (and, for bounced/complained, the
--                             suppression list updated per the rules
--                             below).
create or replace function public.process_resend_webhook_event(
  p_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_email text,
  p_occurred_at timestamptz
)
returns table (outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
  v_log_id uuid;
begin
  insert into resend_webhook_events (event_id, event_type, provider_message_id)
  values (p_event_id, p_event_type, p_provider_message_id)
  on conflict (event_id) do nothing;

  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    return query select 'duplicate'::text;
    return;
  end if;

  select id into v_log_id
  from email_logs
  where provider_message_id = p_provider_message_id
  limit 1;

  if v_log_id is null then
    -- Ledger insert above already committed as part of this transaction;
    -- no email_logs row to update, but the event is still recorded as
    -- seen so a legitimate retry of this same unmatched event is also a
    -- no-op rather than reprocessed indefinitely.
    return query select 'no_match'::text;
    return;
  end if;

  if p_event_type = 'email.delivered' then
    update email_logs set delivered_at = p_occurred_at where id = v_log_id;
  elsif p_event_type = 'email.bounced' then
    update email_logs set bounced_at = p_occurred_at where id = v_log_id;
  elsif p_event_type = 'email.complained' then
    update email_logs set complained_at = p_occurred_at where id = v_log_id;
  end if;

  if p_event_type in ('email.bounced', 'email.complained') and p_email is not null then
    insert into email_suppressions (email, reason)
    values (p_email, case when p_event_type = 'email.bounced' then 'bounced' else 'complained' end)
    on conflict (email) do update
      set cleared_at = null,
          cleared_by = null,
          cleared_note = null,
          reason = excluded.reason
      where email_suppressions.cleared_at is not null;
      -- If the existing row is currently active (cleared_at is null),
      -- the WHERE clause prevents this branch from firing at all — the
      -- address is already blocked, and a second bounce/complaint while
      -- already suppressed doesn't need to change anything. If the
      -- existing row was previously cleared, this re-arms it.
  end if;

  return query select 'processed'::text;
end;
$$;

revoke all on function public.process_resend_webhook_event(text, text, text, text, timestamptz) from public;
grant execute on function public.process_resend_webhook_event(text, text, text, text, timestamptz) to service_role;
