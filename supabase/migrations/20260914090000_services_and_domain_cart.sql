-- Services marketplace (admin-editable catalog) + domain cart (replaces the
-- single-item domain_orders/domain_sms_log from 20260913120000_domain_reseller.sql,
-- which shipped hours earlier with zero real orders — safe to replace cleanly).

create table if not exists platform_service_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  icon text not null default 'Sparkles',
  status text not null default 'coming_soon' check (status in ('live', 'coming_soon')),
  href text,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into platform_service_cards (title, description, icon, status, href, sort_order) values
  ('Domain', 'Search, buy, or transfer a domain — paid by bKash or Nagad, no card needed.', 'Globe', 'live', '/domains', 0),
  ('Hosting', 'Fast, managed hosting for your website or store.', 'CloudCog', 'coming_soon', null, 1),
  ('Web Design', 'A professionally designed site, built for you.', 'Palette', 'coming_soon', null, 2),
  ('Web Development', 'Custom web app development for your business.', 'BarChart3', 'coming_soon', null, 3),
  ('Automation Service', 'Automate the busywork — orders, replies, reports.', 'Zap', 'coming_soon', null, 4)
on conflict do nothing;

-- "Services" in the header nav, right after Pricing — same admin-editable
-- platform_nav_links table every other marketing-site link already uses.
insert into platform_nav_links (location, section, label, href, sort_order, enabled)
select 'header', 'primary', 'Services', '/services', 5, true
where not exists (select 1 from platform_nav_links where location = 'header' and href = '/services');

-- Replace the single-item domain_orders/domain_sms_log — both confirmed empty,
-- shipped same-day with no real customers yet — with a parent/child cart shape
-- (payment tracked once per combined invoice, fulfillment tracked per domain).
drop table if exists domain_sms_log;
drop table if exists domain_orders;

create table domain_cart_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  user_id uuid references users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  payment_method text not null check (payment_method in ('bkash', 'nagad')),
  subtotal numeric(10, 2) not null,
  invoice_amount numeric(10, 2) not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'cancelled')),
  paid_trx_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index domain_cart_orders_user_idx on domain_cart_orders(user_id);
create index domain_cart_orders_status_idx on domain_cart_orders(status);

create table domain_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_order_id uuid not null references domain_cart_orders(id) on delete cascade,
  item_type text not null default 'register' check (item_type in ('register', 'transfer')),
  domain_name text not null,
  auth_code text,
  point_to text not null default 'self' check (point_to in ('zotomic', 'self')),
  forward_to_email text,
  wholesale_cost numeric(10, 2) not null,
  retail_price numeric(10, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'registering', 'transferring', 'active', 'grace', 'dropped', 'failed', 'cancelled')),
  registered_at timestamptz,
  expires_at date,
  auto_renew boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index domain_cart_items_order_idx on domain_cart_items(cart_order_id);
create index domain_cart_items_expires_idx on domain_cart_items(expires_at) where status in ('active', 'grace');

create table domain_sms_log (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  sender_number text,
  amount numeric(10, 2),
  trx_id text,
  matched_order_id uuid references domain_cart_orders(id),
  received_at timestamptz not null default now()
);
