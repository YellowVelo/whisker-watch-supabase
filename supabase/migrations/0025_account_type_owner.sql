-- Adds 'owner' as a valid account_type: a real personal-use account,
-- distinct from 'production' so it can be filtered out of future
-- real-user analytics, and — critically — excluded from
-- reset-sandbox-account's allow-list (which only permits 'test'/'demo'),
-- so an owner account can never be wiped via that path.
--
-- Finds and drops whatever the existing check constraint on
-- account_type happens to be named (rather than assuming the default
-- Postgres-generated name), so this doesn't depend on exactly how it
-- was created.
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'profiles'
    and att.attname = 'account_type'
    and con.contype = 'c';

  if existing_constraint is not null then
    execute format('alter table public.profiles drop constraint %I', existing_constraint);
  end if;

  alter table public.profiles add constraint profiles_account_type_check
    check (account_type in ('production', 'test', 'demo', 'owner'));
end $$;
