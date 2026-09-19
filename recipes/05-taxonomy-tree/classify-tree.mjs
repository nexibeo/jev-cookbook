// Recipe 05: classifying into a category tree.
//
//   node --env-file=.env recipes/05-taxonomy-tree/classify-tree.mjs
//
// Two ways to reach a leaf in an 8 x 6 taxonomy:
//   flat:   one Choice over all 48 leaves (fine while the list stays under 255 options)
//   tree:   a Choice over the 8 parents, keep the best 2 (a "beam"), then a Choice over
//           only their 12 leaves. Needed when the leaves number more than 255, and it lets
//           each question describe its options in more detail.
// Both run on the same products so you can compare accuracy and cost.
import { readFileSync } from 'node:fs';
import { ask, choice, ranked, mapLimit, pct, usage, summary, saveResult } from '../../lib/jev.mjs';

const { taxonomy, products } = JSON.parse(readFileSync(new URL('./taxonomy.json', import.meta.url), 'utf8'));
const leaves = Object.fromEntries(Object.entries(taxonomy).flatMap(([parent, p]) =>
  Object.entries(p.leaves).map(([leaf, about]) => [`${parent}/${leaf}`, `${p.about} > ${about}`])));
const BEAM = 2;

async function flat(title) {
  const a = await ask({ product: title }, { leaf: choice('Which category does the product in `product` belong to?', leaves) });
  return { leaf: a.leaf.choice, confidence: a.leaf.confidence, top3: ranked(a.leaf).slice(0, 3).map(([k]) => k) };
}

async function tree(title) {
  const parents = Object.fromEntries(Object.entries(taxonomy).map(([k, p]) => [k, `${p.about}: ${Object.values(p.leaves).join('; ')}`]));
  const a1 = await ask({ product: title }, { parent: choice('Which department does the product in `product` belong to?', parents) });
  const beam = ranked(a1.parent).slice(0, BEAM).map(([k]) => k);
  const options = Object.fromEntries(Object.entries(leaves).filter(([k]) => beam.includes(k.split('/')[0])));
  const a2 = await ask({ product: title }, { leaf: choice('Which category does the product in `product` belong to?', options) });
  return { leaf: a2.leaf.choice, confidence: a2.leaf.confidence, beam, top3: ranked(a2.leaf).slice(0, 3).map(([k]) => k) };
}

const out = {};
for (const [name, fn] of [['flat', flat], ['tree', tree]]) {
  const before = { calls: usage.calls, cost: usage.cost, tokens: usage.inputTokens };
  const results = await mapLimit(products, 8, async (p) => ({ title: p.title, expected: p.leaf, ...(await fn(p.title)) }));
  const ok = results.filter((r) => r.leaf === r.expected);
  const top3 = results.filter((r) => r.top3.includes(r.expected));
  const parentOk = results.filter((r) => r.leaf.split('/')[0] === r.expected.split('/')[0]);
  out[name] = {
    accuracy: ok.length / results.length, top3: top3.length / results.length, parent_accuracy: parentOk.length / results.length,
    calls: usage.calls - before.calls, input_tokens: usage.inputTokens - before.tokens, cost_usd: usage.cost - before.cost,
    misses: results.filter((r) => r.leaf !== r.expected).map((r) => `${r.title}: ${r.leaf} (expected ${r.expected})`),
  };
  console.log(`\n${name.toUpperCase()}: leaf ${ok.length}/${results.length} (${pct(ok.length, results.length)}), in top 3 ${pct(top3.length, results.length)}, right department ${pct(parentOk.length, results.length)}`);
  console.log(`  ${out[name].calls} calls, ${out[name].input_tokens.toLocaleString('en-US')} input tokens, $${out[name].cost_usd.toFixed(4)}`);
  for (const m of out[name].misses) console.log(`  miss: ${m}`);
}
console.log(`\n${summary()}`);
saveResult('05-taxonomy-tree', { metrics: out });
