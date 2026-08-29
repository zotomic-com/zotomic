-- Platform legal / info pages, editable from the admin console.
create table if not exists platform_pages (
  slug       text primary key,
  title      text not null,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);
alter table platform_pages enable row level security;
-- no policies → service_role (server) only

-- storefront contact-form enquiries are tenant-scoped
alter table contact_messages
  add column if not exists business_id uuid references businesses(id) on delete cascade;
create index if not exists contact_messages_business_idx on contact_messages(business_id, created_at desc);
