-- Poll couriers for shipment status updates twice a day.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function app.trigger_shipment_sync()
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
    url     := base_url || '/api/cron/shipments',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;

select cron.schedule('shipment-sync', '0 */6 * * *', $$select app.trigger_shipment_sync()$$);
