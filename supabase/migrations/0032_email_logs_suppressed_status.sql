-- Wysker Watch — email_logs 'suppressed' status
--
-- Adds a fourth allowed status so a test/demo-account send that
-- sendEmail() deliberately skips (see requirements-centralized-email-
-- suppression.md) leaves a distinct trace in email_logs, instead of
-- either looking like a real 'sent' row or leaving no row at all.

alter table public.email_logs
  drop constraint email_logs_status_check,
  add constraint email_logs_status_check check (status in ('pending', 'sent', 'suppressed', 'failed'));
