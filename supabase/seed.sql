-- ════════════════════════════════════════════════════════════════════════════
-- ZOTOMIC — local / demo seed  (labelled demo data — never load in production)
-- Loaded automatically by `supabase db reset`.
--   admin  →  admin@zotomic.com     / zotomic-admin-123
--   owner  →  owner@rahmanfashion.com / zotomic-owner-123
-- ════════════════════════════════════════════════════════════════════════════

insert into users (id, name, email, password_hash, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Zotomic Admin', 'admin@zotomic.com',
   '$2b$12$.tjGhOrlprXt3zj4vHt4ZOrLUP26JJXvXXbhCjdoVET/Pianb6NxW', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'Mamun Kabir', 'owner@rahmanfashion.com',
   '$2b$12$lTVMlO9BmVSk/B0w.D5/Au01PamtrYQXZg3plRIJ4kyq72Fh1Couu', 'owner')
on conflict do nothing;

insert into businesses (id, name, slug, type, currency) values
  ('00000000-0000-0000-0000-0000000000c1', 'Rahman Fashion', 'rahman-fashion', 'Fashion & Apparel', 'BDT')
on conflict do nothing;

insert into business_members (business_id, user_id, role, is_default) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'owner', true)
on conflict do nothing;

insert into subscriptions (business_id, plan, status, current_period_start, current_period_end, price) values
  ('00000000-0000-0000-0000-0000000000c1', 'business', 'active', current_date, current_date + 30, 1500)
on conflict do nothing;

insert into storefront_config (business_id, subdomain) values
  ('00000000-0000-0000-0000-0000000000c1', 'rahman-fashion')
on conflict do nothing;

insert into products (business_id, name, slug, status, price, buying_price, marketing_cost, category, stock_qty) values
  ('00000000-0000-0000-0000-0000000000c1', 'Classic T-Shirt', 'classic-t-shirt', 'active', 750, 380, 40, 'T-Shirts', 120),
  ('00000000-0000-0000-0000-0000000000c1', 'Urban Hoodie',    'urban-hoodie',    'active', 1900, 1100, 90, 'Hoodies', 45),
  ('00000000-0000-0000-0000-0000000000c1', 'Cap Collection',  'cap-collection',  'active', 450, 210, 25, 'Accessories', 8),
  ('00000000-0000-0000-0000-0000000000c1', 'Phone Case',      'phone-case',      'active', 350, 150, 20, 'Accessories', 200)
on conflict do nothing;
