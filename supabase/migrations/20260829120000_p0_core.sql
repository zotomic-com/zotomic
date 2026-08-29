-- ════════════════════════════════════════════════════════════════════════════
-- ZOTOMIC — P0 CORE SCHEMA
-- Multi-tenant business-intelligence SaaS. Every tenant-scoped table carries
-- business_id and has RLS enabled.
--
-- AUTHZ MODEL
--   The app authenticates with a custom JWT and talks to Postgres through the
--   Supabase service role, so tenant scoping is enforced in the service layer
--   (lib/tenant.ts -> every query filters by business_id). RLS here is the
--   backstop: anon / authenticated roles get NO access; only service_role does.
--   app.current_business_id() + the *_tenant_isolation policies are wired for a
--   future move to Supabase-session auth and are harmless until then.
-- ════════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() is built into Postgres 15+ core; no extension needed.
create schema if not exists app;

-- ── helpers ─────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Active business for the current request. Null unless the app sets the GUC
-- (`select set_config('app.current_business_id', $1, true)`), which it does not
-- do today — service-role access bypasses RLS regardless.
create or replace function app.current_business_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.current_business_id', true), '')::uuid
$$;

-- ── identity ────────────────────────────────────────────────────────────────
create table users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  password_hash text not null,
  role          text not null default 'owner' check (role in ('owner','staff','admin')),
  status        text not null default 'active' check (status in ('active','suspended')),
  last_login    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index users_email_lower_idx on users (lower(email));
create trigger users_updated before update on users for each row execute function set_updated_at();

create table businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  type        text,
  currency    text not null default 'BDT',
  timezone    text not null default 'Asia/Dhaka',
  description text,
  logo_url    text,
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger businesses_updated before update on businesses for each row execute function set_updated_at();

create table business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','staff')),
  is_default  boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_idx on business_members(user_id);
create index business_members_business_idx on business_members(business_id);

-- ── catalog & commerce ──────────────────────────────────────────────────────
create table products (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  status          text not null default 'draft' check (status in ('active','draft','archived')),
  price           numeric(14,2) not null default 0,
  sale_price      numeric(14,2),
  buying_price    numeric(14,2),
  marketing_cost  numeric(14,2) not null default 0,
  sku             text,
  category        text,
  stock_qty       integer not null default 0,
  track_inventory boolean not null default false,
  image_urls      jsonb not null default '[]',
  visible         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, slug)
);
create index products_business_idx on products(business_id);
create trigger products_updated before update on products for each row execute function set_updated_at();

create table customers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  name          text,
  email         text,
  phone         text,
  city          text,
  notes         text,
  total_orders  integer not null default 0,
  total_spent   numeric(14,2) not null default 0,
  first_order_at timestamptz,
  last_order_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, phone)
);
create index customers_business_idx on customers(business_id);
create trigger customers_updated before update on customers for each row execute function set_updated_at();

create table orders (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  order_number   text not null,
  customer_id    uuid references customers(id) on delete set null,
  channel        text not null default 'manual' check (channel in ('storefront','manual','import')),
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','processing','shipped','delivered','cancelled','returned')),
  payment_method text not null default 'cod' check (payment_method in ('cod','bkash','nagad','sslcommerz','other')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  subtotal       numeric(14,2) not null default 0,
  shipping       numeric(14,2) not null default 0,
  discount       numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  currency       text not null default 'BDT',
  address        jsonb,
  notes          text,
  placed_at      timestamptz not null default now(),
  delivered_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id, order_number)
);
create index orders_business_idx on orders(business_id);
create index orders_placed_idx on orders(business_id, placed_at desc);
create trigger orders_updated before update on orders for each row execute function set_updated_at();

create table order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  business_id  uuid not null references businesses(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  name         text not null,
  qty          integer not null default 1,
  unit_price   numeric(14,2) not null default 0,
  buying_price numeric(14,2),
  line_total   numeric(14,2) not null default 0,
  created_at   timestamptz not null default now()
);
create index order_items_order_idx on order_items(order_id);
create index order_items_business_idx on order_items(business_id);

-- ── intelligence ────────────────────────────────────────────────────────────
create table reports (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'queued' check (status in ('queued','generating','ready','failed')),
  summary      text,
  model        text,
  error        text,
  generated_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (business_id, period_start, period_end)
);
create index reports_business_idx on reports(business_id, period_end desc);

create table report_metrics (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references reports(id) on delete cascade,
  business_id    uuid not null references businesses(id) on delete cascade,
  key            text not null,
  label          text not null,
  value          numeric(18,4),
  previous_value numeric(18,4),
  unit           text,
  change_pct     numeric(10,2),
  direction      text check (direction in ('up','down','flat')),
  available      boolean not null default true,
  unavailable_reason text,
  created_at     timestamptz not null default now()
);
create index report_metrics_report_idx on report_metrics(report_id);

