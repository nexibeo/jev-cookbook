// A tiny Gmail client with no dependencies: Google OAuth for desktop apps (loopback + PKCE)
// and the few Gmail REST calls the labeler needs.
//
// You bring your own OAuth client (see README): GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.
// The refresh token is stored in out/gmail-token.json, which is gitignored. Delete that file,
// or remove access at https://myaccount.google.com/permissions, to disconnect.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/jev.mjs';

export const SCOPES = {
  read: 'https://www.googleapis.com/auth/gmail.readonly', // dry runs only read
  modify: 'https://www.googleapis.com/auth/gmail.modify', // --apply adds labels; nothing is ever deleted or sent
};
const TOKEN_FILE = join(ROOT, 'out', 'gmail-token.json');
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* the URL is printed anyway */ }
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${json.error_description || json.error || res.status}`);
  return json;
}

/** Sign in once in the browser; later runs reuse the stored refresh token. */
async function authorize(scope) {
  const { GMAIL_CLIENT_ID: client_id, GMAIL_CLIENT_SECRET: client_secret } = process.env;
  if (!client_id || !client_secret) throw new Error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env (see recipes/15-gmail-labeler/README.md).');
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const redirect_uri = `http://127.0.0.1:${server.address().port}`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id, redirect_uri, response_type: 'code', scope, state, access_type: 'offline', prompt: 'consent',
    code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  console.log(`\nOpen this link to let the labeler ${scope === SCOPES.modify ? 'read your mail and add labels' : 'read your mail'}:\n${url}\n`);
  if (!process.env.JEV_NO_BROWSER) openInBrowser(url); // tests set JEV_NO_BROWSER and follow the link themselves
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sign-in timed out after 5 minutes.')), 300_000);
    server.on('request', (req, res) => {
      const q = new URL(req.url, redirect_uri).searchParams;
      if (!q.get('code') && !q.get('error')) { res.writeHead(404).end(); return; }
      const ok = q.get('state') === state && q.get('code');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(ok ? 'Connected. You can close this tab and return to the terminal.' : 'Sign-in failed. Return to the terminal.');
      clearTimeout(timer);
      ok ? resolve(q.get('code')) : reject(new Error(`Sign-in failed: ${q.get('error') || 'state mismatch'}`));
    });
  }).finally(() => server.close());
  const token = await tokenRequest({ client_id, client_secret, code, code_verifier: verifier, redirect_uri, grant_type: 'authorization_code' });
  mkdirSync(join(ROOT, 'out'), { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: token.refresh_token, scope: token.scope }, null, 2), { mode: 0o600 });
  return token.access_token;
}

/** An access token with at least `scope`, signing in again only when needed. */
export async function accessToken(scope) {
  if (existsSync(TOKEN_FILE)) {
    const saved = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    const covers = saved.scope?.split(' ').some((s) => s === scope || s === SCOPES.modify);
    if (saved.refresh_token && covers) {
      try {
        const t = await tokenRequest({ client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET, refresh_token: saved.refresh_token, grant_type: 'refresh_token' });
        return t.access_token;
      } catch { /* revoked or expired: sign in again below */ }
    }
  }
  return authorize(scope);
}

export function client(token) {
  const call = async (path, init = {}) => {
    const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    if (!res.ok) throw new Error(`Gmail ${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  return {
    profile: () => call('/profile'),
    list: (q, max) => call(`/messages?${new URLSearchParams({ q, maxResults: String(max) })}`).then((r) => r.messages ?? []),
    get: (id) => call(`/messages/${id}?format=full`),
    labels: () => call('/labels').then((r) => r.labels ?? []),
    createLabel: (name) => call('/labels', { method: 'POST', body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) }),
    addLabels: (id, addLabelIds) => call(`/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds }) }),
  };
}

// ---------- turning a Gmail API message into the labeler's email shape ----------

const decode = (data) => Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const walk = (part, out = []) => { out.push(part); for (const p of part.parts ?? []) walk(p, out); return out; };
const domainOf = (addr) => (addr.match(/@([^>\s]+)/)?.[1] ?? '').toLowerCase();
const baseDomain = (d) => d.split('.').slice(-2).join('.');

/**
 * Headers, a plain-text body (HTML stripped if there is no text part) and the facts code can
 * check exactly: a List-Unsubscribe header, a calendar invite, a Reply-To on another domain,
 * and whether you are in To (not Cc, Bcc or a mailing list).
 */
export function toEmail(msg, you) {
  const headers = Object.fromEntries((msg.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const parts = walk(msg.payload ?? {});
  const text = parts.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  const html = parts.find((p) => p.mimeType === 'text/html' && p.body?.data);
  let body = text ? decode(text.body.data) : html ? decode(html.body.data).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ') : msg.snippet ?? '';
  body = body.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const from = headers.from ?? '';
  const replyTo = headers['reply-to'];
  return {
    id: msg.id,
    from,
    subject: headers.subject ?? '(no subject)',
    date: headers.date,
    facts: {
      to_you_directly: you ? (headers.to ?? '').toLowerCase().includes(you.toLowerCase()) : null,
      list_unsubscribe: Boolean(headers['list-unsubscribe']),
      calendar_invite: parts.some((p) => p.mimeType === 'text/calendar' || /\.ics$/i.test(p.filename ?? '')),
      reply_to_other_domain: replyTo ? baseDomain(domainOf(replyTo)) !== baseDomain(domainOf(from)) : false,
    },
    body,
  };
}
