-- Wysker Watch — let an assigned sitter read check-in/observation data for
-- the pets covered by their sit, so the Pets I Sit Wellbeing chips (spec
-- 0037) can show real data instead of being permanently blocked.
--
-- Same root cause as 0030/0031: daily_check_ins and observations RLS
-- (from 0014_daily_checkins_wellness.sql) only ever granted access via
-- is_pet_owner(), never a sitter. Reuses the existing is_pet_sitter()
-- helper from 0031_pets_select_sitter.sql rather than redefining it.
create policy "daily_check_ins_select_sitter" on public.daily_check_ins
  for select using (public.is_pet_sitter(pet_id, auth.uid()));

create policy "observations_select_sitter" on public.observations
  for select using (public.is_pet_sitter(pet_id, auth.uid()));
