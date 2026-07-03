-- Whisker Watch — first-party analytics event log.
-- Generic event table (not just for Add Pet) since there's no third-party
-- analytics provider wired up yet; this is real base data future metrics
-- work can query, not a placeholder.

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_event_name_created_at_idx
  on public.analytics_events(event_name, created_at);

alter table public.analytics_events enable row level security;

create policy "analytics_events_insert_own" on public.analytics_events
  for insert with check (auth.uid() = user_id);

create policy "analytics_events_select_own" on public.analytics_events
  for select using (auth.uid() = user_id);
