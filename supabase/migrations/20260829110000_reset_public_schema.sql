-- ════════════════════════════════════════════════════════════════════════════
-- RESET — drop the legacy agency/agent schema and start clean.
-- The pre-rebuild database held only throwaway test data (old vendor/affiliate/
-- content-agent tables). This wipes `public` (and the helper `app` schema) so
-- the P0 core migration builds on a blank slate. Supabase-managed schemas
-- (auth, storage, extensions, supabase_migrations, …) are untouched.
-- ════════════════════════════════════════════════════════════════════════════

drop schema if exists app cascade;
drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables    in schema public to postgres, anon, authenticated, service_role;
grant all on all routines  in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on routines  to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
