-- Admin-editable pricing cards shown on /pricing and the billing "Upgrade" section.
-- The 3 system cards (free/business/pro) mirror real plan IDs used for billing and
-- feature gating (lib/plans.ts) — they can be edited but never deleted. Admin can
-- also add purely-cosmetic extra cards (e.g. a promo tier) that are fully deletable.

create table if not exists platform_plan_cards (
  id text primary key,
  kind text not null default 'custom' check (kind in ('system', 'custom')),
  name text not null,
  price_bdt integer,
  tagline text not null default '',
  badge text not null default '',
  features jsonb not null default '[]'::jsonb,
  button_text text not null default '',
  button_href text not null default '',
  featured boolean not null default false,
  sort_order int not null default 0,
  enabled boolean not null default true,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
