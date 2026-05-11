-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider  text NOT NULL CHECK (auth_provider IN ('anon','github','google','discord')),
  auth_subject   text NOT NULL,
  nickname       text NOT NULL,
  discriminator  text NOT NULL CHECK (discriminator ~ '^[a-z0-9]{4}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_provider_subject_unique UNIQUE (auth_provider, auth_subject),
  CONSTRAINT users_nick_disc_unique        UNIQUE (nickname, discriminator)
);

-- Messages (author identity snapshotted at insert time)
CREATE TABLE IF NOT EXISTS messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id               uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id),
  author_nickname       text NOT NULL,
  author_discriminator  text NOT NULL,
  body                  text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON messages (room_id, created_at DESC);
