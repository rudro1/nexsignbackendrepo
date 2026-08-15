'use strict';
/**
 * Full NexSign E2E test — upload → send → sign → finalize → emails
 * Run: node scripts/e2eFullTest.js
 * Env: SMOKE_BASE, TEST_SIGNER_EMAIL (optional, defaults to SMTP_USER)
 */
require('dotenv').config();

const { PDFDocument, StandardFonts } = require('pdf-lib');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5001/api';
const SIGNER_EMAIL = process.env.TEST_SIGNER_EMAIL || process.env.SMTP_USER || 'fixensydev@gmail.com';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(pass ? '✅' : '❌', name, detail ? `— ${detail}` : '');
};

async function req(method, urlPath, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const fetchBody = form || (body ? JSON.stringify(body) : undefined);
  if (body && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: fetchBody });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function makeTestPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('NexSign E2E Test Document', { x: 50, y: 700, size: 18, font });
  page.drawText(`Generated ${new Date().toISOString()}`, { x: 50, y: 670, size: 10, font });
  return Buffer.from(await doc.save());
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testEmailWithPdf() {
  const { sendSigningEmail, sendEmployeeSignedCopyEmail } = require('../utils/emailService');
  const pdf = await makeTestPdf();
  const to = SIGNER_EMAIL;

  const r1 = await sendSigningEmail({
    recipientEmail: to,
    recipientName:  'E2E Tester',
    senderName:     'NexSign QA',
    senderEmail:    process.env.SMTP_USER,
    documentTitle:  'E2E First Mail PDF Test',
    signingLink:    'https://nexsignfrontend.vercel.app/sign/e2e-test/abc123',
    companyName:    'NexSign QA',
    pdfBuffer:      pdf,
  });
  ok('Direct email: signing request + PDF', r1?.success === true, r1?.error || r1?.subject);

  const r2 = await sendEmployeeSignedCopyEmail({
    recipientEmail: to,
    recipientName:  'E2E Tester',
    documentTitle:  'E2E Signed Copy Test',
    companyName:    'NexSign QA',
    pdfBuffer:      pdf,
    parties:        [{ name: 'E2E Tester', email: to, status: 'signed' }],
  });
  ok('Direct email: signed copy + PDF', r2?.success === true, r2?.error || r2?.subject);
}

async function testSequentialFlow(token) {
  const pdf = await makeTestPdf();
  const fieldId = `field_${Date.now()}`;
  const parties = JSON.stringify([{
    name: 'E2E Signer', email: SIGNER_EMAIL, designation: 'Tester', color: '#3B82F6',
  }]);
  const fields = JSON.stringify([{
    id: fieldId, type: 'text', partyIndex: 0, page: 1,
    x: 50, y: 600, width: 200, height: 30, required: true, label: 'Name',
  }]);

  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'e2e-test.pdf');
  form.append('title', `E2E Sequential ${Date.now()}`);
  form.append('parties', parties);
  form.append('fields', fields);
  form.append('totalPages', '1');
  form.append('companyName', 'NexSign QA');

  const send = await req('POST', '/documents/upload-and-send', { token, form });
  ok('Sequential: upload-and-send', send.status === 200 && send.data?.success, `status ${send.status}`);

  const doc = send.data?.document;
  if (!doc?._id) return null;

  const party = doc.parties?.[0];
  ok('Sequential: publicSlug on doc', !!doc.publicSlug, doc.publicSlug || 'missing');
  ok('Sequential: signCode on party', !!party?.signCode, party?.signCode || 'missing');

  const slug = doc.publicSlug;
  const signCode = party?.signCode;
  if (!slug || !signCode) return doc;

  const validate = await req('GET', `/documents/sign/v/${slug}/${signCode}`);
  ok('Sequential: validate pretty link', validate.status === 200 && validate.data?.success);

  const pdfProxy = await fetch(`${BASE}/documents/sign/v/${slug}/${signCode}/pdf`);
  ok('Sequential: PDF proxy', pdfProxy.ok, `HTTP ${pdfProxy.status}`);

  const submit = await req('POST', '/documents/sign/submit', {
    body: {
      slug, signCode,
      fields: [{ id: fieldId, partyIndex: 0, value: 'E2E Signed Name' }],
      clientTime: new Date().toISOString(),
    },
  });
  ok('Sequential: submit signature', submit.status === 200 && submit.data?.completed, submit.data?.message || '');

  // Wait for finalize background job
  let signedUrl = null;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const got = await req('GET', `/documents/${doc._id}`, { token });
    signedUrl = got.data?.document?.signedFileUrl;
    if (signedUrl) break;
  }
  ok('Sequential: signedFileUrl saved', !!signedUrl, signedUrl ? 'yes' : 'timeout');

  return doc;
}

async function main() {
  console.log('\n═══ NexSign E2E Full Test ═══\n');
  console.log('Base:', BASE);
  console.log('Signer email:', SIGNER_EMAIL, '\n');

  const health = await req('GET', '/health');
  ok('Health', health.status === 200 && health.data?.success);

  const login = await req('POST', '/auth/login', {
    body: { email: process.env.SEED_ADMIN_EMAIL || '', password: process.env.SEED_ADMIN_PASSWORD || '' },
  });
  ok('Login', login.status === 200 && login.data?.token);
  const token = login.data?.token;
  if (!token) {
    console.log('\nCannot continue without auth.');
    process.exit(1);
  }

  console.log('\n── Step 1: Direct Gmail PDF emails ──');
  try {
    await testEmailWithPdf();
  } catch (e) {
    ok('Direct Gmail PDF emails', false, e.message);
  }

  console.log('\n── Step 2: Sequential upload → sign → finalize ──');
  try {
    await testSequentialFlow(token);
  } catch (e) {
    ok('Sequential flow', false, e.message);
  }

  console.log('\n── Step 3: API smoke checks ──');
  const docs = await req('GET', '/documents', { token });
  ok('Documents list', docs.status === 200);
  const tpl = await req('GET', '/templates', { token });
  ok('Templates list', tpl.status === 200);

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach(f => console.log(' -', f.name, f.detail));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
