-- Cramerica initial schema
-- All dates are YYYY-MM-DD in America/New_York (ET).

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  chat_id INTEGER,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  wife_name TEXT NOT NULL DEFAULT 'Nicole',
  kids_json TEXT NOT NULL DEFAULT '[{"name":"Olive","age":15},{"name":"Truman","age":13},{"name":"August","age":11},{"name":"Jensen","age":8}]',
  weight_lbs REAL,
  body_fat_pct REAL,
  age INTEGER,
  height_in REAL,
  handicap REAL,
  target_date TEXT NOT NULL DEFAULT '2026-06-12',
  target_bf_pct REAL NOT NULL DEFAULT 15.0,
  protein_goal_g INTEGER NOT NULL DEFAULT 200,
  calorie_cap INTEGER NOT NULL DEFAULT 1800,
  cardio_goal_min INTEGER NOT NULL DEFAULT 30,
  pliability_goal_min INTEGER NOT NULL DEFAULT 10,
  assessment_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO profile (id) VALUES (1);

-- One row per ET day. Totals update as user logs throughout the day.
CREATE TABLE IF NOT EXISTS daily_log (
  date TEXT PRIMARY KEY,
  protein_g INTEGER NOT NULL DEFAULT 0,
  calories INTEGER,
  cardio_min INTEGER NOT NULL DEFAULT 0,
  pliability_min INTEGER NOT NULL DEFAULT 0,
  meals_logged INTEGER NOT NULL DEFAULT 0,
  weight_lbs REAL,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3 strength sessions per week, paired days: A=Mon/Tue, B=Wed/Thu, C=Fri/Sat.
CREATE TABLE IF NOT EXISTS strength_session (
  week_start TEXT NOT NULL,
  letter TEXT NOT NULL CHECK (letter IN ('A','B','C')),
  plan_json TEXT,
  completed_date TEXT,
  notes TEXT,
  PRIMARY KEY (week_start, letter)
);

-- Planned random fire minute per slot per day.
-- slot in: morning | midday | evening | sunday_retro
CREATE TABLE IF NOT EXISTS checkin (
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  planned_minute INTEGER NOT NULL,
  fired_at TEXT,
  responded_at TEXT,
  PRIMARY KEY (date, slot)
);

-- Rolling conversation memory (user + assistant turns).
CREATE TABLE IF NOT EXISTS message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  slot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_message_created ON message(created_at DESC);

-- Week-1 assessment: Q/A pairs Cramerica asks during the first morning check-in.
CREATE TABLE IF NOT EXISTS assessment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generated program (Opus writes here each Sunday retro for the coming week).
CREATE TABLE IF NOT EXISTS program (
  week_start TEXT PRIMARY KEY,
  plan_json TEXT NOT NULL,
  summary TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Streaks cache (recomputed nightly or on demand).
CREATE TABLE IF NOT EXISTS streak (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  daily_count INTEGER NOT NULL DEFAULT 0,
  daily_best INTEGER NOT NULL DEFAULT 0,
  week_count INTEGER NOT NULL DEFAULT 0,
  week_best INTEGER NOT NULL DEFAULT 0,
  last_computed TEXT
);
INSERT OR IGNORE INTO streak (id) VALUES (1);

-- Which pliability routine to use today (rotates through library).
CREATE TABLE IF NOT EXISTS pliability_day (
  date TEXT PRIMARY KEY,
  routine_id INTEGER NOT NULL
);
