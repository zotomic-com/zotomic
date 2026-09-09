-- Storefront Assistant — a per-store shopping chatbot for storefront visitors.
--
-- Answers product / policy questions from the store's OWN catalogue and looks up
-- existing orders. Metered by a monthly conversation quota tied to the store's
-- plan (free 200 / business 2,000 / pro 10,000) plus an optional pool of
-- purchased top-up conversations (campaign spikes). Admin can suspend a store's
-- assistant or top its pool up from the tenant console.

create table if not exists storefront_assistant_config (
  business_id         uuid primary key references businesses(id) on delete cascade,
  enabled             boolean not null default false,
  name                text,                          -- null => "{store name} Assistant"
  greeting            text,                          -- opening line shown in the panel
  suggested_prompts   jsonb  not null default '[]',  -- string[] quick-start chips
  extra_conversations integer not null default 0,    -- purchased top-up pool
  suspended           boolean not null default false,-- admin kill switch
  suspended_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table storefront_assistant_config enable row level security;
drop policy if exists sf_assistant_config_tenant on storefront_assistant_config;
create policy sf_assistant_config_tenant on storefront_assistant_config
  using (business_id = app.current_business_id());

-- Monthly usage counters — one row per store per 'YYYY-MM' (UTC).
create table if not exists storefront_assistant_usage (
  business_id     uuid not null references businesses(id) on delete cascade,
  period          text not null,
  conversations   integer not null default 0,   -- new chats started
  messages        integer not null default 0,   -- visitor messages answered
  blocked         integer not null default 0,   -- requests refused for quota
  extra_spent     integer not null default 0,   -- top-up conversations consumed
  primary key (business_id, period)
);

alter table storefront_assistant_usage enable row level security;
drop policy if exists sf_assistant_usage_tenant on storefront_assistant_usage;
create policy sf_assistant_usage_tenant on storefront_assistant_usage
  using (business_id = app.current_business_id());

-- Conversations held with storefront visitors.
create table if not exists storefront_conversations (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  store_account_id uuid references store_accounts(id) on delete set null,
  visitor_key      text not null,               -- anon cookie id, or "acct:<id>"
  channel          text not null default 'storefront',   -- storefront | account
  title            text,
  message_count    integer not null default 0,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists sf_conv_business_idx on storefront_conversations(business_id, last_message_at desc);
create index if not exists sf_conv_visitor_idx  on storefront_conversations(business_id, visitor_key);

alter table storefront_conversations enable row level security;
drop policy if exists sf_conv_tenant on storefront_conversations;
create policy sf_conv_tenant on storefront_conversations
  using (business_id = app.current_business_id());

create table if not exists storefront_conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references storefront_conversations(id) on delete cascade,
  business_id     uuid not null references businesses(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  tool_calls      jsonb not null default '[]',
  created_at      timestamptz not null default now()
);
create index if not exists sf_conv_msg_conv_idx on storefront_conversation_messages(conversation_id, created_at);

alter table storefront_conversation_messages enable row level security;
drop policy if exists sf_conv_msg_tenant on storefront_conversation_messages;
create policy sf_conv_msg_tenant on storefront_conversation_messages
  using (business_id = app.current_business_id());
