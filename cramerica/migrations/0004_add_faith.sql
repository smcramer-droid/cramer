-- Faith/spiritual discipline tracking. Binary per day: did prayer,
-- scripture study, or similar faith practice. Gates the daily streak
-- alongside cardio and pliability.

ALTER TABLE daily_log ADD COLUMN faith_done INTEGER NOT NULL DEFAULT 0;
