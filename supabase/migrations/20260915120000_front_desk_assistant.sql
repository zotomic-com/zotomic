-- Front Desk assistant conversations — public, zotomic.com-facing chat for
-- domain suggestions and platform-service questions. No RLS: service-role
-- access only, same pattern as domain_cart_orders.

create table front_desk_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_key text not null,               -- anon cookie id, or "user:<userId>" once logged in
  user_id uuid references users(id) on delete set null,
  message_count integer not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index front_desk_conv_visitor_idx on front_desk_conversations(visitor_key);

create table front_desk_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references front_desk_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index front_desk_msg_conv_idx on front_desk_messages(conversation_id, created_at);
