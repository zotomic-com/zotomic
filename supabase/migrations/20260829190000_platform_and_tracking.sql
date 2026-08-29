-- ════════════════════════════════════════════════════════════════════════════
-- PLATFORM SETTINGS + TRACKING
--   platform_settings — admin-only key/value (Telegram bot token, GA4 server-
--     side creds, Meta Pixel for the Zotomic marketing site). Not exposed via
--     PostgREST directly (RLS: service_role only).
--   businesses.telegram_chat_id — where a store owner wants reports delivered.
--   storefront_config tracking — per-store Meta Pixel id lives in the JSON
--     config already; nothing to migrate there.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists platform_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

alter table platform_settings enable row level security;
-- no policies → only service_role (server) can read/write

alter table businesses
  add column if not exists telegram_chat_id text;

-- track outbound report deliveries (telegram / email-from-assistant) for the
-- assistant tools + admin visibility
create table if not exists report_deliveries (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  report_id   uuid references reports(id) on delete set null,
  channel     text not null check (channel in ('telegram','email')),
  target      text,
  ok          boolean not null default false,
  error       text,
  created_at  timestamptz not null default now()
);
create index report_deliveries_business_idx on report_deliveries(business_id, created_at desc);

alter table report_deliveries enable row level security;
create policy report_deliveries_tenant on report_deliveries using (business_id = app.current_business_id());
