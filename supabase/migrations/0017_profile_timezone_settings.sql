-- Wysker Watch — profile last_name + timezone settings
--
-- User Profile & Timezone Settings V1: extends profiles with the
-- remaining owner-identity field (last_name, matching the first_name
-- pattern from 0015) plus timezone storage for day-boundary
-- calculations and future scheduled notifications.
--
-- timezone is nullable — it's populated on first authenticated profile
-- load (client-side, via Intl.DateTimeFormat) rather than backfilled
-- here, since there's no reliable timezone to backfill existing rows
-- with. timezone_is_manual defaults to false so auto-detection is
-- free to populate it once; once a value is set (auto or manual) the
-- app never silently overwrites it (enforced in application code, not
-- the database, same as the read side of first_name).

alter table public.profiles
  add column last_name text check (char_length(last_name) <= 100),
  add column timezone text,
  add column timezone_is_manual boolean not null default false;

-- A CHECK constraint can't validate timezone against the real IANA
-- list (checks can't query other relations), so this is enforced with
-- a trigger instead — same reasoning as protect_privileged_profile_fields
-- (0011). Without this, RLS only restricts *who* can write a profiles
-- row, not *what* value they write, so a client calling the Supabase
-- REST API directly (bypassing the app's own isValidIanaTimezone
-- check) could otherwise store an arbitrary string in `timezone`,
-- violating the requirement that it always be a valid IANA identifier.
-- pg_timezone_names is Postgres's own catalog of valid zones, so this
-- is authoritative rather than a best-effort regex.
create or replace function public.validate_profile_timezone()
returns trigger as $$
begin
  if new.timezone is not null and not exists (
    select 1 from pg_timezone_names where name = new.timezone
  ) then
    raise exception 'timezone must be a valid IANA timezone identifier';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger profiles_validate_timezone
  before insert or update on public.profiles
  for each row execute procedure public.validate_profile_timezone();
