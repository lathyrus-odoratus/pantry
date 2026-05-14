-- Rooms can be "closed": history preserved, but no new connections accepted.
-- Existing in-flight WS connections are NOT torn down (close is a soft gate at
-- auth time, not a hard kill). Reopen by setting closed_at back to NULL.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
