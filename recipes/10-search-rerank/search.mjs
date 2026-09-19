// Recipe 10: semantic re-ranking on top of plain keyword search.
//
//   node --env-file=.env recipes/10-search-rerank/search.mjs
//
// Keyword search (here a tiny BM25-style scorer; in real life SQLite FTS5, Postgres
// full-text or Elasticsearch) is fast and cheap but misses paraphrases: "stop paying"
// never mentions "cancel". Jev re-ranks the top candidates by meaning with one Choice,
// and its "none" option answers the question search engines can't: "we have no article
// for this". The recipe compares keyword-only and keyword + Jev on the same queries.
import { readFileSync } from 'node:fs';
import { ask, choice, ranked, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const { articles, queries } = JSON.parse(readFileSync(new URL('./help-center.json', import.meta.url), 'utf8'));
const TOP_K = 12;

// A deliberately simple keyword scorer: term frequency x inverse document frequency.
const tokens = (s) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => t.length > 2 && !STOP.has(t)) ?? [];
const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'can', 'how', 'with', 'are', 'our', 'from', 'this', 'what', 'does', 'will', 'get', 'any', 'all', 'has', 'who', 'only']);
const docs = Object.entries(articles).map(([id, text]) => ({ id, text, terms: tokens(`${id.replace(/-/g, ' ')} ${text}`) }));
const df = {};
for (const d of docs) for (const t of new Set(d.terms)) df[t] = (df[t] ?? 0) + 1;
const keywordSearch = (q) => docs
  .map((d) => ({ id: d.id, text: d.text, score: tokens(q).reduce((s, t) => s + d.terms.filter((x) => x === t).length * Math.log(1 + docs.length / (df[t] ?? docs.length)), 0) }))
  .sort((a, b) => b.score - a.score);

const results = await mapLimit(queries, 8, async ({ q, answer }) => {
  const hits = keywordSearch(q);
  // Candidates for Jev: the keyword top-k, topped up with the rest of the list so a query
  // with zero keyword overlap still has something to choose from.
  const candidates = hits.slice(0, TOP_K);
  const pick = (list) => choice('Which help article answers the user question in `question`?', {
    ...Object.fromEntries(list.map((c) => [c.id, c.text])),
    none: 'None of these articles answers the question',
  });
  // Both variants in ONE call: the re-ranked top-k, and all 30 articles (a small corpus
  // fits in one Choice, so retrieval can be skipped entirely).
  const a = await ask({ question: q }, { best: pick(candidates), best_all: pick(docs) });
  return {
    q, answer,
    keyword_top1: hits[0].score > 0 ? hits[0].id : null,
    answer_in_candidates: answer === null || candidates.some((c) => c.id === answer),
    jev_top1: a.best.choice === 'none' ? null : a.best.choice,
    jev_confidence: a.best.confidence,
    jev_top3: ranked(a.best).slice(0, 3).map(([k]) => k),
    jev_all_top1: a.best_all.choice === 'none' ? null : a.best_all.choice,
  };
});

for (const r of results) {
  const k = r.keyword_top1 === r.answer ? 'ok ' : 'MISS';
  const j = r.jev_top1 === r.answer ? 'ok ' : 'MISS';
  console.log(`keyword ${k} ${String(r.keyword_top1).padEnd(20)} jev ${j} ${String(r.jev_top1).padEnd(20)} (${r.jev_confidence.toFixed(2)})  "${r.q}"`);
}
const n = results.length;
const kw = results.filter((r) => r.keyword_top1 === r.answer).length;
const jv = results.filter((r) => r.jev_top1 === r.answer).length;
const noneRight = results.filter((r) => r.answer === null && r.jev_top1 === null).length;
const inCand = results.filter((r) => r.answer_in_candidates).length;
const all = results.filter((r) => r.jev_all_top1 === r.answer).length;
console.log(`\nTop-1 correct: keyword ${kw}/${n} (${pct(kw, n)}), keyword + Jev ${jv}/${n} (${pct(jv, n)}), Jev over all ${docs.length} articles ${all}/${n} (${pct(all, n)})`);
for (const r of results.filter((x) => x.jev_all_top1 !== x.answer)) console.log(`  all-articles miss: "${r.q}" -> ${r.jev_all_top1} (expected ${r.answer})`);
console.log(`Unanswerable questions recognised by Jev: ${noneRight}/${results.filter((r) => r.answer === null).length}`);
console.log(`Answer present in the keyword top ${TOP_K}: ${inCand}/${n} (re-ranking can't find what retrieval missed)`);
console.log(summary());
saveResult('10-search-rerank', { metrics: { keyword_top1: kw / n, jev_top1: jv / n, jev_all_articles_top1: all / n, unanswerable_recognised: noneRight, answer_in_candidates: inCand / n, top_k: TOP_K }, results });
