-- Per-user admin flag. The Discord-authenticated TUI uses `--admin` to enter
-- the admin scene; the backend gates that scene on users.is_admin = true.
-- The service_role CLI (`pnpm admin ...`) is "root" and not subject to this
-- flag — it's what we use to bootstrap the first admin.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin;
