alter table businesses add column is_featured boolean not null default false;

create table platform_social_links (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null check (platform in ('facebook','instagram','x','linkedin','youtube','whatsapp','tiktok','other')),
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table platform_contact_numbers (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('phone','whatsapp')),
  label      text not null,
  number     text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
