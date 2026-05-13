-- Per-room Discord webhook (read-only mirror).
-- webhook_url is the bare Discord webhook URL; webhook_thread_id, when set,
-- targets a specific forum/thread by appending ?thread_id=... on POST.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS webhook_url        text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS webhook_thread_id  text;
