-- Whisker Watch — Add Pet expansion (V1)
-- Extends public.pets with the fields collected by the expanded Add Pet
-- form: sex, altered status, birth-date precision, gotcha day, microchip,
-- and AKC registration info for dogs. See "01 Features/Pet Management/Add Pet.md".
--
-- Life stage is intentionally NOT a column here — it's derived at read time
-- from species + birth_date + birth_date_precision (src/lib/lifeStage.js) so
-- it can never go stale as a pet ages.
--
-- Partial birth/gotcha dates are normalized into the existing date columns
-- rather than adding separate month/year columns: MONTH_YEAR -> first of
-- that month, YEAR -> Jan 1 of that year, UNKNOWN -> NULL. The precision
-- column tells the UI how much of the stored date is meaningful to show.

alter table public.pets
  add column sex text,
  add column altered_status text,
  add column birth_date_precision text,
  add column gotcha_date date,
  add column gotcha_date_precision text,
  add column microchip_number text,
  add column akc_registered boolean not null default false,
  add column akc_registered_name text,
  add column akc_registration_number text,
  add column breeder text;

-- Backfill precision for existing rows before making the column required,
-- so Harper/Auggie/Tribble's real recorded birthdays aren't mislabeled as
-- unknown.
update public.pets
set birth_date_precision = case when birth_date is not null then 'EXACT' else 'UNKNOWN' end;

alter table public.pets
  alter column birth_date_precision set not null,
  alter column birth_date_precision set default 'UNKNOWN';

alter table public.pets
  add constraint pets_sex_check
    check (sex is null or sex in ('Female', 'Male', 'Unknown')),
  add constraint pets_altered_status_check
    check (altered_status is null or altered_status in ('Yes', 'No', 'Unknown')),
  add constraint pets_birth_date_precision_check
    check (birth_date_precision in ('EXACT', 'MONTH_YEAR', 'YEAR', 'UNKNOWN')),
  add constraint pets_gotcha_date_precision_check
    check (gotcha_date_precision is null or gotcha_date_precision in ('EXACT', 'MONTH_YEAR', 'YEAR', 'UNKNOWN')),
  add constraint pets_microchip_number_length_check
    check (microchip_number is null or char_length(microchip_number) <= 50),
  add constraint pets_name_length_check
    check (char_length(name) <= 100),
  add constraint pets_notes_length_check
    check (notes is null or char_length(notes) <= 500),
  add constraint pets_birth_date_not_future_check
    check (birth_date is null or birth_date <= current_date),
  add constraint pets_gotcha_date_not_future_check
    check (gotcha_date is null or gotcha_date <= current_date);
