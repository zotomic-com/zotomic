-- Attribute storefront events to a signed-in shopper so the owner can see who
-- abandoned a cart (guests stay anonymous — only a session id). Populated
-- server-side in /api/storefront/events from the zt_store cookie.

alter table storefront_events
  add column if not exists store_account_id uuid references store_accounts(id) on delete set null;

create index if not exists storefront_events_account_idx
  on storefront_events(business_id, store_account_id)
  where store_account_id is not null;
