-- Wysker Watch — server function lockdown (spec 0077; punch list PA-05, PA-29)
--
-- Bugs:
--   * PA-05 (0068 P0-4, P1-7): server-only functions were runnable by
--     logged-out (anon) and signed-in (authenticated) callers. The worst:
--     process_resend_webhook_event() let anyone fake a bounce and silently
--     block all email to any address. Earlier migrations only revoked from
--     PUBLIC, but Supabase grants anon/authenticated directly, so those
--     grants survived. Root cause: the default privileges for role postgres
--     in schema public hand EXECUTE on every NEW function to anon and
--     authenticated (pg_default_acl on dev, checked 2026-11-22).
--   * PA-05: is_pet_owner() answered "does user X own pet Y?" for any X.
--   * PA-29: handle_new_user, classify_account_type and set_updated_at had
--     no fixed search_path (security advisor warning).
--
-- Fix:
--   * Every function in public is put in exactly one group, with every
--     permission set explicitly, so this lands the same on dev, staging and
--     prod whatever each started with:
--       - server-only: service_role only
--       - signed-in only: authenticated (+ service_role), never anon
--       - triggers: nobody (PostgreSQL doesn't check EXECUTE when a trigger
--         fires, so they keep working)
--   * New functions are locked by default: a future migration must grant
--     EXECUTE on purpose. RLS helpers need `grant execute ... to
--     authenticated` (0006 Technical Standards §11).
--   * is_pet_owner() answers only about the caller (the 0057 pattern). No
--     live policy or function passes anything but auth.uid() (checked on
--     dev 2026-11-22); server-side deletion code uses deletion_user_owns_pet
--     (0058) instead.
--
-- Post-push check (run on EACH project; spec 0077, 0006 §11). Expect: no
-- row's acl contains "anon=" or "=X/" (PUBLIC); server-only functions show
-- only postgres + service_role; the 3 PA-29 functions show search_path=public;
-- the default-privileges row for postgres/public lists no anon/authenticated.
--
--   select p.proname, p.proacl::text acl,
--          coalesce(array_to_string(p.proconfig, ','), '-') cfg
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' order by 1;
--
--   select coalesce(defaclnamespace::regnamespace::text, 'ALL') schema,
--          defaclacl::text acl
--   from pg_default_acl
--   where defaclrole = 'postgres'::regrole and defaclobjtype = 'f';

-- ── 1. New functions are locked by default ─────────────────────────────────
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;

-- ── 2. PA-29: fixed search path ────────────────────────────────────────────
alter function public.handle_new_user() set search_path = public;
alter function public.classify_account_type(text) set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- ── 3. is_pet_owner answers only about the caller ──────────────────────────
create or replace function public.is_pet_owner(p_pet_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_user_id = auth.uid(), false)
    and (
      exists (
        select 1 from public.pets
        where id = p_pet_id and created_by = p_user_id
      )
      or exists (
        select 1 from public.pet_co_owners
        where pet_id = p_pet_id and co_owner_user_id = p_user_id
      )
    );
$$;

-- ── 4. Explicit permissions for every function ─────────────────────────────
do $$
declare
  server_only text[] := array[
    'public.claim_email_idempotency_key(text, text, text)',
    'public.process_resend_webhook_event(text, text, text, text, timestamptz)',
    'public.email_has_password(text)',
    'public.compute_daily_analytics_summary(date)',
    'public.generate_vaccination_due_notifications()',
    'public.classify_account_type(text)',
    'public.check_and_record_rate_limit(text, integer, integer)',
    'public.check_and_record_rate_limits(text[], integer[], integer)',
    'public.get_auth_user_confirmation_state(text)',
    'public.prepare_account_deletion(uuid, text[])',
    'public.transfer_pet_ownership(uuid, uuid, text, boolean)',
    'public.deletion_display_name(uuid, text)',
    'public.deletion_hand_over_sit(uuid, uuid)',
    'public.deletion_sit_label(uuid)',
    'public.deletion_user_owns_pet(uuid, uuid)'
  ];
  signed_in text[] := array[
    'public.is_pet_owner(uuid, uuid)',
    'public.is_pet_sitter(uuid, uuid)',
    'public.is_pet_sit_sitter(uuid, uuid)',
    'public.is_primary_pet_owner(uuid, uuid)',
    'public.caller_owns_every_pet(uuid[])',
    'public.caller_owns_pet_sit(uuid)',
    'public.pet_in_sit(uuid, uuid)',
    'public.pet_sit_is_open(uuid)',
    'public.claim_pending_co_owner_invites()',
    'public.claim_pending_sitter_invites()',
    'public.save_daily_check_ins(jsonb)'
  ];
  triggers text[] := array[
    'public.handle_new_user()',
    'public.set_updated_at()',
    'public.protect_privileged_profile_fields()',
    'public.validate_profile_timezone()'
  ];
  fn text;
begin
  foreach fn in array server_only || signed_in || triggers loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array server_only || signed_in loop
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  foreach fn in array signed_in loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end
$$;

-- ── 5. Nothing in public may be left open to anon or PUBLIC ────────────────
-- Fails the migration if a function exists that the lists above missed
-- (e.g. one added on another project outside the migrations).
do $$
declare
  leftover text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into leftover
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    -- functions owned by an extension aren't ours to lock
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass
                      and d.objid = p.oid and d.deptype = 'e')
    and (has_function_privilege('anon', p.oid, 'execute')
         or p.proacl is null);
  if leftover is not null then
    raise exception 'spec 0077: functions still runnable by anon/PUBLIC: %', leftover;
  end if;
end
$$;
