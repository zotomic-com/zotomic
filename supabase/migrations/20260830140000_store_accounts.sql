-- ════════════════════════════════════════════════════════════════════════════
-- Storefront customer accounts (shopper login/signup — separate per store).
-- Distinct from `customers` (the tenant's CRM/order record); an account links
-- to a `customers` row by phone/email so order history lines up.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists store_accounts (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  customer_id       uuid references customers(id) on delete set null,
  name              text,
  email             text not null,
  phone             text,
  password_hash     text not null,
  email_verified_at timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, email)
);
create index if not exists store_accounts_business_idx on store_accounts(business_id);

alter table store_accounts enable row level security;
create policy store_accounts_tenant on store_accounts
  using (business_id = app.current_business_id());
create trigger store_accounts_updated before update on store_accounts
  for each row execute function set_updated_at();

create table if not exists store_account_addresses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  account_id  uuid not null references store_accounts(id) on delete cascade,
  label       text,
  name        text,
  phone       text,
  address     text,
  city        text,
  area        text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists store_account_addresses_account_idx on store_account_addresses(account_id);

alter table store_account_addresses enable row level security;
create policy store_account_addresses_tenant on store_account_addresses
  using (business_id = app.current_business_id());

-- link an order back to the shopper account that placed it (optional)
alter table orders
  add column if not exists store_account_id uuid references store_accounts(id) on delete set null;
