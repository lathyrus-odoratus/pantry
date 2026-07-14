-- Only the backend (service_role, bypasses RLS) touches the DB; the Data API
-- must not expose anything to anon/authenticated. RLS with no policies = deny-all.
ALTER TABLE public.rooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Defense in depth: even a future table that forgets RLS stays unreachable.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
