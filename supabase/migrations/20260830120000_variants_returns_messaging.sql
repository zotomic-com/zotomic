-- ════════════════════════════════════════════════════════════════════════════
-- Product variants · inventory adjustments · returns · per-store messaging
--   (Facebook Messenger / WhatsApp / Instagram inbound)
--
-- All tenant-scoped tables get the standard RLS policy
-- (business_id = app.current_business_id()); the app also scopes every query
-- through the service-role client + lib/tenant helpers.
-- ════════════════════════════════════════════════════════════════════════════

-- ── product options + variants ─────────────────────────────────────────────
alter table products
  add column if not exists options      jsonb   not null default '[]',   -- [{ "name": "Color", "values": ["Red","Blue"] }]
  add column if not exists has_variants boolean not null default false;

create table if not exists product_variants (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  name         text not null,                       -- "Red / L"
  sku          text,
  options      jsonb not null default '{}',         -- { "Color": "Red", "Size": "L" }
  price        numeric(14,2),                       -- null → inherit products.price
  sale_price   numeric(14,2),
  buying_price numeric(14,2),
  stock_qty    integer not null default 0,
  image_url    text,
  position     integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists product_variants_business_idx on product_variants(business_id);
create index if not exists product_variants_product_idx  on product_variants(product_id, position);

alter table product_variants enable row level security;
create policy product_variants_tenant on product_variants
  using (business_id = app.current_business_id());
create trigger product_variants_updated before update on product_variants
  for each row execute function set_updated_at();

-- order lines can point at a specific variant
alter table order_items
  add column if not exists variant_id    uuid references product_variants(id) on delete set null,
  add column if not exists variant_label text;

-- ── inventory adjustments (audit trail for every stock change) ──────────────
create table if not exists inventory_adjustments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  variant_id  uuid references product_variants(id) on delete set null,
  delta       integer not null,                     -- +restock / −damage etc.
  balance     integer,                              -- resulting stock (snapshot)
  reason      text not null default 'correction'
              check (reason in ('recount','restock','damage','theft','correction','sale','return','other')),
  note        text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists inventory_adjustments_business_idx
  on inventory_adjustments(business_id, created_at desc);
create index if not exists inventory_adjustments_product_idx
  on inventory_adjustments(product_id, created_at desc);

alter table inventory_adjustments enable row level security;
create policy inventory_adjustments_tenant on inventory_adjustments
  using (business_id = app.current_business_id());

-- ── returns / RMA ──────────────────────────────────────────────────────────
create table if not exists returns (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  order_id       uuid not null references orders(id) on delete cascade,
  return_number  text not null,
  status         text not null default 'requested'
                 check (status in ('requested','approved','received','refunded','rejected','cancelled')),
  reason         text,
  refund_amount  numeric(14,2) not null default 0,
  refund_method  text,
  restock        boolean not null default true,
  note           text,
  created_by     uuid references users(id) on delete set null,
  processed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id, return_number)
);
create index if not exists returns_business_idx on returns(business_id, created_at desc);
create index if not exists returns_order_idx    on returns(order_id);

alter table returns enable row level security;
create policy returns_tenant on returns
  using (business_id = app.current_business_id());
create trigger returns_updated before update on returns
  for each row execute function set_updated_at();

create table if not exists return_items (
  id            uuid primary key default gen_random_uuid(),
  return_id     uuid not null references returns(id) on delete cascade,
  business_id   uuid not null references businesses(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  product_id    uuid references products(id) on delete set null,
  variant_id    uuid references product_variants(id) on delete set null,
  name          text not null,
  qty           integer not null default 1,
  unit_price    numeric(14,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists return_items_return_idx on return_items(return_id);

alter table return_items enable row level security;
create policy return_items_tenant on return_items
  using (business_id = app.current_business_id());

-- ── per-store messaging channels (Messenger / WhatsApp / Instagram) ─────────
-- credentials_encrypted holds an AES-256-CBC JSON blob of the OWNER's own
-- Meta credentials: { page_access_token, app_secret, ... }.
create table if not exists messaging_channels (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references businesses(id) on delete cascade,
  provider              text not null check (provider in ('messenger','whatsapp','instagram')),
  external_id           text,                         -- Page ID / WhatsApp phone-number ID
  display_name          text,
  verify_token          text not null,                -- webhook handshake secret (per store)
  credentials_encrypted text,
  status                text not null default 'pending'
                        check (status in ('pending','connected','error','disconnected')),
  last_event_at         timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (business_id, provider)
);
create index if not exists messaging_channels_business_idx on messaging_channels(business_id);
create index if not exists messaging_channels_verify_idx    on messaging_channels(verify_token);

alter table messaging_channels enable row level security;
create policy messaging_channels_tenant on messaging_channels
  using (business_id = app.current_business_id());
create trigger messaging_channels_updated before update on messaging_channels
  for each row execute function set_updated_at();

create table if not exists messaging_messages (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references businesses(id) on delete cascade,
  channel_id          uuid references messaging_channels(id) on delete set null,
  provider            text not null,
  direction           text not null default 'in' check (direction in ('in','out')),
  external_message_id text,
  thread_key          text,                           -- sender id / phone — groups a conversation
  sender_name         text,
  body                text,
  attachments         jsonb not null default '[]',
  raw                 jsonb,
  read_at             timestamptz,
  received_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists messaging_messages_business_idx
  on messaging_messages(business_id, received_at desc);
create index if not exists messaging_messages_thread_idx
  on messaging_messages(business_id, provider, thread_key, received_at);

alter table messaging_messages enable row level security;
create policy messaging_messages_tenant on messaging_messages
  using (business_id = app.current_business_id());
