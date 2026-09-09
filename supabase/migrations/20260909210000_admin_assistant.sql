-- Admin Assistant ("Zotomic" for the platform admin). A chat assistant the admin
-- talks to in the console or over Telegram. It has NO direct database access —
-- every read and every action goes through a defined tool. Consequential actions
-- are confirmed before they run.

create table if not exists admin_assistant_conversations (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references users(id) on delete cascade,
  channel         text not null default 'web',          -- web | telegram
  title           text,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists admin_asst_conv_admin_idx
  on admin_assistant_conversations(admin_id, last_message_at desc);

create table if not exists admin_assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references admin_assistant_conversations(id) on delete cascade,
  admin_id        uuid not null references users(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  tool_calls      jsonb not null default '[]',
  created_at      timestamptz not null default now()
);
create index if not exists admin_asst_msg_conv_idx
  on admin_assistant_messages(conversation_id, created_at);

-- A single outstanding action awaiting the admin's "yes" (mainly for Telegram,
-- where there is no confirm button). Keyed by 'web:<convId>' or 'tg:<chatId>'.
create table if not exists admin_assistant_pending (
  chat_key   text primary key,
  admin_id   uuid not null references users(id) on delete cascade,
  tool       text not null,
  args       jsonb not null default '{}',
  preview    text not null,
  created_at timestamptz not null default now()
);

-- Admin-only tables — no RLS policy (service-role code only; anon/authed denied).
alter table admin_assistant_conversations enable row level security;
alter table admin_assistant_messages       enable row level security;
alter table admin_assistant_pending        enable row level security;

-- Admin ↔ Telegram link + the inbound-webhook secret.
alter table users add column if not exists telegram_chat_id text;

-- Kill switch for a store owner's Zotomic Assistant (set by the admin assistant).
alter table businesses add column if not exists assistant_suspended        boolean not null default false;
alter table businesses add column if not exists assistant_suspended_reason text;
