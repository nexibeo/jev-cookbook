// Test preload: a fake Google (OAuth token endpoint + Gmail API) built from sample-inbox.json.
// Requests to any other host (such as Jev on OpenRouter) go through unchanged.
//
//   node --import ./recipes/15-gmail-labeler/test/mock-google.mjs recipes/15-gmail-labeler/labeler.mjs --gmail
//
// Every Gmail call is recorded to the file in $MOCK_LOG when the process exits.
import { readFileSync, writeFileSync } from 'node:fs';

const inbox = JSON.parse(readFileSync(new URL('../sample-inbox.json', import.meta.url), 'utf8'));
const YOU = 'tom.visser@example.com';
const enc = (s) => Buffer.from(s, 'utf8').toString('base64url');

/** One sample email in the shape Gmail's API returns with format=full. */
export function toGmailMessage(e) {
  const headers = [
    { name: 'From', value: e.from },
    { name: 'To', value: e.facts.to_you_directly ? `Tom Visser <${YOU}>` : 'undisclosed-recipients:;' },
    { name: 'Subject', value: e.subject },
    { name: 'Date', value: 'Mon, 22 Sep 2026 09:14:00 +0000' },
  ];
  if (e.facts.list_unsubscribe) headers.push({ name: 'List-Unsubscribe', value: '<mailto:unsubscribe@example.com>' });
  if (e.facts.reply_to_other_domain) headers.push({ name: 'Reply-To', value: 'support@collect-details.example' });
  const parts = [
    { mimeType: 'text/plain', body: { data: enc(e.body) } },
    { mimeType: 'text/html', body: { data: enc(`<html><style>p{}</style><p>${e.body}</p></html>`) } },
  ];
  if (e.facts.calendar_invite) parts.push({ mimeType: 'text/calendar', filename: 'invite.ics', body: { attachmentId: 'att1' } });
  return { id: e.id, snippet: e.body.slice(0, 90), payload: { mimeType: 'multipart/alternative', headers, parts } };
}

const labels = [{ id: 'INBOX', name: 'INBOX' }];
const calls = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = init.method ?? 'GET';
  if (url.host === 'oauth2.googleapis.com') {
    const p = new URLSearchParams(init.body);
    calls.push({ api: 'token', grant_type: p.get('grant_type'), has_verifier: Boolean(p.get('code_verifier')) });
    return json({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600, scope: process.env.MOCK_SCOPE ?? 'https://www.googleapis.com/auth/gmail.modify' });
  }
  if (url.host !== 'gmail.googleapis.com') return realFetch(input, init);
  const path = url.pathname.replace('/gmail/v1/users/me', '');
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ api: 'gmail', method, path, query: url.search, body, auth: init.headers?.Authorization });
  if (path === '/profile') return json({ emailAddress: YOU });
  if (path === '/messages' && method === 'GET') {
    const max = Number(url.searchParams.get('maxResults'));
    return json({ messages: inbox.slice(0, max).map((e) => ({ id: e.id, threadId: e.id })) });
  }
  if (path === '/labels' && method === 'GET') return json({ labels });
  if (path === '/labels' && method === 'POST') { const l = { id: `Label_${labels.length}`, name: body.name }; labels.push(l); return json(l); }
  const m = path.match(/^\/messages\/([^/]+)(\/modify)?$/);
  if (m && !m[2]) return json(toGmailMessage(inbox.find((e) => e.id === m[1])));
  if (m && m[2]) return json({ id: m[1], labelIds: body.addLabelIds });
  return json({ error: `mock has no route for ${method} ${path}` }, 404);
};

process.on('exit', () => { if (process.env.MOCK_LOG) writeFileSync(process.env.MOCK_LOG, JSON.stringify({ calls, labels }, null, 1)); });
