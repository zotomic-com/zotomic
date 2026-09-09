-- Telegram bots connected to the Admin Assistant. An admin can add several
-- (different bots and/or different chats). Inbound updates are matched by the
-- X-Telegram-Bot-Api-Secret-Token header to a row, then by chat_id.

create table if not exists admin_telegram_bots (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references users(id) on delete cascade,
  label           text not null,
  bot_token       text not null,               -- AES-encrypted
  bot_username    text,
  chat_id         text not null,
  webhook_secret  text not null,
  enabled         boolean not null default true,
  last_inbound_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists admin_tg_bots_admin_idx on admin_telegram_bots(admin_id);
create unique index if not exists admin_tg_bots_secret_idx on admin_telegram_bots(webhook_secret);

alter table admin_telegram_bots enable row level security;
