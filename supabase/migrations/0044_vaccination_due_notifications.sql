-- Vaccination due-date reminders (spec 0034).
--
-- Extends the existing in-app `notifications` table (previously only used
-- for ownership-transfer notices) with a generic "what real-world record
-- is this about" reference, so a reminder can be deduplicated/escalated/
-- snoozed instead of just being a one-off message.

alter table public.notifications
  add column related_type text,
  add column related_id uuid,
  add column stage text,
  add column snoozed_until timestamptz;

create index notifications_related_idx
  on public.notifications(related_type, related_id);

-- Generates/escalates vaccination-due reminders for every pet owner and
-- co-owner. Reads across all users' pets/vaccinations/notifications, which
-- per-user RLS would otherwise block — runs with elevated privileges
-- deliberately, same rationale as compute_daily_analytics_summary
-- (migration 0023) and only ever writes to public.notifications.
create or replace function public.generate_vaccination_due_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  vax record;
  recipient uuid;
  target_stage text;
  days_until integer;
  body text;
  existing_id uuid;
  existing_stage text;
  existing_read boolean;
  existing_snoozed_until timestamptz;
begin
  for vax in
    select v.id, v.vaccine_name, v.next_due_date, v.pet_id, p.name as pet_name
    from public.vaccinations v
    join public.pets p on p.id = v.pet_id
    where v.next_due_date is not null
  loop
    days_until := vax.next_due_date - current_date;

    target_stage := case
      when days_until between 15 and 30 then '30_day'
      when days_until between 8 and 14 then '14_day'
      when days_until between 4 and 7 then '7_day'
      when days_until between 1 and 3 then '3_day'
      when days_until = 0 then 'due_today'
      when days_until between -14 and -1 then 'overdue'
      else null
    end;

    if target_stage is null then
      continue;
    end if;

    body := case target_stage
      when '30_day' then vax.vaccine_name || ' is due for ' || vax.pet_name || ' in 30 days.'
      when '14_day' then vax.vaccine_name || ' is due for ' || vax.pet_name || ' in 14 days.'
      when '7_day' then vax.vaccine_name || ' is due for ' || vax.pet_name || ' next week.'
      when '3_day' then vax.vaccine_name || ' is due for ' || vax.pet_name || ' in 3 days.'
      when 'due_today' then vax.pet_name || E'’s ' || vax.vaccine_name || ' vaccination is due today.'
      when 'overdue' then vax.pet_name || E'’s ' || vax.vaccine_name || ' vaccination is overdue. Update the record once it''s been completed.'
    end;

    -- Recipients: the primary owner plus every linked co-owner. Pet
    -- sitters (pet_sitter_access) are deliberately excluded — temporary
    -- access, not ownership.
    for recipient in
      select p.created_by from public.pets p where p.id = vax.pet_id
      union
      select co.co_owner_user_id from public.pet_co_owners co
      where co.pet_id = vax.pet_id and co.co_owner_user_id is not null
    loop
      select n.id, n.stage, n.read, n.snoozed_until
        into existing_id, existing_stage, existing_read, existing_snoozed_until
      from public.notifications n
      where n.user_id = recipient
        and n.related_type = 'vaccination_due'
        and n.related_id = vax.id
      order by n.created_at desc
      limit 1;

      -- Still within an active snooze window: don't regenerate yet,
      -- regardless of what stage this would otherwise be.
      if existing_snoozed_until is not null and existing_snoozed_until > now() then
        continue;
      end if;

      -- Already sent this exact stage (read or unread) — don't duplicate.
      if existing_id is not null and existing_stage = target_stage then
        continue;
      end if;

      -- Escalating past a still-unread reminder: supersede it so the
      -- owner only ever sees one active reminder per vaccine.
      if existing_id is not null and existing_read = false then
        update public.notifications set read = true where id = existing_id;
      end if;

      insert into public.notifications (user_id, type, message, related_type, related_id, stage, read)
      values (recipient, 'vaccination_due', body, 'vaccination_due', vax.id, target_stage, false);
    end loop;
  end loop;
end;
$function$;

do $cron_setup$
begin
  if not exists (select 1 from cron.job where jobname = 'daily-vaccination-due-notifications') then
    perform cron.schedule(
      'daily-vaccination-due-notifications',
      '0 12 * * *',
      $cron_job$select public.generate_vaccination_due_notifications()$cron_job$
    );
  end if;
end;
$cron_setup$;
