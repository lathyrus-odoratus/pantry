ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_author_nickname text,
  ADD COLUMN IF NOT EXISTS reply_to_author_discriminator text,
  ADD COLUMN IF NOT EXISTS reply_to_body text,
  ADD COLUMN IF NOT EXISTS reply_to_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON messages (reply_to_message_id);
