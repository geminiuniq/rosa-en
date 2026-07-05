#!/usr/bin/env node
/* ===========================================================================
 * ROSA O-Level English — local backend
 * Zero-dependency: Node built-ins only (node:http, node:sqlite, node:fs).
 * Connects to / creates a SQLite database and exposes a small REST API,
 * and also serves the static web app (index.html) from the same origin.
 * Run:  node server.js      (default port 4600, override with PORT env)
 * ======================================================================== */
'use strict';
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4600;
const DB_DIR = path.join(ROOT, 'db');
const DB_PATH = path.join(DB_DIR, 'rosa.db');

/* ---------- connect / create database ---------- */
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS student (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  start_date  TEXT,
  current_day INTEGER DEFAULT 1,
  unlocked_day INTEGER DEFAULT 1,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS day_content (
  subject    TEXT NOT NULL DEFAULT 'english',
  day        INTEGER NOT NULL,
  theme_zh   TEXT,
  theme_en   TEXT,
  content    TEXT NOT NULL,           -- full day JSON
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (subject, day)
);

CREATE TABLE IF NOT EXISTS notebook (
  student       TEXT NOT NULL,
  qid           TEXT NOT NULL,
  stem          TEXT,
  options       TEXT,                 -- JSON array
  answer        INTEGER,
  expl          TEXT,
  topic         TEXT,
  correct_streak INTEGER DEFAULT 0,
  mastered      INTEGER DEFAULT 0,
  day_added     INTEGER,
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student, qid)
);

