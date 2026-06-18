-- Run this ONCE in the Supabase SQL editor.
-- Schedules the nightly renewal check at midnight Trinidad time (4am UTC).
--
-- Requires pg_cron and pg_net extensions (enabled by default on Supabase).
-- Go to: Database → Extensions → enable pg_cron and pg_net if not already on.

-- 1. Enable extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Remove existing schedule if re-running
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nightly-renewal') then
    perform cron.unschedule('nightly-renewal');
  end if;
end $$;

-- 3. Schedule at 4am UTC = midnight Trinidad & Tobago time (UTC-4)
--    Cron format: minute hour day month weekday
select cron.schedule(
  'nightly-renewal',
  '0 4 * * *',
  $$
    select net.http_post(
      url     := 'https://pqjnkazkkagmewbaylti.supabase.co/functions/v1/nightly-renewal',
      headers := '{"Content-Type": "application/json", "x-ttflix-cron": "true"}'::jsonb,
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- 4. Confirm
select jobname, schedule, command from cron.job where jobname = 'nightly-renewal';
