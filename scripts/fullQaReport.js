'use strict';
/**
 * NexSign Full QA — API-level verification
 * Run: node scripts/fullQaReport.js
 */
require('dotenv').config();

const BASE = process.env.SMOKE_BASE || 'http://localhost:5001/api';
const ts   = Date.now();

const report = {
  meta: {
    date: new Date().toISOString(),
    base: BASE,
    method: 'API + curl (no browser automation)',
  },
  sections: {},
};

function section(id, title) {
  report.sections[id] = { title, items: [] };
  return report.sections[id];
}

function item(sec, name, status, detail = '') {
  sec.items.push({ name, status, detail });
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body != null && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function run() {
  // ── Infrastructure ─────────────────────────────────────────
  const infra = section('infra', 'Infrastructure');
  const health = await req('GET', '/health');
  item(infra, 'Backend health + DB', health.status === 200 && health.data?.db === 'connected'
    ? 'PASS' : 'FAIL', JSON.stringify(health.data));

  // ── A. Authentication ──────────────────────────────────────
  const auth = section('A', 'Authentication & Account');

  const dupEmail = `qa.dup.${ts}@nexsign-test.local`;
  const pass = 'QaTestPass1+';

  const reg1 = await req('POST', '/auth/register', {
    full_name: 'QA User One', email: dupEmail, password: pass,
  });
  item(auth, 'A.1 Register (valid)', reg1.status === 201 && reg1.data?.token ? 'PASS' : 'FAIL',
    `HTTP ${reg1.status}`);

  const regDup = await req('POST', '/auth/register', {
    full_name: 'Dup', email: dupEmail, password: pass,
  });
  item(auth, 'A.2 Register (duplicate email)', regDup.status === 409 ? 'PASS' : 'FAIL',
    `HTTP ${regDup.status} — ${regDup.data?.message || ''}`);

  const regWeak = await req('POST', '/auth/register', {
    full_name: 'Weak', email: `weak.${ts}@test.local`, password: '123',
  });
  item(auth, 'A.3 Register (weak password)', regWeak.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${regWeak.status}`);

  const regBad = await req('POST', '/auth/register', {
    full_name: '', email: 'not-an-email', password: pass,
  });
  item(auth, 'A.4 Register (invalid input)', regBad.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${regBad.status}`);

  const userToken = reg1.data?.token;

  const loginOk = await req('POST', '/auth/login', { email: dupEmail, password: pass });
  item(auth, 'A.5 Login (correct)', loginOk.status === 200 && loginOk.data?.token ? 'PASS' : 'FAIL',
    `HTTP ${loginOk.status}`);

  const loginBad = await req('POST', '/auth/login', { email: dupEmail, password: 'WrongPass99!' });
  item(auth, 'A.6 Login (wrong password)', loginBad.status === 401 ? 'PASS' : 'FAIL',
    `HTTP ${loginBad.status} — generic message: ${loginBad.data?.message || ''}`);

  const loginGhost = await req('POST', '/auth/login', {
    email: `ghost.${ts}@test.local`, password: pass,
  });
  item(auth, 'A.7 Login (nonexistent user)', loginGhost.status === 401 ? 'PASS' : 'FAIL',
    `HTTP ${loginGhost.status}`);

  const google = await req('POST', '/auth/google', {
    email: `google.${ts}@test.local`, name: 'Google QA', photoURL: null,
  });
  item(auth, 'A.8 Google auth (API stub)', google.status === 200 && google.data?.token ? 'PASS' : 'FAIL',
    'Backend creates/links Google user without browser popup');

  const me = await req('GET', '/auth/me', null, userToken);
  item(auth, 'A.9 GET /auth/me', me.status === 200 && me.data?.user?.email === dupEmail ? 'PASS' : 'FAIL',
    `HTTP ${me.status}`);

  const profile = await req('PUT', '/auth/profile', {
    full_name: 'QA Updated Name', designation: 'QA Engineer',
  }, userToken);
  item(auth, 'A.10 Update profile', profile.status === 200 && profile.data?.user?.full_name === 'QA Updated Name'
    ? 'PASS' : 'FAIL', `HTTP ${profile.status}`);

  const me2 = await req('GET', '/auth/me', null, userToken);
  item(auth, 'A.11 Profile persists', me2.data?.user?.designation === 'QA Engineer' ? 'PASS' : 'FAIL', '');

  const chgPw = await req('PUT', '/auth/change-password', {
    current_password: pass, new_password: 'NewQaPass2+',
  }, userToken);
  item(auth, 'A.12 Change password', chgPw.status === 200 ? 'PASS' : 'FAIL', `HTTP ${chgPw.status}`);

  const loginNew = await req('POST', '/auth/login', { email: dupEmail, password: 'NewQaPass2+' });
  item(auth, 'A.13 Login with new password', loginNew.status === 200 ? 'PASS' : 'FAIL', '');

  const noAuth = await req('GET', '/documents');
  item(auth, 'A.14 Protected route (no token)', noAuth.status === 401 ? 'PASS' : 'FAIL',
    `HTTP ${noAuth.status}`);

  const logout = await req('POST', '/auth/logout', {}, userToken);
  item(auth, 'A.15 Logout', logout.status === 200 ? 'PASS' : 'FAIL', '');

  // Admin
  const adminLogin = await req('POST', '/auth/login', {
    email: 'fixdev@fixensy.com', password: 'FixPass1+',
  });
  const adminToken = adminLogin.data?.token;

  item(auth, 'A.16 Admin login', adminLogin.status === 200 ? 'PASS' : 'FAIL', '');

  // ── B. Public pages / Feedback ───────────────────────────────
  const pub = section('B', 'Public Pages & Feedback');

  const feedback = await req('POST', '/feedback/send-feedback', {
    email: `feedback.${ts}@test.local`, name: 'QA Tester', stars: 5,
  });
  item(pub, 'B.1 Feedback endpoint', feedback.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${feedback.status} — ${typeof feedback.data === 'object' ? feedback.data?.message || feedback.data?.error : feedback.data}`);

  // ── G. Admin ─────────────────────────────────────────────────
  const admin = section('G', 'Admin Dashboard');

  const userAdminBlock = await req('GET', '/admin/stats', null, userToken);
  item(admin, 'G.1 Non-admin blocked from /admin/*', userAdminBlock.status === 403 ? 'PASS' : 'FAIL',
    `HTTP ${userAdminBlock.status} (regular user token)`);

  const adminStats = await req('GET', '/admin/stats', null, adminToken);
  item(admin, 'G.2 Admin stats', adminStats.status === 200 && adminStats.data?.success ? 'PASS' : 'FAIL',
    `users: ${adminStats.data?.stats?.totalUsers ?? '?'}`);

  const adminUsers = await req('GET', '/admin/users', null, adminToken);
  item(admin, 'G.3 User list', adminUsers.status === 200 ? 'PASS' : 'FAIL', '');

  // ── D. Signing public routes ─────────────────────────────────
  const sign = section('D', 'Signing Flow (public routes)');

  const badToken = await req('GET', '/documents/sign/validate/not-a-real-token-xyz');
  item(sign, 'D.1 Invalid signing token', badToken.status === 404 ? 'PASS' : 'FAIL',
    `HTTP ${badToken.status}`);

  const badPdf = await req('GET', '/documents/sign/fake-token/pdf');
  item(sign, 'D.2 Invalid PDF proxy', badPdf.status === 404 ? 'PASS' : 'FAIL',
    `HTTP ${badPdf.status}`);

  const tplBad = await req('GET', '/templates/sign/validate/invalid-token');
  item(sign, 'D.3 Invalid template token', tplBad.status === 404 ? 'PASS' : 'FAIL',
    `HTTP ${tplBad.status}`);

  const submitEmpty = await req('POST', '/documents/sign/submit', { token: 'x', fields: [] });
  item(sign, 'D.4 Submit without valid token', submitEmpty.status === 404 || submitEmpty.status === 400
    ? 'PASS' : 'FAIL', `HTTP ${submitEmpty.status}`);

  // ── E. Document management ───────────────────────────────────
  const docs = section('E', 'Document Management');

  const docList = await req('GET', '/documents', null, adminToken);
  item(docs, 'E.1 Document list', docList.status === 200 ? 'PASS' : 'FAIL',
    `count: ${Array.isArray(docList.data?.documents) ? docList.data.documents.length : '?'}`);

  // ── F. Templates ─────────────────────────────────────────────
  const tpl = section('F', 'Templates');

  const tplList = await req('GET', '/templates', null, adminToken);
  item(tpl, 'F.1 Template list', tplList.status === 200 ? 'PASS' : 'FAIL', '');

  // ── Summary ──────────────────────────────────────────────────
  let passed = 0, failed = 0, total = 0;
  for (const sec of Object.values(report.sections)) {
    for (const i of sec.items) {
      total++;
      if (i.status === 'PASS') passed++;
      else failed++;
    }
  }
  report.summary = { total, pass: passed, fail: failed, passRate: `${Math.round((passed / total) * 100)}%` };

  console.log(JSON.stringify(report, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
