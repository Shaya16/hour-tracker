-- Hour Tracker schema.
--
-- Records are stored as JSON blobs with two separate timestamps:
--
--   updated_at  the client's logical clock, used only for last-write-wins conflicts
--   server_seq  the server's clock at write time, used only as the pull cursor
--
-- Keeping them apart is what makes an offline device safe. If the pull cursor were the
-- client's own timestamp, a phone that was offline for a week would push edits stamped
-- last Tuesday, the laptop's cursor would already be past that, and those edits would
-- never be delivered. server_seq guarantees anything newly written is newly visible,
-- regardless of what any device thinks the time is.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  salt            TEXT NOT NULL,
  hash            TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_seq ON jobs (user_id, server_seq);

CREATE TABLE IF NOT EXISTS shifts (
  id         TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_shifts_seq ON shifts (user_id, server_seq);

CREATE TABLE IF NOT EXISTS settings (
  user_id    TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_seq INTEGER NOT NULL
);
