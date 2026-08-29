-- ════════════════════════════════════════════════════════════════════════════
-- MEDIA ASSETS + REVIEW TOKENS
-- Cloudinary holds the bytes; Supabase holds the URL + metadata + references so
-- unused media can be found and cleaned. Review tokens gate verified-buyer
-- reviews (one per delivered order item).
-- ════════════════════════════════════════════════════════════════════════════

create table media_assets (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  public_id     text not null,           -- Cloudinary public_id
  url           text not null,           -- secure delivery URL
  width         integer,
  height        integer,
  bytes         integer,
  format        text,
  alt           text,
  folder        text not null default 'products',
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (business_id, public_id)
);
create index media_assets_business_idx on media_assets(business_id, created_at desc);

alter table media_assets enable row level security;
create policy media_assets_tenant on media_assets using (business_id = app.current_business_id());

-- Verified-buyer review invitations.
create table review_tokens (
  token        text primary key,
  business_id  uuid not null references businesses(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (order_id, product_id)
);
create index review_tokens_business_idx on review_tokens(business_id);

alter table review_tokens enable row level security;
create policy review_tokens_tenant on review_tokens using (business_id = app.current_business_id());
