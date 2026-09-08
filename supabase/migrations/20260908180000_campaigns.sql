-- Phase 9F — marketing campaigns (item 10). A campaign links a spend + a date
-- window to one or more products. Attribution is computed on read (all sales of
-- the linked products inside [starts_on, ends_on] — no channel guessing), so
-- nothing here stores derived numbers.

create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  status      text not null default 'planned' check (status in ('planned','running','ended')),
  budget_usd  numeric(12,2) not null default 0,
  spend_usd   numeric(12,2),                  -- actual, entered after the campaign ends
  starts_on   date not null,
  ends_on     date not null,
  fx_rate     numeric(10,4),                  -- USD→BDT rate captured for reproducibility
  fx_at       timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists campaigns_business_idx on campaigns(business_id, starts_on desc);

alter table campaigns enable row level security;
create policy campaigns_tenant on campaigns using (business_id = app.current_business_id());
create trigger campaigns_updated before update on campaigns
  for each row execute function set_updated_at();

create table if not exists campaign_products (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  primary key (campaign_id, product_id)
);
create index if not exists campaign_products_product_idx on campaign_products(product_id);

alter table campaign_products enable row level security;
create policy campaign_products_tenant on campaign_products using (business_id = app.current_business_id());
