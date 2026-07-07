-- Wysker Watch — email_logs
--
-- Delivery record for every transactional email attempt made through
-- the shared sendEmail service (supabase/functions/_shared/email).
-- Written exclusively by Edge Functions using the service-role client
-- (see sendEmail.ts's logAttempt) — there is no client-side insert
-- path, so RLS is enabled with zero policies: the service role bypasses
-- RLS entirely, and every other role (anon, authenticated) is denied
-- by default with no policy granting otherwise.
--
-- Only a status + provider message id + error info is stored, never
-- the rendered HTML/text body — the template name + variables used to
-- generate the email already live with the workflow that triggered it
-- (e.g. the pet_co_owners invite row), so re-rendering isn't needed
-- here and this table doesn't become a second place PII-bearing email
-- content has to be protected.

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  template_name text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  error_code text,
  error_message text,
  related_entity_type text,
  related_entity_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_logs_recipient_email_idx on public.email_logs(recipient_email);
create index email_logs_template_name_idx on public.email_logs(template_name);
create index email_logs_related_entity_idx on public.email_logs(related_entity_type, related_entity_id);

alter table public.email_logs enable row level security;
-- No policies: service-role writes/reads bypass RLS; every other role
-- is denied both select and insert by default.
