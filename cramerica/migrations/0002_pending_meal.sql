-- Transient storage for meal photos that needed a clarifying question.
-- The next text reply resolves + clears the row. 30-minute TTL enforced
-- in code when reading.

CREATE TABLE IF NOT EXISTS pending_meal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT,
  dish_description TEXT,
  estimated_calories INTEGER,
  estimated_protein_g INTEGER,
  clarifying_question TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pending_meal_created ON pending_meal(created_at DESC);
