-- Per-TLD pricing overrides (multi-provider-ready) + renewal tracking, so the
-- "Renewed" bucket on the admin Domains tab means something.

alter table domain_cart_items add column if not exists renewal_count int not null default 0;

create table if not exists domain_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'dynadot',
  tld text not null,
  commission_percent numeric(6, 2),
  buying_price_usd numeric(10, 2),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, tld)
);
