create table platform_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  image_url text not null,
  project_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table webdev_pricing_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_bdt numeric(14,2),
  tagline text not null default '',
  badge text not null default '',
  features jsonb not null default '[]',
  button_text text not null default 'Get a quote',
  button_href text not null default '/web-development#inquiry',
  featured boolean not null default false,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
