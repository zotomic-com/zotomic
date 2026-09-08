-- Phase 9B — plan limits & grandfathering.
--
-- New caps: free 10 products / 3 images / 1 hero image; paid 100 / 5 / 3.
-- Stores that existed before this change are grandfathered: their data is never
-- hidden or archived, but the product cap still blocks *adding* past it (they
-- upgrade or prune to add more). The flag drives messaging + admin visibility.

alter table businesses
  add column if not exists limits_grandfathered_at timestamptz;

-- Every business that exists right now signed up under the old, looser limits.
update businesses
  set limits_grandfathered_at = now()
  where limits_grandfathered_at is null;

comment on column businesses.limits_grandfathered_at is
  'Set when the store predates the Phase 9B plan-limit tightening. Existing products/images are kept; add-limits still apply.';
