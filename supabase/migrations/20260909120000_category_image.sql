-- Storefront theme overhaul — optional image on a product category so the
-- storefront can render photo-chips ("Shop by category") like the mockups.

alter table product_categories
  add column if not exists image_url text;
