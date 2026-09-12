-- ════════════════════════════════════════════════════════════════════════════
-- Storefront video gallery/carousel — owner-managed YouTube video library.
-- Access + caps ride on the existing businesses.feature_overrides jsonb
-- (feature key "video_gallery", optional numeric "video_gallery_cap") — no new
-- columns on businesses needed.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists storefront_videos (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  url         text not null,             -- raw pasted URL (watch/embed/shorts link)
  video_id    text not null,             -- parsed YouTube video id
  title       text,
  aspect      text not null default '16:9' check (aspect in ('16:9', '9:16', '1:1', '4:5')),
  sort_order  integer not null default 0,
  enabled     boolean not null default true,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists storefront_videos_business_idx on storefront_videos(business_id, sort_order);

alter table storefront_videos enable row level security;
create policy storefront_videos_tenant on storefront_videos
  using (business_id = app.current_business_id());

create trigger storefront_videos_updated before update on storefront_videos
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
