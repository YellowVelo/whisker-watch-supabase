-- Wysker Watch — distinguish "explicitly skipped" onboarding from
-- "interrupted mid-flow" (Product Principle #6: "Missing Data Is
-- Meaningful" — the system must be able to tell these apart, not just
-- treat both as "not completed").
--
-- skipped_at is stamped when the owner taps "Skip for now" on the Add
-- Pet success screen, and cleared back to null the moment they make
-- any forward progress in the wizard again — so it always reflects
-- "currently in a skipped state," not a permanent historical flag.

alter table public.pet_onboarding
  add column skipped_at timestamptz;
