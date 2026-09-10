-- ════════════════════════════════════════════════════════════════════════════
-- Admin-assistant powers: capability grants + an audit trail for the
-- file-workspace / git / SQL / deploy tools. Platform-global, admin-only.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists admin_assistant_settings (
  id            integer primary key default 1 check (id = 1),
  cap_media     boolean not null default true,    -- image / voice / video understanding
  cap_files     boolean not null default false,   -- read / write the shared workspace
  cap_git       boolean not null default false,   -- open branch + PR
  cap_git_merge boolean not null default false,   -- also merge a PR (→ prod deploy)
  cap_sql       boolean not null default false,   -- run SQL migrations
  cap_deploy    boolean not null default false,   -- trigger a Vercel deploy
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null
);
insert into admin_assistant_settings (id) values (1) on conflict (id) do nothing;

alter table admin_assistant_settings enable row level security;
-- service-role only (getAdminSupabase); no permissive policy.

create table if not exists admin_assistant_actions (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references users(id) on delete set null,
  kind       text not null,   -- file_write | file_delete | git_pr | git_merge | sql | deploy | media
  summary    text not null,
  detail     jsonb,
  outcome    text not null default 'ok',
  created_at timestamptz not null default now()
);
create index if not exists admin_assistant_actions_idx on admin_assistant_actions(created_at desc);

alter table admin_assistant_actions enable row level security;

notify pgrst, 'reload schema';
