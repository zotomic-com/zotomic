-- ════════════════════════════════════════════════════════════════════════════
-- Admin-assistant connectors (external services) + Zotomic-as-MCP tokens +
-- skills (saved playbooks). Platform-global, admin-managed. Secrets AES-encrypted.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists admin_connectors (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('slack', 'notion', 'sentry', 'google')),
  label        text,
  secret       text,                       -- AES-encrypted token / refresh token
  config       jsonb not null default '{}'::jsonb,
  meta         jsonb,                       -- team name, workspace name, etc.
  enabled      boolean not null default true,
  status       text,                        -- 'ok' | 'error: …' from the last check
  last_used_at timestamptz,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (provider, label)
);
alter table admin_connectors enable row level security;
create trigger admin_connectors_updated before update on admin_connectors
  for each row execute function set_updated_at();

-- tokens that let the admin drive Zotomic's tools from an MCP client
create table if not exists admin_mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  token_hash   text not null unique,        -- sha256(token); token shown once
  scopes       text[] not null default '{}'::text[],  -- 'read' and/or 'write'
  enabled      boolean not null default true,
  last_used_at timestamptz,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table admin_mcp_tokens enable row level security;

-- saved playbooks: a starter library (builtin) + the admin's own
create table if not exists admin_assistant_skills (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  triggers     text[] not null default '{}'::text[],
  instructions text not null,
  builtin      boolean not null default false,
  enabled      boolean not null default true,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table admin_assistant_skills enable row level security;
create trigger admin_skills_updated before update on admin_assistant_skills
  for each row execute function set_updated_at();

-- ── starter skill library ───────────────────────────────────────────────────
insert into admin_assistant_skills (slug, name, triggers, instructions, builtin) values
(
  'platform-digest',
  'Platform digest',
  array['platform digest', 'weekly digest', 'how is the platform', 'platform summary'],
  'Produce a tight platform status digest. Steps: 1) call platform_overview. 2) call pending_payments. 3) call flagged_activity. 4) call fraud_list (stage 2+). '
  || 'Write it as: a one-line headline, then sections "Money" (revenue, pending payments), "Stores" (count by plan, anything suspended), "Risk" (fraud stage 2/3, held orders), "Needs you" (a short bullet list of decisions). '
  || 'Quote every figure exactly from the tools. If a Slack connector is on and the admin asked to post it, ask which channel, then slack_post_message.',
  true
),
(
  'store-health-check',
  'Store health check',
  array['health check', 'check on store', 'how is store', 'store health'],
  'Deep-dive one store the admin names. Steps: store_detail, store_inventory (flag low/out), store_orders (last 14 days — cancellations, unfulfilled), store_returns, store_reviews (unmoderated, low ratings), get_store_assistant_config, store_abandoned_carts. '
  || 'Summarise: fulfilment health, stock risks, customer sentiment, assistant status. End with "Suggested actions" — 3 concrete things, each tied to a tool the admin could ask you to run.',
  true
),
(
  'incident-triage',
  'Incident triage',
  array['incident', 'something is broken', 'triage', 'outage'],
  'Help the admin work an incident. Steps: 1) if a Sentry connector is on, sentry_issues (last 24h, unresolved) and summarise the top errors. 2) ask what the admin is seeing. 3) if it points at code, use repo_search_code / repo_read_file to locate it. '
  || '4) propose a fix as a git_open_pr (small, explained) — do NOT merge. 5) if a Slack connector is on, offer to post a short status to a channel. Never run_sql or trigger_deploy unless the admin explicitly tells you to.',
  true
),
(
  'fraud-sweep',
  'Fraud sweep report',
  array['fraud sweep', 'fraud report', 'run a fraud check'],
  'Steps: run_fraud_scan, then fraud_list. For each flag at stage 2+, fraud_detail. Write a report: who is flagged, stage, why, how many recent orders, which stores. '
  || 'End with a recommendation per person (raise/lower stage, clear, or leave) — the admin decides; call set_fraud_stage only when they say so.',
  true
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
