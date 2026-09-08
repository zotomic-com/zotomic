-- Phase 9E — manual product-card controls (item 19).
--   is_hot      — owner marks a product "Hot" (the one manual badge)
--   hide_badges — owner suppresses all badges on this product's card
-- Sale / New / Best badges stay automatic.

alter table products
  add column if not exists is_hot      boolean not null default false,
  add column if not exists hide_badges boolean not null default false;
