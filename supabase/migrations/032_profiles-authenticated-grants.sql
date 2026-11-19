-- Profiles access grants. These SQL grants do not bypass RLS.
-- Authenticated users may SELECT profiles only where an existing RLS policy allows it.
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Keep the public/anonymous role unable to access profile rows.
REVOKE ALL ON TABLE public.profiles FROM anon;
