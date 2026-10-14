-- Baseline schema, consolidated from the former supabase/migrations/* when the
-- backend moved off Supabase to a plain Postgres. Only the backend connects to
-- the database (it is not exposed to the internet), so there is no RLS.

CREATE TABLE rooms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  webhook_url       text,
  webhook_thread_id text,
  closed_at         timestamptz
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider text NOT NULL CHECK (auth_provider IN ('anon', 'github', 'google', 'discord', 'npc')),
  auth_subject  text NOT NULL,
  nickname      text NOT NULL,
  discriminator text NOT NULL CHECK (discriminator ~ '^[a-z0-9]{4}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  color         text CHECK (color IS NULL OR color ~ '^#[0-9A-F]{6}$'),
  is_admin      boolean NOT NULL DEFAULT false,
  CONSTRAINT users_provider_subject_unique UNIQUE (auth_provider, auth_subject),
  CONSTRAINT users_nick_disc_unique UNIQUE (nickname, discriminator)
);

CREATE INDEX idx_users_is_admin ON users (is_admin) WHERE is_admin;

CREATE TABLE messages (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                       uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  user_id                       uuid NOT NULL REFERENCES users (id),
  author_nickname               text NOT NULL,
  author_discriminator          text NOT NULL,
  body                          text NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  reply_to_message_id           uuid REFERENCES messages (id) ON DELETE SET NULL,
  reply_to_author_nickname      text,
  reply_to_author_discriminator text,
  reply_to_body                 text,
  reply_to_created_at           timestamptz
);

CREATE INDEX idx_messages_room_created ON messages (room_id, created_at DESC);
CREATE INDEX idx_messages_reply_to ON messages (reply_to_message_id);
