-- Storefront Assistant training — the store owner "teaches" their assistant:
--   persona / rules        free text appended to the system prompt
--   knowledge base         owner-written Q&A the assistant treats as ground truth
--   promoted_product_ids   products the assistant should actively suggest
--   signals                which live signals it may surface (best-seller / sale /
--                          campaign / hot) — both proactively and on request
--   products.assistant_note per-product talking points, used only for that product

alter table storefront_assistant_config
  add column if not exists persona              text,
  add column if not exists promoted_product_ids jsonb not null default '[]'::jsonb,
  add column if not exists signals              jsonb not null
    default '{"bestseller":true,"sale":true,"campaign":true,"hot":true}'::jsonb;

create table if not exists storefront_assistant_knowledge (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  question    text not null,
  answer      text not null,
  enabled     boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sf_assistant_knowledge_biz_idx
  on storefront_assistant_knowledge(business_id, sort, created_at);

alter table storefront_assistant_knowledge enable row level security;
drop policy if exists sf_assistant_knowledge_tenant on storefront_assistant_knowledge;
create policy sf_assistant_knowledge_tenant on storefront_assistant_knowledge
  using (business_id = app.current_business_id());

alter table products add column if not exists assistant_note text;
