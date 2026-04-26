-- Add unique index on mid to prevent duplicate message processing.
-- mid can be null (for system-generated messages), so use a partial index.
create unique index if not exists messages_mid_unique
  on messages (mid)
  where mid is not null;
