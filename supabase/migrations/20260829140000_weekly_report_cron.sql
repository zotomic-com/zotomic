-- ════════════════════════════════════════════════════════════════════════════
-- WEEKLY REPORT CRON
-- pg_cron fires a helper that POSTs to the app's /api/cron/weekly-reports route
-- (which runs the deterministic-metrics + Gemini-narrative pipeline).
-- The target URL and shared secret live in app.config (private schema, not
-- exposed via PostgREST) and are set out-of-band, never committed.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists app.config (
  key   text primary key,
  value text not null
);

create or replace function app.trigger_weekly_reports()
returns void
language plpgsql
security definer
as $$
declare
  base_url text;
  secret   text;
begin
  select value into base_url from app.config where key = 'app_base_url';
  select value into secret   from app.config where key = 'cron_secret';
  if base_url is null or secret is null then
    raise notice 'app.config missing app_base_url / cron_secret — skipping';
    return;
  end if;

  perform net.http_post(
    url     := base_url || '/api/cron/weekly-reports',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
end $$;

-- Every Monday 03:00 UTC (~09:00 Asia/Dhaka).
select cron.schedule(
  'weekly-reports',
  '0 3 * * 1',
  $$select app.trigger_weekly_reports()$$
);
