// A small client for TypeSafe's Jev decision model on OpenRouter, shared by every recipe.
//
// Jev is not a chat model. You send a `state` (the data) and named `questions`
// (Choice, Noul or Score), and it returns typed answers with probabilities.
// OpenRouter serves it at /api/alpha/decisions, not at /api/v1/chat/completions.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// "~typesafe/jev-latest" always points to the newest Jev. The tilde matters:
// "typesafe/jev-latest" does not exist. Pin e.g. "typesafe/jev-1.13" with JEV_MODEL.
export const MODEL = process.env.JEV_MODEL || '~typesafe/jev-latest';
const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const RETRY = new Set([408, 429, 500, 502, 503, 524, 529]);

/** Running totals for everything this process asked Jev. */
export const usage = { calls: 0, inputTokens: 0, cost: 0, models: new Set(), ms: [] };

/** Ask Jev. Returns the `answers` map, keyed by your question ids. */
export async function ask(state, questions, { model = MODEL, retries = 4 } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.');
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'jev-cookbook' },
        body: JSON.stringify({ model, state, questions }),
      });
    } catch (err) { // connection dropped before a response: safe to retry, nothing happened
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      throw err;
    }
    if (RETRY.has(res.status) && attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    usage.calls++;
    usage.inputTokens += json.usage?.input_tokens ?? 0;
    usage.cost += json.usage?.cost ?? 0;
    usage.models.add(json.model);
    usage.ms.push(Date.now() - t0);
    return json.answers;
  }
}

// Question builders. `instructions` and `criteria` may be strings or JSON.
export const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
export const noul = (instructions, criteria) => ({ type: 'noul', instructions, ...(criteria ? { criteria } : {}) });
export const score = (instructions, levels) => ({ type: 'score', instructions, criteria: levels });

/** Options of a Choice or Score answer, best first: [[option, probability], ...]. */
export const ranked = (answer) => Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1]);

/**
 * Turn one-Noul-per-label answers into a label list: every label at or above `threshold`,
 * best first, at most `max`, and at least `min` (the best ones) so an item is never unlabeled.
 * Question ids look like `${prefix}${label}`, e.g. "tag:outdoor".
 */
export function pickLabels(answers, prefix, { threshold = 0.5, max = Infinity, min = 0 } = {}) {
  const scored = Object.entries(answers)
    .filter(([id]) => id.startsWith(prefix))
    .map(([id, a]) => [id.slice(prefix.length), a.noul])
    .sort((a, b) => b[1] - a[1]);
  const kept = scored.filter(([, p]) => p >= threshold).slice(0, max);
  return (kept.length >= min ? kept : scored.slice(0, min)).map(([label]) => label);
}

/** Route on confidence: act automatically, ask a person, or don't act. */
export function route(confidence, { auto = 0.8, review = 0.5 } = {}) {
  return confidence >= auto ? 'auto' : confidence >= review ? 'review' : 'hold';
}

/** Run `fn` over `items` with at most `limit` requests in flight. Keeps input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');

/** Precision / recall / F1 over label sets: pairs = [[predicted[], expected[]], ...]. */
export function prf(pairs) {
  let hit = 0, got = 0, want = 0;
  for (const [p, e] of pairs) { hit += p.filter((x) => e.includes(x)).length; got += p.length; want += e.length; }
  const precision = got ? hit / got : 0, recall = want ? hit / want : 0;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}
export const fmtPrf = ({ precision, recall, f1 }) =>
  `precision ${Math.round(precision * 100)}%, recall ${Math.round(recall * 100)}%, F1 ${Math.round(f1 * 100)}%`;

/** One line about cost and speed, for the end of every recipe. */
export function summary() {
  const ms = [...usage.ms].sort((a, b) => a - b);
  const median = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  return `${usage.calls} Jev calls, ${usage.inputTokens.toLocaleString('en-US')} input tokens, $${usage.cost.toFixed(4)}, median ${median} ms per call (${[...usage.models].join(', ') || MODEL})`;
}

/** Save a recipe's measured output under results/, so the README numbers can be checked. */
export function saveResult(name, data) {
  mkdirSync(join(ROOT, 'results'), { recursive: true });
  const file = join(ROOT, 'results', `${name}.json`);
  const ms = [...usage.ms].sort((a, b) => a - b);
  writeFileSync(file, JSON.stringify({
    recipe: name,
    ran_at: new Date().toISOString(),
    model_requested: MODEL,
    answered_by: [...usage.models],
    usage: { calls: usage.calls, input_tokens: usage.inputTokens, cost_usd: Number(usage.cost.toFixed(6)), median_ms: ms[Math.floor(ms.length / 2)] ?? null },
    ...data,
  }, null, 2) + '\n');
  return file;
}

/** Minimal CSV parser (quoted fields, doubled quotes, CRLF). Returns objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, '').trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
