-- Website CMS: unify all zotomic.com marketing-site content under one admin surface.

-- 1. Extend platform_pages (previously: legal pages only) to also hold
--    structural page content (jsonb) and support brand-new custom pages.
alter table platform_pages
  add column if not exists kind text not null default 'custom' check (kind in ('structural', 'custom')),
  add column if not exists status text not null default 'published' check (status in ('draft', 'published')),
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists content jsonb not null default '{}'::jsonb,
  add column if not exists show_in_nav boolean not null default false,
  add column if not exists nav_label text,
  add column if not exists created_at timestamptz not null default now();

-- existing legal/FAQ rows (and any not-yet-inserted defaults) are 'custom', published
update platform_pages set kind = 'custom', status = 'published' where kind is null;

-- 2. Header + footer navigation links (replaces hardcoded MARKETING_NAV + footer COLS).
create table if not exists platform_nav_links (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('header', 'footer')),
  section text not null default 'primary',
  label text not null,
  href text not null,
  icon text,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists platform_nav_links_loc_idx on platform_nav_links (location, section, sort_order);

-- 3. Store registration categories (replaces hardcoded TYPES in onboarding).
create table if not exists platform_business_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed nav links (header) — only if the table is empty, so this migration is idempotent.
insert into platform_nav_links (location, section, label, href, icon, sort_order)
select * from (values
  ('header', 'primary', 'Home', '/', 'Home', 0),
  ('header', 'primary', 'Intelligence', '/intelligence', 'BarChart3', 1),
  ('header', 'primary', 'Assistant', '/assistant', 'MessageSquareText', 2),
  ('header', 'primary', 'Storefront', '/storefront', 'Store', 3),
  ('header', 'primary', 'Pricing', '/pricing', 'Tag', 4),
  ('header', 'secondary', 'About', '/about', 'Info', 5),
  ('header', 'secondary', 'Contact', '/contact', 'Mail', 6),
  ('header', 'secondary', 'Help', '/help', 'HelpCircle', 7),
  ('footer', 'product', 'Intelligence', '/intelligence', null, 0),
  ('footer', 'product', 'Assistant', '/assistant', null, 1),
  ('footer', 'product', 'Storefront', '/storefront', null, 2),
  ('footer', 'product', 'Pricing', '/pricing', null, 3),
  ('footer', 'product', 'How it works', '/how-it-works', null, 4),
  ('footer', 'company', 'About', '/about', null, 0),
  ('footer', 'company', 'Contact', '/contact', null, 1),
  ('footer', 'company', 'Help', '/help', null, 2),
  ('footer', 'company', 'FAQ', '/faq', null, 3),
  ('footer', 'legal', 'Privacy', '/privacy-policy', null, 0),
  ('footer', 'legal', 'Terms', '/terms', null, 1),
  ('footer', 'legal', 'Refund policy', '/refund-policy', null, 2),
  ('footer', 'legal', 'Data deletion', '/data-deletion', null, 3)
) as v(location, section, label, href, icon, sort_order)
where not exists (select 1 from platform_nav_links);

-- Seed business categories — only if the table is empty.
insert into platform_business_categories (label, sort_order)
select * from (values
  ('Fashion & Apparel', 0),
  ('Electronics & Gadgets', 1),
  ('Food & Grocery', 2),
  ('Health & Beauty', 3),
  ('Home & Living', 4),
  ('Handmade & Crafts', 5),
  ('Services', 6),
  ('Other', 7)
) as v(label, sort_order)
where not exists (select 1 from platform_business_categories);
