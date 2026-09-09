-- ════════════════════════════════════════════════════════════════════════════
-- Web-search API keys for the admin assistant's web_search tool.
-- Platform-global (not tenant-scoped). Managed from /admin/assistants.
-- Keys are AES-encrypted (lib/auth encrypt/decrypt). Runtime tries enabled
-- keys in sort_order (rotatable fallback).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists search_api_keys (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null check (provider in ('tavily', 'serper', 'brave')),
  label         text,
  api_key       text not null,                       -- AES-encrypted
  enabled       boolean not null default true,
  sort_order    integer not null default 0,
  monthly_limit integer,                             -- known free-tier cap (editable)
  usage_month   text,                                -- 'YYYY-MM' the counter belongs to
  usage_count   integer not null default 0,
  provider_left integer,                             -- provider-reported remaining, when available
  last_used_at  timestamptz,
  last_status   text,                                -- 'ok' or 'error: …' from the most recent call
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists search_api_keys_pick_idx on search_api_keys(enabled, sort_order);

alter table search_api_keys enable row level security;
-- no permissive policy: only the service-role client (getAdminSupabase) touches this.

create trigger search_api_keys_updated before update on search_api_keys
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
