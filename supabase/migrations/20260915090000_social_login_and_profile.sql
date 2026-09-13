-- Social login (Google/Facebook) support + phone/address profile fields, and
-- a lightweight inquiries table for the not-yet-real Hosting/Custom Website/
-- Automation dashboard sections.

alter table users add column if not exists phone text;
alter table users add column if not exists address text;
alter table users add column if not exists auth_provider text not null default 'password' check (auth_provider in ('password', 'google', 'facebook'));
alter table users add column if not exists google_id text;
alter table users add column if not exists facebook_id text;
alter table users alter column password_hash drop not null;

create unique index if not exists users_google_id_idx on users(google_id) where google_id is not null;
create unique index if not exists users_facebook_id_idx on users(facebook_id) where facebook_id is not null;

create table if not exists service_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  service text not null check (service in ('hosting', 'custom_website', 'automation')),
  message text not null,
  contact_phone text,
  contact_email text,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);
