-- Wysker Watch — signup/resend rate limiting
--
-- The new sign-up Edge Function (see
-- docs/features/0021_Branded_Signup_Confirmation_Email_Specification_v1.md)
-- is deliberately public and unauthenticated — anyone on the internet can
-- call it, unlike invite-co-owner/invite-sitter, which require an existing
-- session. Without a limit, it could be used to spam arbitrary addresses
-- with branded email or run up Resend costs. This table + function give
-- that function a simple, atomic way to check "has this key (an email
-- address, or a request IP) made too many attempts recently" before doing
-- any real work.
--
-- Deliberately generic (rate_key is an opaque text, not an email/ip column
-- pair) so the same table/function can rate-limit more than one kind of
-- key from the same call site (the spec calls for limiting both by
-- recipient email and by request IP) without needing a second table.
create table public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_hits_key_created_idx on public.rate_limit_hits(rate_key, created_at);

alter table public.rate_limit_hits enable row level security;
-- No policies: written and read only by check_and_record_rate_limit()
-- below (security definer, service_role-only execute). Every other role
-- is denied both select and insert by default, same pattern as
-- email_logs/email_suppressions.

-- Atomically checks whether `p_key` is still under `p_limit` attempts
-- within the trailing `p_window_seconds`, and if so, records this attempt
-- in the same call. Returns true (allowed, and now recorded) or false
-- (over limit, NOT recorded — a rejected attempt doesn't itself count
-- against the caller).
--
-- Note: this is a read-then-write, not a single atomic upsert like
-- claim_email_idempotency_key (sendEmail.ts) — under very high concurrent
-- request volume for the exact same key within the same instant, two
-- overlapping calls could both pass the count check before either
-- inserts, allowing the limit to be exceeded by a small margin. Accepted
-- for launch: this is an abuse/cost guard for a low-volume public signup
-- form, not a payment or security-critical gate, and the margin of error
-- is bounded by ordinary request concurrency, not exploitable to bypass
-- the limit entirely.
--
-- Also opportunistically prunes rows older than the window on every call
-- (across all keys, not just p_key) — cheap at this app's expected volume,
-- and avoids needing a separate scheduled cleanup job.
create or replace function public.check_and_record_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from rate_limit_hits
  where created_at < now() - (p_window_seconds || ' seconds')::interval;

  select count(*) into v_count
  from rate_limit_hits
  where rate_key = p_key
    and created_at > now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into rate_limit_hits (rate_key) values (p_key);
  return true;
end;
$$;

revoke execute on function public.check_and_record_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limit(text, integer, integer) to service_role;

-- Multi-key variant: checks and records several independent keys
-- (e.g. an email-scoped limit AND an IP-scoped limit for the same
-- request) as a single all-or-nothing transaction, instead of the
-- caller making one check_and_record_rate_limit() round trip per key.
-- Two problems that fixes: (1) N sequential round trips collapse into
-- one, and (2) the previous per-key approach could record a hit for an
-- earlier key and then fail/reject on a later key for the same request
-- — permanently consuming part of that key's quota for a request that
-- was ultimately rejected. Here, if ANY key is over its limit, NONE of
-- the keys get a hit recorded.
--
-- p_keys/p_limits are parallel arrays (p_keys[1] uses p_limits[1], etc.)
-- — arrays rather than a JSON/composite-type parameter, since Postgres
-- has no simple way to pass a list of (key, limit) pairs as scalars
-- otherwise, and this keeps the SQL a plain loop over indices.
create or replace function public.check_and_record_rate_limits(
  p_keys text[],
  p_limits integer[],
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  i integer;
begin
  delete from rate_limit_hits
  where created_at < now() - (p_window_seconds || ' seconds')::interval;

  for i in 1 .. array_length(p_keys, 1) loop
    select count(*) into v_count
    from rate_limit_hits
    where rate_key = p_keys[i]
      and created_at > now() - (p_window_seconds || ' seconds')::interval;

    if v_count >= p_limits[i] then
      return false;
    end if;
  end loop;

  insert into rate_limit_hits (rate_key)
  select unnest(p_keys);

  return true;
end;
$$;

revoke execute on function public.check_and_record_rate_limits(text[], integer[], integer) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limits(text[], integer[], integer) to service_role;
