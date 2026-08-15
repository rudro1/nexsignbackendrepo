'use strict';
/** Quick API smoke test — run: node scripts/smokeTest.js */
require('dotenv').config();

const BASE = process.env.SMOKE_BASE || 'http://localhost:5001/api';

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  const results = [];
  const ok = (name, pass) => {
    results.push({ name, pass });
    console.log(pass ? '✅' : '❌', name);
  };

  const health = await req('GET', '/health');
  ok('Health', health.status === 200 && health.data?.success);

  const login = await req('POST', '/auth/login', {
    email:    process.env.SEED_ADMIN_EMAIL    || '',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  });
  ok('Admin login', login.status === 200 && login.data?.token);
  const token = login.data?.token;

  if (token) {
    const me = await req('GET', '/auth/me', null, token);
    ok('Auth /me', me.data?.user?.role === 'super_admin');

    const stats = await req('GET', '/admin/stats', null, token);
    ok('Admin stats', stats.status === 200 && stats.data?.success);

    const docs = await req('GET', '/documents', null, token);
    ok('Documents list', docs.status === 200);

    const tpl = await req('GET', '/templates', null, token);
    ok('Templates list', tpl.status === 200);
  }

  const tplPub = await req('GET', '/templates/sign/validate/invalid-token');
  ok('Template public route', tplPub.status === 404);

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
