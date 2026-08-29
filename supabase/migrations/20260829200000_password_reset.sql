-- Password reset tokens. Single-use, short-lived.
create table if not exists password_reset_tokens (
  token      text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_user_idx on password_reset_tokens(user_id);

alter table password_reset_tokens enable row level security;
-- service_role only