CREATE TABLE IF NOT EXISTS attempt (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  student  TEXT NOT NULL,
  day      INTEGER,
  qid      TEXT,
  topic    TEXT,
  chosen   INTEGER,
  correct  INTEGER,
  kind     TEXT,                      -- 'mcq' | 'review'
  ts       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS essay (
  student    TEXT NOT NULL,
  day        INTEGER NOT NULL,
  text       TEXT,
  words      INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student, day)
);
`);

// migrate an older day_content table (no `subject` column) → tag existing rows as 'english'
try {
  const cols = db.prepare("PRAGMA table_info(day_content)").all();
  if (cols.length && !cols.some(c => c.name === 'subject')) {
    db.exec(`
      ALTER TABLE day_content RENAME TO day_content_old;
      CREATE TABLE day_content (
        subject TEXT NOT NULL DEFAULT 'english', day INTEGER NOT NULL,
        theme_zh TEXT, theme_en TEXT, content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (subject, day));
      INSERT INTO day_content(subject,day,theme_zh,theme_en,content,created_at)
        SELECT 'english',day,theme_zh,theme_en,content,created_at FROM day_content_old;
      DROP TABLE day_content_old;`);
    console.log('  migrated day_content → subject-aware (existing rows = english)');
  }
} catch (e) { console.error('day_content migration skipped:', e.message); }

// ensure a default student row exists
db.prepare(`INSERT OR IGNORE INTO student(id,name,start_date) VALUES('default','Student',date('now'))`).run();

/* ---------- helpers ---------- */
const J = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const readBody = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 5e6) req.destroy(); });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
});
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

/* ---------- API ---------- */
async function api(req, res, url) {
  const seg = url.pathname.replace(/^\/api\//, '').split('/');
  const q = url.searchParams;
  const student = q.get('student') || 'default';

  // GET /api/health
  if (seg[0] === 'health') return J(res, 200, { ok: true, db: path.basename(DB_PATH) });

  // GET /api/state
  if (seg[0] === 'state' && req.method === 'GET') {
    const r = db.prepare(`SELECT current_day AS current, unlocked_day AS unlocked, start_date AS startDate FROM student WHERE id=?`).get(student);
    return J(res, 200, r || { current: 1, unlocked: 1, startDate: null });
  }
  // POST /api/state  {student,current,unlocked,startDate}
  if (seg[0] === 'state' && req.method === 'POST') {
    const b = await readBody(req);
    db.prepare(`INSERT INTO student(id,current_day,unlocked_day,start_date,updated_at)
                VALUES(?,?,?,?,datetime('now'))
                ON CONFLICT(id) DO UPDATE SET current_day=excluded.current_day,
                  unlocked_day=excluded.unlocked_day, start_date=COALESCE(excluded.start_date,start_date),
                  updated_at=datetime('now')`)
      .run(b.student || 'default', b.current | 0 || 1, b.unlocked | 0 || 1, b.startDate || null);
    return J(res, 200, { ok: true });
  }

  // GET /api/days?subject=  -> { "1": {...}, "2": {...} }
  if (seg[0] === 'days' && req.method === 'GET') {
    const subject = q.get('subject') || 'english';
    const rows = db.prepare(`SELECT day, content FROM day_content WHERE subject=? ORDER BY day`).all(subject);
    const out = {}; for (const r of rows) { try { out[r.day] = JSON.parse(r.content); } catch {} }
    return J(res, 200, out);
  }
  // GET /api/day/:n?subject=
  if (seg[0] === 'day' && req.method === 'GET' && seg[1]) {
    const subject = q.get('subject') || 'english';
    const r = db.prepare(`SELECT content FROM day_content WHERE subject=? AND day=?`).get(subject, Number(seg[1]));
    return J(res, 200, r ? JSON.parse(r.content) : null);
  }
  // POST /api/day  {subject, day, content}
  if (seg[0] === 'day' && req.method === 'POST') {
    const b = await readBody(req);
    const c = b.content || {}; const day = Number(b.day || c.day);
    const subject = b.subject || c.subject || 'english';
    if (!day) return J(res, 400, { error: 'missing day' });
    db.prepare(`INSERT INTO day_content(subject,day,theme_zh,theme_en,content,created_at)
                VALUES(?,?,?,?,?,datetime('now'))
                ON CONFLICT(subject,day) DO UPDATE SET theme_zh=excluded.theme_zh,
                  theme_en=excluded.theme_en, content=excluded.content`)
      .run(subject, day, c.themeZh || c.topicZh || null, c.themeEn || c.topicEn || null, JSON.stringify(c));
    return J(res, 200, { ok: true, day });
  }

  // GET /api/notebook
  if (seg[0] === 'notebook' && req.method === 'GET') {
    const rows = db.prepare(`SELECT qid AS id, stem, options, answer, expl, topic,
        correct_streak AS correctStreak, mastered, day_added AS dayAdded
        FROM notebook WHERE student=? ORDER BY day_added, qid`).all(student);
    for (const r of rows) { try { r.options = JSON.parse(r.options); } catch { r.options = []; } r.mastered = !!r.mastered; }
    return J(res, 200, rows);
  }
  // POST /api/notebook  {student, items:[...]}  (full replace for that student)
  if (seg[0] === 'notebook' && req.method === 'POST') {
    const b = await readBody(req); const st = b.student || 'default';
    const items = Array.isArray(b.items) ? b.items : [];
    const tx = db.prepare('BEGIN'); tx.run();
    try {
      db.prepare(`DELETE FROM notebook WHERE student=?`).run(st);
      const ins = db.prepare(`INSERT INTO notebook(student,qid,stem,options,answer,expl,topic,correct_streak,mastered,day_added)
                              VALUES(?,?,?,?,?,?,?,?,?,?)`);
      for (const n of items) ins.run(st, n.id, n.stem || '', JSON.stringify(n.options || []),
        n.answer | 0, n.expl || '', n.topic || '', n.correctStreak | 0, n.mastered ? 1 : 0, n.dayAdded | 0);
      db.prepare('COMMIT').run();
    } catch (e) { db.prepare('ROLLBACK').run(); return J(res, 500, { error: String(e) }); }
    return J(res, 200, { ok: true, count: items.length });
  }

  // POST /api/attempt  {student,day,qid,topic,chosen,correct,kind}
  if (seg[0] === 'attempt' && req.method === 'POST') {
    const b = await readBody(req);
    db.prepare(`INSERT INTO attempt(student,day,qid,topic,chosen,correct,kind)
                VALUES(?,?,?,?,?,?,?)`)
      .run(b.student || 'default', b.day | 0, b.qid || '', b.topic || '', b.chosen, b.correct ? 1 : 0, b.kind || 'mcq');
    return J(res, 200, { ok: true });
  }

  // POST /api/essay {student,day,text,words}
  if (seg[0] === 'essay' && req.method === 'POST') {
    const b = await readBody(req);
    db.prepare(`INSERT INTO essay(student,day,text,words,updated_at) VALUES(?,?,?,?,datetime('now'))
                ON CONFLICT(student,day) DO UPDATE SET text=excluded.text, words=excluded.words, updated_at=datetime('now')`)
      .run(b.student || 'default', b.day | 0, b.text || '', b.words | 0);
    return J(res, 200, { ok: true });
  }

  // GET /api/stats  -> learning summary
  if (seg[0] === 'stats' && req.method === 'GET') {
    const a = db.prepare(`SELECT COUNT(*) n, SUM(correct) c FROM attempt WHERE student=?`).get(student);
    const byTopic = db.prepare(`SELECT topic, COUNT(*) n, SUM(correct) c FROM attempt
        WHERE student=? AND topic<>'' GROUP BY topic ORDER BY (SUM(correct)*1.0/COUNT(*)) ASC`).all(student);
    const nb = db.prepare(`SELECT COUNT(*) total, SUM(mastered) mastered FROM notebook WHERE student=?`).get(student);
    const daysDone = db.prepare(`SELECT COUNT(*) n FROM day_content WHERE subject=?`).get(q.get('subject') || 'english');
    return J(res, 200, {
      attempts: a.n || 0, correct: a.c || 0,
      accuracy: a.n ? Math.round((a.c || 0) / a.n * 100) : 0,
      weakTopics: byTopic.slice(0, 5),
      notebook: { total: nb.total || 0, mastered: nb.mastered || 0 },
      daysGenerated: daysDone.n || 0
    });
  }

  return J(res, 404, { error: 'unknown endpoint', path: url.pathname });
}

/* ---------- static ---------- */
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- server ---------- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    J(res, 500, { error: String(e && e.message || e) });
  }
}).listen(PORT, () => {
  console.log(`\n  ROSA O-Level  ▸  http://localhost:${PORT}`);
  console.log(`  SQLite DB     ▸  ${DB_PATH}`);
  console.log(`  API base      ▸  http://localhost:${PORT}/api/\n`);
});
