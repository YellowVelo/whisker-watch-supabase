-- Wysker Watch — Prevent Demo Account Writes (spec 0018, layer 2)
--
-- The demo account (account_type = 'demo') must be read-only: it can view
-- every screen but must never create, edit, or delete pet data. Layer 1
-- (entityClient.js) already blocks this for the app's normal CRUD path,
-- but anything that writes directly under the calling user's own session
-- — bypassing entityClient.js, e.g. the save_daily_check_ins RPC (migration
-- 0034, security invoker) or any future direct supabase.from(...) call —
-- would slip past that JS-only guard. This trigger is the real,
-- unbypassable backstop: it fires at the database level regardless of
-- which code path led to the write, as long as the write happens under
-- the user's own session (not the elevated service-role connection used
-- by delete-pet/invite-co-owner/invite-sitter, which get their own guard
-- in application code since the trigger can't see the real caller there).
--
-- RLS is untouched — this trigger fires before RLS would even evaluate,
-- and only ever blocks demo accounts; every other account type is
-- unaffected.

create or replace function public.prevent_demo_account_writes()
returns trigger as $$
begin
  if exists (
    select 1 from public.profiles where id = auth.uid() and account_type = 'demo'
  ) then
    raise exception 'demo accounts cannot modify pet data';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

create trigger pets_prevent_demo_writes
  before insert or update or delete on public.pets
  for each row execute procedure public.prevent_demo_account_writes();

create trigger daily_check_ins_prevent_demo_writes
  before insert or update or delete on public.daily_check_ins
  for each row execute procedure public.prevent_demo_account_writes();

create trigger observations_prevent_demo_writes
  before insert or update or delete on public.observations
  for each row execute procedure public.prevent_demo_account_writes();

create trigger medications_prevent_demo_writes
  before insert or update or delete on public.medications
  for each row execute procedure public.prevent_demo_account_writes();

create trigger vaccinations_prevent_demo_writes
  before insert or update or delete on public.vaccinations
  for each row execute procedure public.prevent_demo_account_writes();

create trigger bloodwork_prevent_demo_writes
  before insert or update or delete on public.bloodwork
  for each row execute procedure public.prevent_demo_account_writes();

create trigger pet_foods_prevent_demo_writes
  before insert or update or delete on public.pet_foods
  for each row execute procedure public.prevent_demo_account_writes();

create trigger pet_baselines_prevent_demo_writes
  before insert or update or delete on public.pet_baselines
  for each row execute procedure public.prevent_demo_account_writes();

create trigger pet_onboarding_prevent_demo_writes
  before insert or update or delete on public.pet_onboarding
  for each row execute procedure public.prevent_demo_account_writes();

create trigger symptom_logs_prevent_demo_writes
  before insert or update or delete on public.symptom_logs
  for each row execute procedure public.prevent_demo_account_writes();

create trigger food_logs_prevent_demo_writes
  before insert or update or delete on public.food_logs
  for each row execute procedure public.prevent_demo_account_writes();

create trigger pet_co_owners_prevent_demo_writes
  before insert or update or delete on public.pet_co_owners
  for each row execute procedure public.prevent_demo_account_writes();

create trigger pet_sits_prevent_demo_writes
  before insert or update or delete on public.pet_sits
  for each row execute procedure public.prevent_demo_account_writes();

create trigger pet_sit_logs_prevent_demo_writes
  before insert or update or delete on public.pet_sit_logs
  for each row execute procedure public.prevent_demo_account_writes();

create trigger pet_sitter_access_prevent_demo_writes
  before insert or update or delete on public.pet_sitter_access
  for each row execute procedure public.prevent_demo_account_writes();
