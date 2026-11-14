-- ════════════════════════════════════════════════════════════════════════════
-- Service tools (Text to Audio + Online Downloader)
--
-- service_tokens : platform-issued API tokens for users (admins create/edit/
--                  delete them; users can only see + use their own tokens).
-- service_access : per-user access control per service. 'plan' follows the
--                  subscription plan defaults, 'allow' grants explicitly
--                  (with optional custom limit), 'block' denies.
-- service_usage  : append-only usage log; powers admin usage view and the
--                  per-day quota counters (count rows for "today").
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists service_tokens (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,                -- plain token (users must be able to copy it)
  prefix        text not null,                       -- first 12 chars, for display lists
  label         text,
  user_email    text not null,                       -- platform user who may use it
  services      text not null default 'both'
                  check (services in ('downloader', 'text_to_audio', 'both')),
  status        text not null default 'active'
                  check (status in ('active', 'revoked')),
  daily_limit   integer,                             -- overrides plan default when set
  expires_at    timestamptz,
  usage_count   integer not null default 0,
  last_used_at  timestamptz,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists service_tokens_user_idx on service_tokens(user_email);

alter table service_tokens enable row level security;
-- no permissive policy: only the service-role client (getAdminSupabase) touches this.

create trigger service_tokens_updated before update on service_tokens
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────

create table if not exists service_access (
  id            uuid primary key default gen_random_uuid(),
  user_email    text not null,
  service       text not null check (service in ('downloader', 'text_to_audio')),
  mode          text not null default 'plan'
                  check (mode in ('plan', 'allow', 'block')),
  daily_limit   integer,                             -- custom limit for 'allow'
  max_quality   text,                                -- '720', '1080' … null = no cap
  note          text,
  updated_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_email, service)
);
create index if not exists service_access_user_idx on service_access(user_email);

alter table service_access enable row level security;
-- service-role only.

create trigger service_access_updated before update on service_access
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────

create table if not exists service_usage (
  id            uuid primary key default gen_random_uuid(),
  service       text not null check (service in ('downloader', 'text_to_audio')),
  action        text not null,                       -- info | download_start | file | tts
  user_email    text,                                -- null = anonymous (blocked attempt)
  token_id      uuid references service_tokens(id) on delete set null,
  ip            text,
  ok            boolean not null default true,       -- false = rejected (quota/blocked/rate)
  reason        text,                                -- why rejected, when ok = false
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists service_usage_recent_idx on service_usage(created_at desc);
create index if not exists service_usage_user_day_idx on service_usage(user_email, service, created_at);
create index if not exists service_usage_token_day_idx on service_usage(token_id, service, created_at);

alter table service_usage enable row level security;
-- service-role only.

notify pgrst, 'reload schema';
