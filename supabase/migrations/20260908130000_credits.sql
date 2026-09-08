-- Phase 9C — Zotomic Assistant credit system.
--
-- Two buckets per store:
--   allowance_balance  — the weekly plan grant (free 15 / business 250 / pro 1200).
--                        Resets every Friday. May go negative to a -20 overdraft
--                        floor; the overdraft is repaid from the next grant.
--   purchased_balance  — bought top-up packs. Never expires, never resets.
-- Spendable = allowance_balance + purchased_balance. Spend draws allowance first.

create table if not exists credit_accounts (
  business_id        uuid primary key references businesses(id) on delete cascade,
  allowance_balance  integer not null default 0,
  purchased_balance  integer not null default 0,
  plan_allowance     integer not null default 0,
  week_resets_on     date not null default current_date,
  lifetime_purchased integer not null default 0,
  lifetime_spent     integer not null default 0,
  updated_at         timestamptz not null default now()
);

alter table credit_accounts enable row level security;
create policy credit_accounts_tenant on credit_accounts
  using (business_id = app.current_business_id());

-- append-only movement log
create table if not exists credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  delta         integer not null,                       -- + grant, - spend
  reason        text not null,                          -- weekly_allowance | assistant | purchase | admin_adjust | signup_grant
  balance_after integer not null,                       -- spendable total after this movement
  ref_type      text,
  ref_id        text,
  actor_id      uuid references users(id) on delete set null,
  actor_type    text not null default 'system',         -- system | owner | admin | assistant
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists credit_ledger_business_idx on credit_ledger(business_id, created_at desc);

alter table credit_ledger enable row level security;
create policy credit_ledger_tenant on credit_ledger
  using (business_id = app.current_business_id());

-- owner-submitted top-up payments, admin confirms
create table if not exists credit_purchases (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  pack_id      text not null,
  credits      integer not null,
  amount       numeric(10,2) not null,
  currency     text not null default 'BDT',
  method       text not null check (method in ('bkash','nagad')),
  txn_id       text not null,
  status       text not null default 'submitted' check (status in ('submitted','granted','rejected')),
  note         text,
  submitted_by uuid references users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  resolved_by  uuid references users(id) on delete set null,
  resolved_at  timestamptz
);
create index if not exists credit_purchases_status_idx on credit_purchases(status, submitted_at desc);
create index if not exists credit_purchases_business_idx on credit_purchases(business_id, submitted_at desc);

alter table credit_purchases enable row level security;
create policy credit_purchases_tenant on credit_purchases
  using (business_id = app.current_business_id());

-- ── weekly Friday allowance reset ──────────────────────────────────────────
-- Repays any overdraft out of the fresh grant; purchased balance untouched.
create or replace function app.reset_credit_allowances()
returns void
language sql
security definer
as $$
  update credit_accounts
    set allowance_balance = plan_allowance + least(allowance_balance, 0),
        week_resets_on    = current_date + 7,
        updated_at        = now()
  where week_resets_on <= current_date;
$$;

create or replace function app.trigger_credit_reset()
returns void
language plpgsql
security definer
as $$
declare base_url text; secret text;
begin
  perform app.reset_credit_allowances();
  select value into base_url from app.config where key = 'app_base_url';
  select value into secret   from app.config where key = 'cron_secret';
  if base_url is null or secret is null then return; end if;
  perform net.http_post(
    url     := base_url || '/api/cron/credits',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;

-- Fridays at 04:00 UTC
select cron.schedule('credit-reset', '0 4 * * 5', $$select app.trigger_credit_reset()$$);
