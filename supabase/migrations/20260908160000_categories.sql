-- Phase 9E — per-store product categories with real CRUD (item 1).
-- `products.category` stays as the denormalised text the storefront filters on;
-- this table is the controlled vocabulary the owner manages.

create table if not exists product_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (business_id, slug)
);
create index if not exists product_categories_business_idx on product_categories(business_id, sort);

alter table product_categories enable row level security;
create policy product_categories_tenant on product_categories
  using (business_id = app.current_business_id());

-- seed from whatever free-text categories the store already uses
insert into product_categories (business_id, name, slug, sort)
select distinct
  p.business_id,
  trim(p.category),
  nullif(regexp_replace(lower(trim(p.category)), '[^a-z0-9]+', '-', 'g'), '-'),
  0
from products p
where p.category is not null
  and trim(p.category) <> ''
  and nullif(regexp_replace(lower(trim(p.category)), '[^a-z0-9]+', '-', 'g'), '-') is not null
on conflict (business_id, slug) do nothing;
