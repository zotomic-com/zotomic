-- Domain reseller: admin sells domains directly from zotomic.com/domains,
-- funded from the admin's own Dynadot balance, paid via personal bKash/Nagad
-- and verified by an SMS-forwarding webhook (see app/api/domains/sms-webhook).

create table if not exists domain_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  domain_name text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  forward_to_email text,
  point_to text not null default 'self' check (point_to in ('zotomic', 'self')),
  wholesale_cost numeric(10, 2) not null,
  retail_price numeric(10, 2) not null,
  invoice_amount numeric(10, 2) not null,
  payment_method text not null check (payment_method in ('bkash', 'nagad')),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'registering', 'active', 'failed', 'cancelled')),
  paid_trx_id text,
  paid_at timestamptz,
  registered_at timestamptz,
  expires_at date,
  auto_renew boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists domain_orders_status_idx on domain_orders (status);
create index if not exists domain_orders_expires_idx on domain_orders (expires_at) where status = 'active';

create table if not exists domain_sms_log (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  sender_number text,
  amount numeric(10, 2),
  trx_id text,
  matched_order_id uuid references domain_orders(id),
  received_at timestamptz not null default now()
);

-- Renewal check, scheduled daily — mirrors app.trigger_billing() in 20260829160000_billing.sql.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function app.trigger_domain_renewals()
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
    url     := base_url || '/api/cron/domain-renewals',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;

select cron.schedule('domain-renewals', '0 3 * * *', $$select app.trigger_domain_renewals()$$);
