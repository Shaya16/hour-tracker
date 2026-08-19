-- Invoice / payment tracking.
--
-- Same shape as jobs and shifts: a JSON blob plus the two timestamps the sync protocol
-- needs (client clock for conflict resolution, server clock for the pull cursor).

CREATE TABLE IF NOT EXISTS invoices (
  id         TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_seq ON invoices (user_id, server_seq);
