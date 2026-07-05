-- Wysker Watch — profiles.first_name
--
-- The Home screen greeting ("Good morning, {First Name}") needs a name
-- somewhere on the profile; nothing in the schema captured one before
-- this. Added as a plain, self-editable column (not privileged, so the
-- existing profiles_update_own policy already covers it — no RLS change
-- needed) and populated at signup from auth metadata when provided.

alter table public.profiles
  add column first_name text check (char_length(first_name) <= 100);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, account_type, first_name)
  values (
    new.id,
    new.email,
    public.classify_account_type(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), '')
  );
  return new;
end;
$$ language plpgsql security definer;
