-- Migration: Add historical trend tracking tables
-- Created: 2024-01-15

-- Historical seat snapshots for trend analysis
CREATE TABLE IF NOT EXISTS seat_history (
  course_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  term TEXT NOT NULL,
  seats INTEGER,
  open_seats INTEGER NOT NULL,
  waitlist INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (term, section_id, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_seat_history_lookup ON seat_history(term, section_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_seat_history_course ON seat_history(course_id, term);

-- Track which courses are added to plans (for popularity ranking)
CREATE TABLE IF NOT EXISTS plan_activity (
  course_id TEXT NOT NULL,
  term TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at TEXT,
  PRIMARY KEY (term, course_id, user_hash)
);

CREATE INDEX IF NOT EXISTS idx_plan_activity_term ON plan_activity(term, added_at);
CREATE INDEX IF NOT EXISTS idx_plan_activity_course ON plan_activity(course_id, term, added_at);
CREATE INDEX IF NOT EXISTS idx_plan_activity_active ON plan_activity(term, removed_at) WHERE removed_at IS NULL;

-- Historical offerings: which terms a course was offered
CREATE TABLE IF NOT EXISTS course_offerings (
  course_id TEXT NOT NULL,
  term TEXT NOT NULL,
  section_count INTEGER NOT NULL,
  total_seats INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id, term)
);

CREATE INDEX IF NOT EXISTS idx_course_offerings_course ON course_offerings(course_id, term DESC);
