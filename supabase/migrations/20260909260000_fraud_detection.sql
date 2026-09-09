-- Platform fraud detection. A `fraud_flags` row is a person (keyed by phone,
-- optionally email) flagged at one of three stages:
--   1  Watch      — auto-detected soft signals, or a single report
--   2  Suspect    — several strong signals / cross-store pattern / admin review
--   3  Blacklist  — admin-confirmed fraud; their new orders are auto-held
--
-- Every store gets warned when a flagged person orders (unless the admin turns
-- it off for that store). Only Stage-3 auto-holds the order.

create table if not exists fraud_flags (
  id               uuid primary key default gen_random_uuid(),
  phone            text,                     -- normalized digits (see lib/fraud/phone)
  email            text,
  name             text,
  stage            integer not null default 1 check (stage between 1 and 3),
  category         text not null default 'other',
  reason           text,
  evidence         jsonb not null default '{}',
  stores           jsonb not null default '[]',   -- [{ businessId, name, cancelled, returned, orders }]
  auto_score       numeric,                        -- 0-100 risk score from the scanner
  source           text not null default 'auto' check (source in ('auto','manual','report')),
  status           text not null default 'active' check (status in ('active','cleared')),
  created_by       uuid references users(id) on delete set null,
  cleared_by       uuid references users(id) on delete set null,
  first_seen_at    timestamptz,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists fraud_flags_phone_active
  on fraud_flags(phone) where phone is not null and status = 'active';
create index if not exists fraud_flags_stage_idx on fraud_flags(status, stage desc, last_activity_at desc);

create table if not exists fraud_order_matches (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  flag_id     uuid not null references fraud_flags(id) on delete cascade,
  stage       integer not null,
  matched_on  text not null,               -- phone | email
  held        boolean not null default false,
  cleared     boolean not null default false,
  cleared_by  uuid references users(id) on delete set null,
  cleared_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists fraud_order_matches_order_idx on fraud_order_matches(order_id);
create index if not exists fraud_order_matches_biz_idx   on fraud_order_matches(business_id, created_at desc);
create index if not exists fraud_order_matches_flag_idx  on fraud_order_matches(flag_id, created_at desc);

alter table orders     add column if not exists fraud_hold             boolean not null default false;
alter table businesses add column if not exists fraud_warnings_enabled boolean not null default true;

alter table fraud_flags        enable row level security;
alter table fraud_order_matches enable row level security;
drop policy if exists fraud_matches_tenant on fraud_order_matches;
create policy fraud_matches_tenant on fraud_order_matches
  using (business_id = app.current_business_id());
