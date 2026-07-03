-- ============================================================
-- Fix: newly-created pets were invisible to their own creator
-- within the same INSERT statement, causing every add-pet save
-- to fail with a 403 "row-level security policy" error.
--
-- Root cause: pets_select_owner (added in 0004) checks
-- is_pet_owner(id, auth.uid()), which runs its own subquery
-- against public.pets. When PostgREST does
-- `INSERT ... RETURNING *` (triggered by `.insert().select()` /
-- `?select=*`), Postgres must evaluate the SELECT policy on the
-- row being inserted *within that same statement* - and a
-- self-referential subquery scan doesn't see a row the statement
-- is still in the middle of inserting. A plain SELECT run as a
-- separate statement afterward works fine; only the
-- INSERT+RETURNING case is affected.
--
-- Fix: give pets_select_owner a direct, subquery-free path for
-- "you just created this row" (checked against the row's own
-- created_by column, no scan needed) in addition to the existing
-- is_pet_owner() check for co-owner access on rows the caller
-- didn't create.
-- ============================================================

drop policy "pets_select_owner" on public.pets;

create policy "pets_select_owner" on public.pets
  for select using (
    created_by = auth.uid()
    or public.is_pet_owner(id, auth.uid())
  );
