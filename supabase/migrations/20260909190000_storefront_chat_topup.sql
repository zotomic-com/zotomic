-- Storefront Assistant top-ups — owner buys extra conversation capacity for
-- campaign spikes. Same submit→admin-confirm loop as credit_purchases: the
-- owner submits a bKash/Nagad transaction, an admin grants it, and the granted
-- conversations land in storefront_assistant_config.extra_conversations.

create table if not exists storefront_chat_purchases (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  pack_id       text not null,
  conversations integer not null,
  amount        numeric(10,2) not null,
  currency      text not null default 'BDT',
  method        text not null check (method in ('bkash','nagad')),
  txn_id        text not null,
  status        text not null default 'submitted' check (status in ('submitted','granted','rejected')),
  note          text,
  submitted_by  uuid references users(id) on delete set null,
  submitted_at  timestamptz not null default now(),
  resolved_by   uuid references users(id) on delete set null,
  resolved_at   timestamptz
);
create index if not exists sf_chat_purchases_status_idx   on storefront_chat_purchases(status, submitted_at desc);
create index if not exists sf_chat_purchases_business_idx on storefront_chat_purchases(business_id, submitted_at desc);

alter table storefront_chat_purchases enable row level security;
drop policy if exists sf_chat_purchases_tenant on storefront_chat_purchases;
create policy sf_chat_purchases_tenant on storefront_chat_purchases
  using (business_id = app.current_business_id());
