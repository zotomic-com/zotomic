-- ════════════════════════════════════════════════════════════════════════════
-- Telegram bots for the store-owner assistant (Hermes). One row per BotFather
-- bot + the owner's chat with it. Inbound updates hit /api/telegram/owner-webhook
-- and are matched by the X-Telegram-Bot-Api-Secret-Token header, then chat_id.
-- Parallels admin_telegram_bots.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists owner_telegram_bots (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  label           text not null,
  bot_token       text not null,               -- AES-encrypted
  bot_username    text,
  chat_id         text not null,
  webhook_secret  text not null,
  enabled         boolean not null default true,
  last_inbound_at timestamptz,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists owner_tg_bots_business_idx on owner_telegram_bots(business_id);
create unique index if not exists owner_tg_bots_secret_idx on owner_telegram_bots(webhook_secret);

alter table owner_telegram_bots enable row level security;
create policy owner_tg_bots_tenant on owner_telegram_bots
  using (business_id = app.current_business_id());

create trigger owner_tg_bots_updated before update on owner_telegram_bots
  for each row execute function set_updated_at();

-- the owner assistant now has a channel (web vs telegram), like the admin one
alter table assistant_conversations
  add column if not exists channel text not null default 'web';

notify pgrst, 'reload schema';
