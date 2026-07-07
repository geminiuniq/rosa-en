/* ===========================================================================
 * ROSA O-Level — passcode gate (Cloudflare Pages middleware)
 * Runs before every request (static pages AND /api/*). If the visitor has not
 * entered the correct passcode, they get a login page; the API returns 401.
 *
 * Set the passcode as a secret named APP_PASSCODE:
 *   wrangler pages secret put APP_PASSCODE
 * If APP_PASSCODE is unset the site stays open (so a fresh deploy isn't locked
 * out) — set it to turn the gate on.
 * ======================================================================== */

const COOKIE = 'rosa_auth';

async function tokenFor(pass) {
  const data = new TextEncoder().encode('rosa::' + pass);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loginPage(msg) {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ROSA · 请输入口令</title>
<style>
  :root{--bg:#f3ecdd;--panel:#fdf9f0;--line:#e5dcc8;--ink:#3b3427;--ink2:#6f6552;--brand:#356a8e;--bad:#c0554a;
    --serif:Georgia,"Songti SC","Source Han Serif SC",serif;
    --sans:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(1100px 460px at 50% -12%,rgba(53,106,142,.07),transparent),var(--bg);
    color:var(--ink);font-family:var(--sans)}
  .box{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:34px 30px;max-width:360px;width:100%;
    box-shadow:0 1px 2px rgba(75,60,35,.05),0 8px 24px rgba(75,60,35,.07);text-align:center}
  .ic{font-size:34px}
  h1{font-family:var(--serif);font-size:22px;font-weight:700;margin:12px 0 4px}
  p{color:var(--ink2);font-size:14px;margin:0 0 18px}
  input{width:100%;padding:12px 14px;font-size:16px;border:1px solid var(--line);border-radius:10px;
    background:#fdfbf4;color:var(--ink);font-family:inherit;margin-bottom:12px}
  input:focus{outline:none;border-color:var(--brand)}
  button{width:100%;padding:12px;font-size:15px;font-weight:700;border:none;border-radius:10px;
    background:var(--brand);color:#fff;cursor:pointer;font-family:inherit}
  .err{color:var(--bad);font-size:13px;margin:-6px 0 12px}
</style></head><body>
<form class="box" method="POST" action="/__login">
  <div class="ic">🎯</div>
  <h1>ROSA · O-Level 冲A计划</h1>
  <p>请输入访问口令</p>
  ${msg ? `<div class="err">${msg}</div>` : ''}
  <input type="password" name="pass" placeholder="口令" autocomplete="current-password" autofocus>
  <button type="submit">进入 →</button>
</form></body></html>`;
  return new Response(html, {
    status: msg ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // No passcode configured → leave the site open (avoid locking out a fresh deploy).
  if (!env.APP_PASSCODE) return next();

  const expected = await tokenFor(env.APP_PASSCODE);

  // Login form submission
  if (url.pathname === '/__login' && request.method === 'POST') {
    const form = await request.formData();
    const pass = (form.get('pass') || '').toString();
    if (pass === env.APP_PASSCODE) {
      return new Response('', {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${expected}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`,
        },
      });
    }
    return loginPage('口令不正确，请重试。');
  }

  // Already authenticated?
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)rosa_auth=([a-f0-9]+)/);
  if (m && m[1] === expected) return next();

  // Not authenticated
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return loginPage();
}
