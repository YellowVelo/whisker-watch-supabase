-- Spec 0029 (Onboarding Refresh): adds a purely descriptive field shown on
-- the new merged Pet Information step. No overlap with any existing
-- tracked value (unlike weight, which stays out of this table — see
-- symptom_logs.weight_grams, the one place weight is written).

alter table public.pets
  add column color_markings text;
