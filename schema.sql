-- ROSA O-Level · Cloudflare D1 schema (cloud SQLite)
-- Mirrors the tables created by server.js. Apply once with:
--   wrangler d1 execute rosa --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS student (
  id           TEXT PRIMARY KEY,
  name         TEXT,
  start_date   TEXT,
  current_day  INTEGER DEFAULT 1,
  unlocked_day INTEGER DEFAULT 1,
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS day_content (
  subject    TEXT NOT NULL DEFAULT 'english',
  day        INTEGER NOT NULL,
  theme_zh   TEXT,
  theme_en   TEXT,
  content    TEXT NOT NULL,            -- full day JSON
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (subject, day)
);

CREATE TABLE IF NOT EXISTS notebook (
  student        TEXT NOT NULL,
  qid            TEXT NOT NULL,
  stem           TEXT,
  options        TEXT,                 -- JSON array
  answer         INTEGER,
  expl           TEXT,
  topic          TEXT,
  correct_streak INTEGER DEFAULT 0,
  mastered       INTEGER DEFAULT 0,
  day_added      INTEGER,
  updated_at     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student, qid)
);

CREATE TABLE IF NOT EXISTS attempt (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  student TEXT NOT NULL,
  day     INTEGER,
  qid     TEXT,
  topic   TEXT,
  chosen  INTEGER,
  correct INTEGER,
  kind    TEXT,                        -- 'mcq' | 'review' | 'diagnostic'
  ts      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS essay (
  student    TEXT NOT NULL,
  day        INTEGER NOT NULL,
  text       TEXT,
  words      INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student, day)
);

INSERT OR IGNORE INTO student(id,name,start_date) VALUES('default','Student',date('now'));
