// Offline tests for the Gmail side of recipe 15. Google is faked (test/mock-google.mjs);
// Jev is real, so the last two tests need OPENROUTER_API_KEY and cost a fraction of a cent.
//
//   npm run test:gmail
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toGmailMessage } from './mock-google.mjs'; // also installs the fake Google for this process
import { ROOT } from '../../../lib/jev.mjs';

process.env.GMAIL_CLIENT_ID ??= 'test-client-id';
process.env.GMAIL_CLIENT_SECRET ??= 'test-client-secret';
process.env.JEV_NO_BROWSER = '1';
const { SCOPES, accessToken, toEmail } = await import('../gmail.mjs');

const here = new URL('.', import.meta.url).pathname;
const inbox = JSON.parse(readFileSync(new URL('../sample-inbox.json', import.meta.url), 'utf8'));
const TOKEN = join(ROOT, 'out', 'gmail-token.json');
const BACKUP = `${TOKEN}.backup-during-test`;
before(() => { mkdirSync(join(ROOT, 'out'), { recursive: true }); if (existsSync(TOKEN)) renameSync(TOKEN, BACKUP); });
after(() => { rmSync(TOKEN, { force: true }); if (existsSync(BACKUP)) renameSync(BACKUP, TOKEN); });

test('toEmail reads headers, the text body and the exact facts from a Gmail message', () => {
  for (const e of inbox) {
    const got = toEmail(toGmailMessage(e), 'tom.visser@example.com');
    assert.equal(got.from, e.from);
    assert.equal(got.subject, e.subject);
    assert.equal(got.body, e.body.replace(/\s+/g, ' ').trim());
    assert.deepEqual(got.facts, e.facts, e.id);
  }
});

test('toEmail falls back to stripped HTML when there is no text part', () => {
  const msg = { id: 'x', payload: { headers: [{ name: 'From', value: 'A <a@x.example>' }], parts: [
    { mimeType: 'text/html', body: { data: Buffer.from('<style>.x{}</style><p>Hello&nbsp;<b>there</b></p>').toString('base64url') } },
  ] } };
  assert.equal(toEmail(msg).body, 'Hello there');
});

test('sign-in: loopback redirect with PKCE and state, token saved, then refreshed without a browser', async () => {
  const log = console.log;
  let link;
  console.log = (...a) => { const m = String(a[0]).match(/https:\/\/accounts\.google\.com\S+/); if (m) link = m[0]; else log(...a); };
  const outcome = accessToken(SCOPES.read).then(() => 'signed in', (err) => err); // handle the rejection up front
  while (!link) await new Promise((r) => setTimeout(r, 20));
  console.log = log;
  const auth = new URL(link).searchParams;
  assert.equal(auth.get('code_challenge_method'), 'S256');
  assert.equal(auth.get('scope'), SCOPES.read);
  assert.equal(auth.get('access_type'), 'offline');
  const bad = await fetch(`${auth.get('redirect_uri')}/?code=x&state=wrong`); // a forged callback must not be accepted
  assert.match(await bad.text(), /failed/);
  assert.match(String(await outcome), /state mismatch/);

  link = undefined;
  console.log = (...a) => { const m = String(a[0]).match(/https:\/\/accounts\.google\.com\S+/); if (m) link = m[0]; else log(...a); };
  const second = accessToken(SCOPES.read);
  while (!link) await new Promise((r) => setTimeout(r, 20));
  console.log = log;
  const p = new URL(link).searchParams;
  const ok = await fetch(`${p.get('redirect_uri')}/?code=test-code&state=${p.get('state')}`);
  assert.match(await ok.text(), /Connected/);
  assert.equal(await second, 'test-access-token');
  assert.equal(JSON.parse(readFileSync(TOKEN, 'utf8')).refresh_token, 'test-refresh-token');
  assert.equal(await accessToken(SCOPES.read), 'test-access-token'); // refresh, no link printed
});

function runLabeler(args) {
  const logFile = join(ROOT, 'out', `mock-log-${Date.now()}.json`);
  const r = spawnSync(process.execPath, ['--import', join(here, 'mock-google.mjs'), join(here, '..', 'labeler.mjs'), '--gmail', ...args],
    { env: { ...process.env, MOCK_LOG: logFile }, encoding: 'utf8', timeout: 120_000 });
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : { calls: [], labels: [] };
  rmSync(logFile, { force: true });
  return { ...r, log };
}

test('dry run reads mail and classifies it with Jev, but changes nothing in Gmail', { skip: !process.env.OPENROUTER_API_KEY && 'needs OPENROUTER_API_KEY' }, () => {
  writeFileSync(TOKEN, JSON.stringify({ refresh_token: 'test-refresh-token', scope: SCOPES.read }));
  const r = runLabeler(['--max', '8']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Dry run: nothing changed in Gmail/);
  assert.ok(r.log.calls.filter((c) => c.api === 'gmail').every((c) => c.method === 'GET'), 'only GET requests in a dry run');
  assert.equal(r.log.calls.filter((c) => c.path?.match(/^\/messages\/m\d+$/)).length, 8);
});

test('--apply creates Jev/ labels and adds them to each message, and never deletes, trashes or sends', { skip: !process.env.OPENROUTER_API_KEY && 'needs OPENROUTER_API_KEY' }, () => {
  writeFileSync(TOKEN, JSON.stringify({ refresh_token: 'test-refresh-token', scope: SCOPES.modify }));
  const r = runLabeler(['--max', '8', '--apply']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Labelled 8 messages in Gmail/);
  const gmail = r.log.calls.filter((c) => c.api === 'gmail');
  const modifies = gmail.filter((c) => c.path.endsWith('/modify'));
  assert.equal(modifies.length, 8);
  const jevId = r.log.labels.find((l) => l.name === 'Jev').id;
  for (const m of modifies) { assert.ok(m.body.addLabelIds.includes(jevId)); assert.equal(m.body.removeLabelIds, undefined); }
  assert.ok(r.log.labels.slice(1).every((l) => l.name === 'Jev' || l.name.startsWith('Jev/')));
  assert.ok(!gmail.some((c) => c.method === 'DELETE' || /trash|send|batchDelete|drafts/.test(c.path)));
  assert.ok(gmail.every((c) => c.auth === 'Bearer test-access-token'));
  assert.match(r.log.calls.find((c) => c.path === '/messages').query, /-label%3Ajev|-label:jev/);
});
