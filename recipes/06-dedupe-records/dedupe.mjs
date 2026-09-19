// Recipe 06: duplicate detection (entity matching) for company records.
//
//   node --env-file=.env recipes/06-dedupe-records/dedupe.mjs
//
// One Score question per candidate pair, with three levels that map straight onto
// actions: keep separate, send to a person, merge. Exact comparisons are code's job
// (Jev reads text and is weak at comparing numbers and strings character by character),
// so code normalises websites and phone numbers and passes the results in as facts.
// The recipe runs twice, with and without those facts, to show what they add.
import { readFileSync } from 'node:fs';
import { ask, score, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const pairs = JSON.parse(readFileSync(new URL('./pairs.json', import.meta.url), 'utf8'));

const domain = (w) => w.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
const digits = (p) => p.replace(/\D/g, '').slice(-9); // last 9 digits: ignores country and trunk prefixes
function facts(a, b) {
  return {
    same_website_domain: a.website && b.website ? domain(a.website) === domain(b.website) : 'unknown (a website is missing)',
    same_phone_number: a.phone && b.phone ? digits(a.phone) === digits(b.phone) : 'unknown (a phone is missing)',
  };
}

const MATCH = score('Are `record_a` and `record_b` the same organisation at the same location?', [
  'Different organisations, or different branches or locations of one company',
  'Unsure: they could be the same organisation and place, but the evidence conflicts or is thin',
  'The same organisation at the same location, written differently: safe to merge',
]);
const RULES = 'Names may be abbreviated, translated or use "&" versus "and". Parent companies and subsidiaries are different organisations. Branches of a chain at different addresses are different.';

// Leave a review band around the middle: scores close to a cut-off can shift a little
// between runs, and a wrong merge is expensive to undo.
const decide = (s) => (s >= 1.5 ? 'merge' : s < 0.4 ? 'keep separate' : 'review');
const runs = {};
for (const variant of ['with code facts', 'records only']) {
  const results = await mapLimit(pairs, 8, async (p) => {
    const state = { record_a: p.a, record_b: p.b, rules: RULES, ...(variant === 'with code facts' ? { checked_by_code: facts(p.a, p.b) } : {}) };
    const a = await ask(state, { match: MATCH });
    return { a: p.a.name, b: p.b.name, same: p.same, score: a.match.score, confidence: a.match.confidence, decision: decide(a.match.score) };
  });
  const merged = results.filter((r) => r.decision === 'merge');
  const separate = results.filter((r) => r.decision === 'keep separate');
  const review = results.filter((r) => r.decision === 'review');
  const wrong = results.filter((r) => (r.decision === 'merge' && !r.same) || (r.decision === 'keep separate' && r.same));
  runs[variant] = {
    automatic: merged.length + separate.length, review: review.length, wrong_automatic: wrong.length,
    merge_precision: merged.length ? merged.filter((r) => r.same).length / merged.length : null,
    results,
  };
  console.log(`\n${variant.toUpperCase()}: ${merged.length} merged, ${separate.length} kept separate, ${review.length} to review; ${wrong.length} wrong automatic decisions`);
  for (const r of results) {
    const mark = (r.decision === 'merge' && !r.same) || (r.decision === 'keep separate' && r.same) ? '  WRONG' : r.decision === 'review' ? '  (review)' : '';
    console.log(`  ${r.score.toFixed(2)} ${r.decision.padEnd(13)} ${r.a} | ${r.b}${mark}`);
  }
}
console.log(`\n${summary()}`);
saveResult('06-dedupe-records', { metrics: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, { ...v, results: undefined }])), runs });
