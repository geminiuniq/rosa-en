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

CREATE TABLE IF NOT EXISTS vocab_mastered (
  student  TEXT NOT NULL,
  word     TEXT NOT NULL,
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student, word)
);

-- Placement-test (摸底考) computed assessment — one per student+subject, re-takeable (upsert).
CREATE TABLE IF NOT EXISTS diag_result (
  student        TEXT NOT NULL,
  subject        TEXT NOT NULL,
  score          INTEGER,
  total          INTEGER,
  pct            INTEGER,
  level          TEXT,                 -- A1 / A2 / ...
  level_zh       TEXT,
  weak           TEXT,                 -- JSON array of weak topics
  tier_acc       TEXT,                 -- JSON {t1,t2,t3} accuracy %
  challenge_from INTEGER,              -- day from which 拔高题 kick in
  taken_date     TEXT,
  profile        TEXT,                 -- full profile JSON blob
  updated_at     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student, subject)
);

-- Submitted answers + verdicts, frozen once graded (cleared only by 「重置本天」).
CREATE TABLE IF NOT EXISTS answers_store (
  student    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  data       TEXT,                 -- JSON: {day:{mcq:{qid:{o,ok}},str:{qid:{v,w,ok}},score,total,ts}}
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student, subject)
);

INSERT OR IGNORE INTO student(id,name,start_date) VALUES('default','Student',date('now'));
