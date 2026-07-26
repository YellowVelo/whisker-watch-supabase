-- Wysker Watch — Revert prevent_demo_account_writes (rolls back migration 0036)
--
-- The demo-account read-only enforcement work (spec 0018) is being rolled
-- back after unresolved confusion verifying its frontend behavior. This
-- drops the trigger from all 14 tables it was attached to plus the
-- underlying function, restoring demo accounts to the same write access
-- they had before migration 0036. Migration 0036 itself is left in place
-- (not deleted) so migration history stays consistent across every
-- environment it was already applied to — this migration is the forward
-- record of the reversal, not a rewrite of history.

drop trigger if exists pets_prevent_demo_writes on public.pets;
drop trigger if exists daily_check_ins_prevent_demo_writes on public.daily_check_ins;
drop trigger if exists observations_prevent_demo_writes on public.observations;
drop trigger if exists medications_prevent_demo_writes on public.medications;
drop trigger if exists vaccinations_prevent_demo_writes on public.vaccinations;
drop trigger if exists bloodwork_prevent_demo_writes on public.bloodwork;
drop trigger if exists pet_foods_prevent_demo_writes on public.pet_foods;
drop trigger if exists pet_baselines_prevent_demo_writes on public.pet_baselines;
drop trigger if exists pet_onboarding_prevent_demo_writes on public.pet_onboarding;
drop trigger if exists symptom_logs_prevent_demo_writes on public.symptom_logs;
drop trigger if exists food_logs_prevent_demo_writes on public.food_logs;
drop trigger if exists pet_co_owners_prevent_demo_writes on public.pet_co_owners;
drop trigger if exists pet_sits_prevent_demo_writes on public.pet_sits;
drop trigger if exists pet_sit_logs_prevent_demo_writes on public.pet_sit_logs;
drop trigger if exists pet_sitter_access_prevent_demo_writes on public.pet_sitter_access;

drop function if exists public.prevent_demo_account_writes();
