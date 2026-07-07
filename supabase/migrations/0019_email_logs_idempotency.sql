-- Wysker Watch — email_logs idempotency support
--
-- Adds an optional idempotency_key so a caller that might retry a send
-- (client timeout, at-least-once delivery of a queued job, a user
-- double-tapping a button before the first request returns) can pass
-- the same key on retry and get the original result back instead of a
-- second real email going out. This addresses the "Duplicate send
-- request" edge case from the Email feature spec, which the initial
-- implementation left unhandled.
--
-- 'pending' is a reservation state: sendEmail.ts writes a pending row
-- for the key *before* calling Resend (via an atomic
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE), so two concurrent
-- requests carrying the same key can't both observe "not yet sent" and
-- both fire — only one claims the row; the other either replays the
-- already-sent result or (if the first attempt is still in flight)
-- backs off without sending. See claimIdempotencyKey in sendEmail.ts.

alter table public.email_logs
  drop constraint email_logs_status_check,
  add constraint email_logs_status_check check (status in ('pending', 'sent', 'failed')),
  add column idempotency_key text;

-- Partial unique index: only rows that actually used an idempotency
-- key are constrained. Rows without one (idempotency_key is null)
-- behave exactly as before this migration.
create unique index email_logs_idempotency_key_idx
  on public.email_logs(idempotency_key)
  where idempotency_key is not null;

-- Atomically claims an idempotency key: inserts a 'pending' row for a
-- brand-new key, or re-claims a key whose prior attempt failed
-- (status = 'failed' -> 'pending', allowing retry). Neither branch is
-- taken if the key is already 'sent' or currently 'pending' — the
-- ON CONFLICT ... DO UPDATE ... WHERE only fires when the existing
-- row's status is 'failed', so concurrent callers racing on the same
-- key can't both "win" the claim. The single-statement INSERT is what
-- makes this atomic; a separate SELECT-then-INSERT from the Edge
-- Function would have a check-then-act race window.
--
-- sendEmail.ts calls this via supabase.rpc(); it never touches
-- email_logs directly for the claim step. Restricted to service_role
-- since this is invoked only from the shared server-side email
-- service, never from client code.
create or replace function public.claim_email_idempotency_key(
  p_idempotency_key text,
  p_recipient_email text,
  p_template_name text
)
returns table (claimed boolean, id uuid, status text, provider_message_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into email_logs (recipient_email, template_name, status, idempotency_key)
  values (p_recipient_email, p_template_name, 'pending', p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null
  do update set status = 'pending'
    where email_logs.status = 'failed'
  returning email_logs.id into v_id;

  if v_id is not null then
    return query select true, v_id, 'pending'::text, null::text;
    return;
  end if;

  -- Not claimed: existing row is 'sent' or still 'pending' (in-flight
  -- concurrent request). Return its current state so the caller can
  -- decide whether to replay the result or back off.
  return query
    select false, e.id, e.status, e.provider_message_id
    from email_logs e
    where e.idempotency_key = p_idempotency_key;
end;
$$;

revoke all on function public.claim_email_idempotency_key(text, text, text) from public;
grant execute on function public.claim_email_idempotency_key(text, text, text) to service_role;
