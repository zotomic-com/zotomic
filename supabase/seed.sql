-- ════════════════════════════════════════════════════════════════════════════
-- ZOTOMIC — local / demo seed  (labelled demo data — never load in production)
-- Loaded via `supabase db push --include-seed` or `supabase db reset`.
--   admin  →  admin@zotomic.com       / zotomic-admin-123
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

insert into products (id, business_id, name, slug, status, price, buying_price, marketing_cost, category, stock_qty) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000c1', 'Classic T-Shirt', 'classic-t-shirt', 'active', 750, 380, 40, 'T-Shirts', 120),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000c1', 'Urban Hoodie',    'urban-hoodie',    'active', 1900, 1100, 90, 'Hoodies', 45),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-0000000000c1', 'Cap Collection',  'cap-collection',  'active', 450, 210, 25, 'Accessories', 8),
  ('00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-0000000000c1', 'Phone Case',      'phone-case',      'active', 350, 150, 20, 'Accessories', 200)
on conflict do nothing;

-- ── synthetic customers + orders (deterministic, seeded RNG) ────────────────
do $$
declare
  bid uuid := '00000000-0000-0000-0000-0000000000c1';
  prod record;
  prods uuid[];
  prices numeric[];
  buys numeric[];
  cust uuid;
  cust_ids uuid[] := '{}';
  i int; j int; n_items int; pidx int;
  o_id uuid; o_placed timestamptz; o_sub numeric; o_ship numeric; o_total numeric;
  o_status text; o_pay text; qty int;
  statuses text[] := array['delivered','delivered','delivered','delivered','shipped','processing','confirmed','returned','cancelled'];
begin
  if exists (select 1 from orders where business_id = bid) then return; end if;

  perform setseed(0.4242);

  select array_agg(id order by created_at), array_agg(price order by created_at), array_agg(buying_price order by created_at)
    into prods, prices, buys
  from products where business_id = bid;

  -- 40 customers
  for i in 1..40 loop
    cust := gen_random_uuid();
    insert into customers (id, business_id, name, phone, email, city)
    values (cust, bid, 'Customer ' || i, '+88017' || lpad(i::text, 8, '0'),
            'customer' || i || '@example.com',
            (array['Dhaka','Chattogram','Sylhet','Khulna','Rajshahi'])[1 + (random()*4)::int]);
    cust_ids := cust_ids || cust;
  end loop;

  -- ~230 orders across the last 28 days
  for i in 1..230 loop
    o_id := gen_random_uuid();
    o_placed := now() - (random() * interval '28 days');
    o_status := statuses[1 + floor(random() * array_length(statuses,1))::int];
    o_pay := case when random() < 0.75 then 'cod' else 'bkash' end;
    cust := cust_ids[1 + floor(random() * array_length(cust_ids,1))::int];

    o_sub := 0;
    n_items := 1 + floor(random() * 3)::int;

    insert into orders (id, business_id, order_number, customer_id, channel, status, payment_method,
                        payment_status, subtotal, shipping, discount, total, currency, placed_at,
                        delivered_at, created_at)
    values (o_id, bid, 'ZF-' || lpad((8000 + i)::text, 4, '0'), cust, 'storefront', o_status, o_pay,
            case when o_status in ('delivered') or o_pay = 'bkash' then 'paid' else 'unpaid' end,
            0, 60, 0, 0, 'BDT', o_placed,
            case when o_status = 'delivered' then o_placed + interval '3 days' end, o_placed);

    for j in 1..n_items loop
      pidx := 1 + floor(random() * array_length(prods,1))::int;
      qty := 1 + floor(random() * 2)::int;
      o_sub := o_sub + prices[pidx] * qty;
      insert into order_items (order_id, business_id, product_id, name, qty, unit_price, buying_price, line_total)
      select o_id, bid, prods[pidx], p.name, qty, prices[pidx], buys[pidx], prices[pidx] * qty
      from products p where p.id = prods[pidx];
    end loop;

    o_total := o_sub + 60;
    update orders set subtotal = o_sub, total = o_total where id = o_id;
  end loop;

  -- refresh customer rollups
  update customers c set
    total_orders = s.cnt, total_spent = s.spent,
    first_order_at = s.first_at, last_order_at = s.last_at
  from (
    select customer_id, count(*) cnt, sum(total) spent, min(placed_at) first_at, max(placed_at) last_at
    from orders where business_id = bid group by customer_id
  ) s
  where c.id = s.customer_id;
end $$;
