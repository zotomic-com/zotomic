-- Converter library for AI-written converter definitions.
-- Run once in the Supabase SQL editor.
-- Access is service-role only (RLS stays closed; the site uses SUPABASE_SERVICE_ROLE_KEY).

create table if not exists conv_library (
  id uuid primary key default gen_random_uuid(),
  convType text not null unique,
  keywords text[] not null default '{}',
  definition jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  checks jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

create index if not exists conv_library_status_idx on conv_library (status);

alter table conv_library enable row level security;
-- no policies: service role bypasses RLS; nobody else reads/writes directly.