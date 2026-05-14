-- Per-user nickname color (client-set via /color command).
-- Stored as canonical `#RRGGBB` uppercase; NULL = use client default.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS color TEXT
  CHECK (color IS NULL OR color ~ '^#[0-9A-F]{6}$');