create table insights (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid references reports(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  type        text not null,
  severity    text not null default 'info' check (severity in ('info','low','medium','high')),
  title       text not null,
  body        text,
  evidence    jsonb not null default '{}',
  confidence  numeric(4,2),
  created_at  timestamptz not null default now()
);
create index insights_business_idx on insights(business_id);

create table recommendations (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid references reports(id) on delete cascade,
  insight_id  uuid references insights(id) on delete set null,
  business_id uuid not null references businesses(id) on delete cascade,
  title       text not null,
  detail      text,
  effort      text check (effort in ('low','medium','high')),
  impact      text check (impact in ('low','medium','high')),
  status      text not null default 'open' check (status in ('open','done','dismissed')),
  created_at  timestamptz not null default now()
);
create index recommendations_business_idx on recommendations(business_id);

-- ── billing (Zotomic's own subscription) ────────────────────────────────────
create table subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null unique references businesses(id) on delete cascade,
  plan                 text not null default 'free' check (plan in ('free','business','pro')),
  status               text not null default 'active'
                       check (status in ('active','grace','soft_lock','hard_lock','cancelled')),
  current_period_start date,
  current_period_end   date,
  price                numeric(12,2) not null default 0,
  currency             text not null default 'BDT',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  invoice_number  text not null unique,
  amount          numeric(12,2) not null,
  currency        text not null default 'BDT',
  status          text not null default 'open' check (status in ('open','paid','void')),
  due_date        date,
  payment_reference text not null,
  txn_id          text,
  txn_amount      numeric(12,2),
  txn_submitted_at timestamptz,
  paid_at         timestamptz,
  confirmed_by    uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index invoices_business_idx on invoices(business_id);
create index invoices_status_idx on invoices(status);

-- ── integrations & audit ────────────────────────────────────────────────────
create table integrations (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references businesses(id) on delete cascade,
  provider             text not null,
  category             text not null check (category in ('payment','courier','tracking','messaging','ai','analytics')),
  status               text not null default 'pending' check (status in ('connected','pending','error','disconnected')),
  credentials_encrypted text,
  config               jsonb not null default '{}',
  connected_at         timestamptz,
  last_sync_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (business_id, provider)
);
create index integrations_business_idx on integrations(business_id);
create trigger integrations_updated before update on integrations for each row execute function set_updated_at();

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  actor_id    uuid references users(id) on delete set null,
  actor_type  text not null default 'user' check (actor_type in ('user','admin','system','assistant')),
  action      text not null,
  target_type text,
  target_id   text,
  summary     text,
  before      jsonb,
  after       jsonb,
  request_id  text,
  ip          text,
  created_at  timestamptz not null default now()
);
create index audit_logs_business_idx on audit_logs(business_id, created_at desc);

-- ── tasks & notifications ───────────────────────────────────────────────────
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title       text not null,
  detail      text,
  priority    text not null default 'medium' check (priority in ('low','medium','high')),
  status      text not null default 'open' check (status in ('open','done')),
  source      text not null default 'user' check (source in ('user','assistant','system')),
  due_date    date,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_business_idx on tasks(business_id, status);
create trigger tasks_updated before update on tasks for each row execute function set_updated_at();

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid references users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  href        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_business_idx on notifications(business_id, created_at desc);

-- ── assistant & usage ───────────────────────────────────────────────────────
create table assistant_conversations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index assistant_conversations_business_idx on assistant_conversations(business_id);
create trigger assistant_conversations_updated before update on assistant_conversations for each row execute function set_updated_at();

create table assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  business_id     uuid not null references businesses(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool')),
  content         text,
  tool_name       text,
  tool_payload    jsonb,
  created_at      timestamptz not null default now()
);
create index assistant_messages_conv_idx on assistant_messages(conversation_id, created_at);

create table usage_ledger (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  kind        text not null check (kind in ('ai_tokens','tool_call','report')),
  tool_name   text,
  units       numeric(14,4) not null default 1,
  cost        numeric(14,6) not null default 0,
  task_id     text,
  created_at  timestamptz not null default now()
);
create index usage_ledger_business_idx on usage_ledger(business_id, created_at desc);

-- ── storefront ──────────────────────────────────────────────────────────────
create table storefront_config (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null unique references businesses(id) on delete cascade,
  subdomain         text unique,
  draft_json        jsonb not null default '{}',
  published_json    jsonb,
  published_version integer not null default 0,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger storefront_config_updated before update on storefront_config for each row execute function set_updated_at();

create table storefront_events (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  session_id  text,
  type        text not null,
  path        text,
  product_id  uuid references products(id) on delete set null,
  value       numeric(14,2),
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index storefront_events_business_idx on storefront_events(business_id, created_at desc);

create table product_reviews (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  rating        integer not null check (rating between 1 and 5),
  title         text,
  body          text,
  photo_urls    jsonb not null default '[]',
  reviewer_name text,
  status        text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index product_reviews_product_idx on product_reviews(product_id, status);
create trigger product_reviews_updated before update on product_reviews for each row execute function set_updated_at();

-- ── public marketing site ──────────────────────────────────────────────────
create table contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text,
  business   text,
  topic      text,
  message    text not null,
  status     text not null default 'new' check (status in ('new','read','closed')),
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Enable on every table. service_role bypasses RLS entirely (used by all API
-- routes); anon / authenticated get nothing. The *_tenant policy is a no-op
-- today (app.current_business_id() is null) and becomes active if/when the app
-- sets that GUC per request.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
declare tenant_tables text[] := array[
  'business_members','products','customers','orders','order_items',
  'reports','report_metrics','insights','recommendations','subscriptions','invoices',
  'integrations','audit_logs','tasks','notifications','assistant_conversations',
  'assistant_messages','usage_ledger','storefront_config','storefront_events','product_reviews'
];
begin
  execute 'alter table users enable row level security';
  execute 'alter table contact_messages enable row level security';

  execute 'alter table businesses enable row level security';
  execute 'create policy businesses_tenant on businesses using (id = app.current_business_id())';

  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %1$I_tenant on %1$I using (business_id = app.current_business_id())',
      t
    );
  end loop;
end $$;

-- Deny-by-default is the RLS default; no anon / authenticated policies are created.
-- service_role bypasses RLS and is what every API route uses.
