-- Admin user management: block flag + notes on users, a login-attempt log
-- (captures IP + user agent — a browser cannot expose a MAC address to a web
-- server, so IP + UA is the identifying signal we can use), and an IP blocklist.

alter table users add column if not exists blocked         boolean not null default false;
alter table users add column if not exists blocked_reason  text;
alter table users add column if not exists notes           text;
alter table users add column if not exists last_ip         text;

create table if not exists user_login_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  email       text,
  ip          text,
  user_agent  text,
  outcome     text not null,   -- success | bad_password | suspended | blocked | ip_blocked | not_found
  created_at  timestamptz not null default now()
);
create index if not exists user_login_events_user_idx on user_login_events(user_id, created_at desc);
create index if not exists user_login_events_ip_idx   on user_login_events(ip, created_at desc);

create table if not exists blocked_ips (
  id          uuid primary key default gen_random_uuid(),
  ip          text not null,        -- exact IP or CIDR (e.g. 203.0.113.0/24)
  reason      text,
  blocked_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists blocked_ips_ip_idx on blocked_ips(lower(ip));

alter table user_login_events enable row level security;
alter table blocked_ips        enable row level security;
