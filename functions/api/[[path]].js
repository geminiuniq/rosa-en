/* ===========================================================================
 * ROSA O-Level — Cloudflare Pages Function (serverless REST API on D1)
 * Mirrors server.js endpoint-for-endpoint, but against the D1 (cloud SQLite)
 * binding `env.DB`. The static HTML apps hit these same /api/* paths, so no
 * frontend change is needed — offline localStorage is used only when the API
 * is unreachable.
 * ======================================================================== */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export async function onRequest(context) {
  const { request, env } = context;
  const DB = env.DB;
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/api\//, '').split('/');
  const q = url.searchParams;
  const student = q.get('student') || 'default';
  const method = request.method;

  if (!DB) return json({ error: 'D1 binding "DB" is not configured (see wrangler.toml / dashboard)' }, 500);

  try {
    /* GET /api/health */
    if (seg[0] === 'health') return json({ ok: true, db: 'd1' });

    /* GET /api/state */
    if (seg[0] === 'state' && method === 'GET') {
      const r = await DB.prepare(
        `SELECT current_day AS current, unlocked_day AS unlocked, start_date AS startDate FROM student WHERE id=?`
      ).bind(student).first();
      return json(r || { current: 1, unlocked: 1, startDate: null });
    }
    /* POST /api/state */
    if (seg[0] === 'state' && method === 'POST') {
      const b = await request.json().catch(() => ({}));
      await DB.prepare(
        `INSERT INTO student(id,current_day,unlocked_day,start_date,updated_at)
         VALUES(?,?,?,?,datetime('now'))
         ON CONFLICT(id) DO UPDATE SET current_day=excluded.current_day,
           unlocked_day=excluded.unlocked_day, start_date=COALESCE(excluded.start_date,start_date),
           updated_at=datetime('now')`
      ).bind(b.student || 'default', (b.current | 0) || 1, (b.unlocked | 0) || 1, b.startDate || null).run();
      return json({ ok: true });
    }

    /* GET /api/days?subject= */
    if (seg[0] === 'days' && method === 'GET') {
      const subject = q.get('subject') || 'english';
      const rs = await DB.prepare(`SELECT day, content FROM day_content WHERE subject=? ORDER BY day`).bind(subject).all();
      const out = {};
      for (const r of rs.results || []) { try { out[r.day] = JSON.parse(r.content); } catch {} }
      return json(out);
    }
    /* GET /api/day/:n?subject= */
    if (seg[0] === 'day' && method === 'GET' && seg[1]) {
      const subject = q.get('subject') || 'english';
      const r = await DB.prepare(`SELECT content FROM day_content WHERE subject=? AND day=?`)
        .bind(subject, Number(seg[1])).first();
      return json(r ? JSON.parse(r.content) : null);
    }
    /* POST /api/day  {subject, day, content} */
    if (seg[0] === 'day' && method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const c = b.content || {};
      const day = Number(b.day || c.day);
      const subject = b.subject || c.subject || 'english';
      if (!day) return json({ error: 'missing day' }, 400);
      await DB.prepare(
        `INSERT INTO day_content(subject,day,theme_zh,theme_en,content,created_at)
         VALUES(?,?,?,?,?,datetime('now'))
         ON CONFLICT(subject,day) DO UPDATE SET theme_zh=excluded.theme_zh,
           theme_en=excluded.theme_en, content=excluded.content`
      ).bind(subject, day, c.themeZh || c.topicZh || null, c.themeEn || c.topicEn || null, JSON.stringify(c)).run();
      return json({ ok: true, day });
    }

    /* GET /api/notebook */
    if (seg[0] === 'notebook' && method === 'GET') {
      const rs = await DB.prepare(
        `SELECT qid AS id, stem, options, answer, expl, topic,
           correct_streak AS correctStreak, mastered, day_added AS dayAdded
         FROM notebook WHERE student=? ORDER BY day_added, qid`
      ).bind(student).all();
      const rows = (rs.results || []).map((r) => {
        let o = []; try { o = JSON.parse(r.options); } catch {}
        return { ...r, options: o, mastered: !!r.mastered };
      });
      return json(rows);
    }
    /* POST /api/notebook  {student, items:[...]}  — full replace for that student (atomic batch) */
    if (seg[0] === 'notebook' && method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const st = b.student || 'default';
      const items = Array.isArray(b.items) ? b.items : [];
      const stmts = [DB.prepare(`DELETE FROM notebook WHERE student=?`).bind(st)];
      const ins = DB.prepare(
        `INSERT INTO notebook(student,qid,stem,options,answer,expl,topic,correct_streak,mastered,day_added)
         VALUES(?,?,?,?,?,?,?,?,?,?)`
      );
      for (const n of items)
        stmts.push(ins.bind(st, n.id, n.stem || '', JSON.stringify(n.options || []), n.answer | 0,
          n.expl || '', n.topic || '', n.correctStreak | 0, n.mastered ? 1 : 0, n.dayAdded | 0));
      await DB.batch(stmts);
      return json({ ok: true, count: items.length });
    }

    /* POST /api/attempt  {student,day,qid,topic,chosen,correct,kind} */
    if (seg[0] === 'attempt' && method === 'POST') {
      const b = await request.json().catch(() => ({}));
      await DB.prepare(
        `INSERT INTO attempt(student,day,qid,topic,chosen,correct,kind) VALUES(?,?,?,?,?,?,?)`
      ).bind(b.student || 'default', b.day | 0, b.qid || '', b.topic || '',
        b.chosen == null ? null : (b.chosen | 0), b.correct ? 1 : 0, b.kind || 'mcq').run();
      return json({ ok: true });
    }

    /* POST /api/essay {student,day,text,words} */
    if (seg[0] === 'essay' && method === 'POST') {
      const b = await request.json().catch(() => ({}));
      await DB.prepare(
        `INSERT INTO essay(student,day,text,words,updated_at) VALUES(?,?,?,?,datetime('now'))
         ON CONFLICT(student,day) DO UPDATE SET text=excluded.text, words=excluded.words, updated_at=datetime('now')`
      ).bind(b.student || 'default', b.day | 0, b.text || '', b.words | 0).run();
      return json({ ok: true });
    }

    /* GET /api/stats?student=&subject= */
    if (seg[0] === 'stats' && method === 'GET') {
      const a = await DB.prepare(`SELECT COUNT(*) n, SUM(correct) c FROM attempt WHERE student=?`).bind(student).first();
      const bt = await DB.prepare(
        `SELECT topic, COUNT(*) n, SUM(correct) c FROM attempt
         WHERE student=? AND topic<>'' GROUP BY topic ORDER BY (SUM(correct)*1.0/COUNT(*)) ASC`
      ).bind(student).all();
      const nb = await DB.prepare(`SELECT COUNT(*) total, SUM(mastered) mastered FROM notebook WHERE student=?`).bind(student).first();
      const dd = await DB.prepare(`SELECT COUNT(*) n FROM day_content WHERE subject=?`).bind(q.get('subject') || 'english').first();
      return json({
        attempts: a?.n || 0,
        correct: a?.c || 0,
        accuracy: a?.n ? Math.round((a.c || 0) / a.n * 100) : 0,
        weakTopics: (bt.results || []).slice(0, 5),
        notebook: { total: nb?.total || 0, mastered: nb?.mastered || 0 },
        daysGenerated: dd?.n || 0,
      });
    }

    return json({ error: 'unknown endpoint', path: url.pathname }, 404);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}
