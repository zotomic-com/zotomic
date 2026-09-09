-- Notification preferences. One JSONB blob per subject, shaped as
--   { "<event>": { "in_app": bool, "email": bool, "telegram": bool }, ... }
-- A missing event or channel key falls back to the code-defined default.

alter table users          add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
alter table businesses     add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
alter table store_accounts add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- platform-admin notifications aren't tied to a store
alter table notifications alter column business_id drop not null;
