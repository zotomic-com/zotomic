-- Phase 9D — per-tenant Supabase storage estimate for the admin Usage screen.
-- Approximate: row counts on the heavy tables × nominal bytes/row. Cloudinary
-- storage is tracked exactly in media_assets.bytes; Vercel is shared.

create or replace function app.tenant_storage_estimate()
returns table (business_id uuid, est_bytes bigint)
language sql
stable
security definer
as $$
  select b.id,
      coalesce((select count(*) from orders            t where t.business_id = b.id), 0) * 400
    + coalesce((select count(*) from order_items        t where t.business_id = b.id), 0) * 200
    + coalesce((select count(*) from products           t where t.business_id = b.id), 0) * 600
    + coalesce((select count(*) from product_variants   t where t.business_id = b.id), 0) * 300
    + coalesce((select count(*) from customers          t where t.business_id = b.id), 0) * 300
    + coalesce((select count(*) from storefront_events  t where t.business_id = b.id), 0) * 180
    + coalesce((select count(*) from assistant_messages t where t.business_id = b.id), 0) * 700
    + coalesce((select count(*) from reports            t where t.business_id = b.id), 0) * 2000
    + coalesce((select count(*) from credit_ledger      t where t.business_id = b.id), 0) * 160
    + coalesce((select count(*) from audit_logs         t where t.business_id = b.id), 0) * 400
    as est_bytes
  from businesses b;
$$;
