-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 7 — payment / courier integrations + shipments + admin feature overrides
--
-- integrations.credentials_encrypted holds an AES-256-CBC JSON blob of the
-- store owner's OWN merchant secrets. integrations.config holds non-secret
-- fields incl. { mode: 'sandbox' | 'live' }.
-- ════════════════════════════════════════════════════════════════════════════

-- per-business feature grants set by an admin (override plan gating)
alter table businesses
  add column if not exists feature_overrides jsonb not null default '{}';

alter table integrations
  add column if not exists mode text not null default 'sandbox' check (mode in ('sandbox', 'live')),
  add column if not exists last_error text;

-- shipments (courier bookings)
create table if not exists shipments (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  order_id       uuid not null references orders(id) on delete cascade,
  provider       text not null,
  consignment_id text,
  tracking_code  text,
  status         text not null default 'created'
                 check (status in ('created','picked_up','in_transit','delivered','returned','cancelled','failed')),
  cost           numeric(12,2),
  label_url      text,
  raw            jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (order_id)
);
create index shipments_business_idx on shipments(business_id, created_at desc);

alter table shipments enable row level security;
create policy shipments_tenant on shipments using (business_id = app.current_business_id());

create trigger shipments_updated before update on shipments for each row execute function set_updated_at();

-- payments (gateway transactions against storefront orders)
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  provider      text not null,
  mode          text not null default 'sandbox',
  amount        numeric(14,2) not null,
  currency      text not null default 'BDT',
  status        text not null default 'initiated'
                check (status in ('initiated','pending','paid','failed','cancelled','refunded')),
  provider_ref  text,
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index payments_order_idx on payments(order_id);
create index payments_business_idx on payments(business_id, created_at desc);

alter table payments enable row level security;
create policy payments_tenant on payments using (business_id = app.current_business_id());

create trigger payments_updated before update on payments for each row execute function set_updated_at();
