// Recipe 04: multi-label tagging from a fixed vocabulary.
//
//   node --env-file=.env recipes/04-multi-label-tagging/tag.mjs
//
// Each article can have several tags, so a single Choice is the wrong tool: it always
// picks exactly one. Instead, ask one yes/no question (Noul) per tag, all in one call,
// and let code keep the tags above a threshold. The threshold is a dial between
// precision and recall; this recipe measures several settings on the same answers.
import { readFileSync } from 'node:fs';
import { ask, noul, pickLabels, mapLimit, prf, fmtPrf, summary, saveResult } from '../../lib/jev.mjs';

const articles = JSON.parse(readFileSync(new URL('./articles.json', import.meta.url), 'utf8'));

// Say what each tag means, including what does NOT count: Jev reads literally.
const VOCABULARY = {
  'programming': 'teaches or discusses writing code',
  'databases': 'is about databases, SQL, schemas or data storage',
  'cloud': 'is about cloud platforms or infrastructure (AWS, Kubernetes, Terraform, managed services)',
  'devops': 'is about deploying, operating, scaling or monitoring software in production',
  'cost-saving': 'is mainly about spending less money',
  'startups': 'is about founding, funding or growing an early-stage company',
  'management': 'is about managing or leading people',
  'careers': "is about an individual's job search, pay, promotion or career change",
  'workplace': 'is about working life: offices, remote work, wellbeing or habits at work',
  'health': 'is about physical health, fitness, sleep or exercise',
  'cooking': 'is about cooking or recipes',
  'travel': 'is about travelling to places',
  'beginner': 'is written for complete beginners to its subject',
};
const QUESTIONS = Object.fromEntries(Object.entries(VOCABULARY).map(([tag, meaning]) =>
  [`tag:${tag}`, noul(`The article in \`article\` ${meaning}. Answer yes only if this is a main theme, not a passing mention.`)]));

const answered = await mapLimit(articles, 8, async (x) => ({
  x,
  a: await ask({ article: { title: x.title, summary: x.summary } }, QUESTIONS),
}));

console.log('Threshold sweep (same answers, different cut-offs; at least one tag per article):');
const sweep = {};
for (const threshold of [0.3, 0.5, 0.7, 0.9]) {
  const pairs = answered.map(({ x, a }) => [pickLabels(a, 'tag:', { threshold, min: 1 }), x.tags]);
  sweep[threshold] = prf(pairs);
  console.log(`  >= ${threshold}: ${fmtPrf(sweep[threshold])}`);
}
const topK = prf(answered.map(({ x, a }) => [pickLabels(a, 'tag:', { threshold: 0, max: x.tags.length }), x.tags]));
console.log(`  top-k (k = the true number of tags, an upper bound): ${fmtPrf(topK)}`);

console.log('\nTags at threshold 0.5:');
for (const { x, a } of answered) {
  const got = pickLabels(a, 'tag:', { threshold: 0.5, min: 1 });
  const extra = got.filter((t) => !x.tags.includes(t)), missing = x.tags.filter((t) => !got.includes(t));
  console.log(`  ${x.id} ${got.join(', ')}${extra.length ? `   +${extra.join(' +')}` : ''}${missing.length ? `   -${missing.join(' -')}` : ''}`);
}
console.log(summary());
saveResult('04-multi-label-tagging', {
  metrics: { sweep, top_k: topK },
  results: answered.map(({ x, a }) => ({ id: x.id, expected: x.tags, nouls: Object.fromEntries(Object.keys(VOCABULARY).map((t) => [t, a[`tag:${t}`].noul])) })),
});
