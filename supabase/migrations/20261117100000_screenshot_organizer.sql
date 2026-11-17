-- ════════════════════════════════════════════════════════════════════════════
-- Screenshot Organizer service
--
-- screenshot_sessions : one organizing job (24h retention, then purged).
-- screenshot_groups   : named folders inside a session.
-- screenshot_items    : one screenshot + Hermes analysis + recovered links.
--                       The ORIGINAL image never leaves the user's device —
--                       only a small thumbnail + extracted text are stored.
--
-- Also: widen the service_* CHECK constraints for the new service and add
-- the public service card.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists screenshot_sessions (
  id          uuid primary key default gen_random_uuid(),
  owner_email text,                                  -- null for guests (owner_ip is set)
  owner_ip    text,
  title       text not null default 'Screenshots',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);
create index if not exists screenshot_sessions_owner_idx on screenshot_sessions(owner_email);
create index if not exists screenshot_sessions_expiry_idx on screenshot_sessions(expires_at);

create table if not exists screenshot_groups (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references screenshot_sessions(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, name)
);
create index if not exists screenshot_groups_session_idx on screenshot_groups(session_id);

create table if not exists screenshot_items (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references screenshot_sessions(id) on delete cascade,
  group_id        uuid references screenshot_groups(id) on delete set null,
  name            text not null,                     -- editable display name
  details         text not null default '',          -- user's "why I took this" note
  user_link       text not null default '',          -- link the user provided
  thumb           text not null default '',          -- small dataURL (≤ ~40KB) for the grid
  analysis        jsonb not null default '{}',       -- Hermes/Gemini extraction
  recovered_links jsonb not null default '[]',       -- verified / probable / suggestion
  status          text not null default 'ready'
                    check (status in ('pending', 'ready', 'error')),
  error           text,
  created_at      timestamptz not null default now()
);
create index if not exists screenshot_items_session_idx on screenshot_items(session_id);
create index if not exists screenshot_items_group_idx on screenshot_items(group_id);

alter table screenshot_sessions enable row level security;
alter table screenshot_groups enable row level security;
alter table screenshot_items enable row level security;
-- no permissive policies: only the service-role client touches these.

-- widen the service_* constraints for the new service
ALTER TABLE service_tokens
  DROP CONSTRAINT IF EXISTS service_tokens_services_check;
ALTER TABLE service_tokens
  ADD CONSTRAINT service_tokens_services_check
  CHECK (services IN ('downloader', 'text_to_audio', 'both', 'video_generator', 'screenshot_organizer', 'all'));

ALTER TABLE service_access
  DROP CONSTRAINT IF EXISTS service_access_service_check;
ALTER TABLE service_access
  ADD CONSTRAINT service_access_service_check
  CHECK (service IN ('downloader', 'text_to_audio', 'video_generator', 'screenshot_organizer'));

ALTER TABLE service_usage
  DROP CONSTRAINT IF EXISTS service_usage_service_check;
ALTER TABLE service_usage
  ADD CONSTRAINT service_usage_service_check
  CHECK (service IN ('downloader', 'text_to_audio', 'video_generator', 'screenshot_organizer'));

-- public service card
INSERT INTO platform_service_cards (title, description, icon, status, href, sort_order, enabled)
SELECT 'Screenshot Organizer',
       'Drop your screenshots or connect your screenshots folder — Zotomic AI reads each one, extracts the key info, recovers hidden links and organizes everything into named groups with a copyable links file.',
       'Camera',
       'live',
       '/services/screenshot-organizer',
       COALESCE((SELECT MAX(sort_order) + 1 FROM platform_service_cards), 1),
       true
WHERE NOT EXISTS (SELECT 1 FROM platform_service_cards WHERE title = 'Screenshot Organizer');

notify pgrst, 'reload schema';
