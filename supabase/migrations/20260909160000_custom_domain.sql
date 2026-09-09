-- Custom storefront domains (paid plans). A store points its own domain at
-- the platform; middleware resolves the host → the store's subdomain slug.

alter table storefront_config
  add column if not exists custom_domain          text,
  add column if not exists custom_domain_status   text not null default 'none',  -- none | pending | active
  add column if not exists custom_domain_added_at timestamptz;

-- one domain, one store (case-insensitive)
create unique index if not exists storefront_config_custom_domain_uidx
  on storefront_config (lower(custom_domain))
  where custom_domain is not null;
