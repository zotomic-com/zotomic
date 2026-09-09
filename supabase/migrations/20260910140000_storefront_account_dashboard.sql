-- ════════════════════════════════════════════════════════════════════════════
-- Storefront customer dashboard — server-persisted wishlist, shopper password
-- reset, and customer-initiated returns / cancellations.
-- ════════════════════════════════════════════════════════════════════════════

-- ── server-persisted wishlist (signed-in shoppers; guests stay localStorage) ──
create table if not exists store_account_wishlist (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  account_id  uuid not null references store_accounts(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (account_id, product_id)
);
create index if not exists store_account_wishlist_account_idx on store_account_wishlist(account_id, created_at desc);
create index if not exists store_account_wishlist_business_idx on store_account_wishlist(business_id);

alter table store_account_wishlist enable row level security;
create policy store_account_wishlist_tenant on store_account_wishlist
  using (business_id = app.current_business_id());

-- ── storefront-account password reset ────────────────────────────────────────
alter table store_accounts
  add column if not exists reset_token         text,
  add column if not exists reset_token_expires timestamptz;
create index if not exists store_accounts_reset_token_idx
  on store_accounts(reset_token) where reset_token is not null;

-- ── customer-initiated returns ───────────────────────────────────────────────
alter table returns
  add column if not exists source text not null default 'admin'
    check (source in ('admin', 'customer'));

-- ── who cancelled an order (owner vs shopper self-service) ────────────────────
alter table orders
  add column if not exists cancelled_by text
    check (cancelled_by in ('owner', 'customer'));

notify pgrst, 'reload schema';
