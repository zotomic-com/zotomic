-- ════════════════════════════════════════════════════════════════════════════
-- METRICS — deterministic business metric functions.
-- All numbers shown in the dashboard and computed for reports come from here,
-- never from the model. Called via PostgREST RPC (public schema) with the
-- service role; business_id is always supplied by the tenant-scoped API layer.
-- ════════════════════════════════════════════════════════════════════════════

-- Revenue-bearing orders = everything except cancelled.
-- Returned orders count toward return rate but not revenue.

create or replace function public.metrics_summary(
  p_business uuid,
  p_start    timestamptz,
  p_end      timestamptz
)
returns table (
  revenue           numeric,
  orders_count      integer,
  returned_count    integer,
  units             integer,
  cogs              numeric,
  marketing         numeric,
  costs_complete    boolean,
  estimated_profit  numeric,
  aov               numeric,
  new_customers     integer
)
language sql
stable
as $$
  with scoped as (
    select o.id, o.total, o.status, o.customer_id, o.placed_at
    from orders o
    where o.business_id = p_business
      and o.placed_at >= p_start and o.placed_at < p_end
  ),
  revenue_orders as (
    select * from scoped where status <> 'cancelled'
  ),
  items as (
    select oi.qty, oi.unit_price, oi.buying_price,
           p.marketing_cost,
           (oi.buying_price is null) as missing_cost
    from order_items oi
    join revenue_orders ro on ro.id = oi.order_id
    left join products p on p.id = oi.product_id
  )
  select
    coalesce((select sum(total) from revenue_orders), 0)                            as revenue,
    (select count(*) from revenue_orders)::int                                      as orders_count,
    (select count(*) from scoped where status = 'returned')::int                    as returned_count,
    coalesce((select sum(qty) from items), 0)::int                                  as units,
    coalesce((select sum(qty * coalesce(buying_price,0)) from items), 0)            as cogs,
    coalesce((select sum(qty * coalesce(marketing_cost,0)) from items), 0)          as marketing,
    coalesce((select bool_and(not missing_cost) from items), true)                  as costs_complete,
    case
      when coalesce((select bool_and(not missing_cost) from items), true)
      then coalesce((select sum(total) from revenue_orders),0)
           - coalesce((select sum(qty * coalesce(buying_price,0)) from items),0)
           - coalesce((select sum(qty * coalesce(marketing_cost,0)) from items),0)
      else null
    end                                                                            as estimated_profit,
    case when (select count(*) from revenue_orders) > 0
      then round(coalesce((select sum(total) from revenue_orders),0)
                 / (select count(*) from revenue_orders), 2)
      else 0 end                                                                    as aov,
    (
      select count(*)::int from customers c
      where c.business_id = p_business
        and c.first_order_at >= p_start and c.first_order_at < p_end
    )                                                                              as new_customers;
$$;

create or replace function public.metrics_daily_revenue(
  p_business uuid,
  p_start    timestamptz,
  p_end      timestamptz
)
returns table (day date, revenue numeric, orders_count integer)
language sql
stable
as $$
  select d::date as day,
         coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as revenue,
         count(o.id) filter (where o.status <> 'cancelled')::int          as orders_count
  from generate_series(date_trunc('day', p_start), date_trunc('day', p_end - interval '1 second'), interval '1 day') d
  left join orders o
    on o.business_id = p_business
   and o.placed_at >= d and o.placed_at < d + interval '1 day'
  group by d
  order by d;
$$;

create or replace function public.metrics_sales_by_category(
  p_business uuid,
  p_start    timestamptz,
  p_end      timestamptz
)
returns table (category text, revenue numeric, units integer)
language sql
stable
as $$
  select coalesce(p.category, 'Uncategorised') as category,
         sum(oi.line_total)                    as revenue,
         sum(oi.qty)::int                      as units
  from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'cancelled'
  left join products p on p.id = oi.product_id
  where oi.business_id = p_business
    and o.placed_at >= p_start and o.placed_at < p_end
  group by 1
  order by revenue desc;
$$;

create or replace function public.metrics_top_products(
  p_business uuid,
  p_start    timestamptz,
  p_end      timestamptz,
  p_limit    integer default 5
)
returns table (product_id uuid, name text, units integer, revenue numeric)
language sql
stable
as $$
  select oi.product_id, min(oi.name) as name,
         sum(oi.qty)::int as units, sum(oi.line_total) as revenue
  from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'cancelled'
  where oi.business_id = p_business
    and o.placed_at >= p_start and o.placed_at < p_end
  group by oi.product_id
  order by revenue desc
  limit p_limit;
$$;
