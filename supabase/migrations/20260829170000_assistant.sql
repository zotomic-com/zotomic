-- ════════════════════════════════════════════════════════════════════════════
-- ASSISTANT — pending consequential actions awaiting user confirmation.
-- assistant_conversations / assistant_messages / usage_ledger already exist.
-- ════════════════════════════════════════════════════════════════════════════

create table assistant_pending_actions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  business_id     uuid not null references businesses(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  tool_name       text not null,
  args            jsonb not null default '{}',
  preview         text not null,
  status          text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index assistant_pending_business_idx on assistant_pending_actions(business_id, status);

alter table assistant_pending_actions enable row level security;
create policy assistant_pending_tenant on assistant_pending_actions using (business_id = app.current_business_id());

alter table assistant_messages
  add column if not exists tokens integer,
  add column if not exists model text;
