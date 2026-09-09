-- Daily platform fraud scan (03:30 UTC).
create or replace function app.trigger_fraud_scan()
returns void
language plpgsql
security definer
as $$
declare base_url text; secret text;
begin
  select value into base_url from app.config where key = 'app_base_url';
  select value into secret   from app.config where key = 'cron_secret';
  if base_url is null or secret is null then return; end if;
  perform net.http_post(
    url     := base_url || '/api/cron/fraud-scan',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;

select cron.schedule('fraud-scan', '30 3 * * *', $$select app.trigger_fraud_scan()$$);
