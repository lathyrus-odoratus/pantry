-- Allow 'npc' as auth_provider for server-internal virtual participants.
-- NPCs never authenticate from outside; they exist as users-table rows
-- so persisted messages can reference them via the existing foreign key.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_provider_check;
ALTER TABLE users
  ADD CONSTRAINT users_auth_provider_check
  CHECK (auth_provider IN ('anon', 'github', 'google', 'discord', 'npc'));
