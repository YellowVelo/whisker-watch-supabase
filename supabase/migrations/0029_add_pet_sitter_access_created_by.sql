-- Wysker Watch — add pet_sitter_access.created_by
--
-- Bug found while manually testing the sitter-invite-email fix (see
-- requirements-sitter-invite-email.md): entityClient.js's generic
-- create() helper (used by every entity in the app) always sets
-- `created_by` on insert. pet_co_owners was deliberately given a
-- created_by column for exactly this reason — see 0004_co_owner_
-- accounts.sql's own comment: "kept for consistency with
-- entityClient.js's generic create() helper, which always sets this
-- field." pet_sitter_access, created earlier in 0001_init_schema.sql,
-- before that convention existed, never got the same column.
--
-- Consequence: every call to entities.PetSitterAccess.create(...) —
-- i.e. every attempt to invite a sitter, ever, in any environment —
-- has always failed with PGRST204 ("Could not find the 'created_by'
-- column of 'pet_sitter_access' in the schema cache"), silently (the
-- calling code has no try/catch), before this migration. This is a
-- pre-existing bug, not something introduced by the sitter-invite-email
-- change; it was only surfaced by actually exercising the flow end to
-- end.
alter table public.pet_sitter_access
  add column created_by uuid references auth.users(id) on delete cascade;

-- Backfill: no legitimate pet_sitter_access rows are expected to exist
-- (the insert always failed before this fix), but backfill from
-- owner_id defensively in case any environment has rows created another
-- way, so the NOT NULL constraint below doesn't fail against existing data.
update public.pet_sitter_access set created_by = owner_id where created_by is null;

alter table public.pet_sitter_access
  alter column created_by set not null;
