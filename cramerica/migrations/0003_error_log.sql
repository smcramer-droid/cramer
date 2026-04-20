-- Persistent error log. Every Opus/vision/API catch block writes here so
-- we can inspect failures without needing live `wrangler tail` output.

CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC);
