-- 033: Table privileges for the Supabase Data API roles.
-- Newer Supabase projects do not auto-grant new public tables to API roles.
-- Without these grants the app shows "permission denied for table ..." and
-- Edge Functions (service_role) return "non-2xx status code".
-- GRANTs do NOT bypass RLS: authenticated users still only see rows allowed
-- by the policies in 003 / 029 / 031.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Edge Functions use the service role.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Logged-in app users: RLS decides which rows they can touch.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Anonymous visitors get nothing.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Same rules for tables/sequences created by later migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
