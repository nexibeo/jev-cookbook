// Run every recipe one after another and print each one's headline metrics.
// Recipe 14 (the browser agent) needs a browser, so run it separately: npm run 14.
// Recipe 15 runs on its sample inbox here; `npm run gmail` connects to a real mailbox.
//
//   npm run all
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/jev.mjs';

const scripts = {
  '01-support-triage': 'triage.mjs', '02-database-indexing': 'index-products.mjs', '03-file-organizer': 'organize.mjs',
  '04-multi-label-tagging': 'tag.mjs', '05-taxonomy-tree': 'classify-tree.mjs', '06-dedupe-records': 'dedupe.mjs',
  '07-pii-column-scanner': 'scan.mjs', '08-transaction-categorizer': 'categorize.mjs', '09-extract-by-picking': 'extract.mjs',
  '10-search-rerank': 'search.mjs', '11-log-triage': 'triage-logs.mjs', '12-moderation-guardrails': 'moderate.mjs',
  '13-lead-scoring': 'score-leads.mjs', '15-gmail-labeler': 'labeler.mjs',
};
let cost = 0;
for (const dir of readdirSync(join(ROOT, 'recipes')).filter((d) => scripts[d]).sort()) {
  const args = ['--disable-warning=ExperimentalWarning', join(ROOT, 'recipes', dir, scripts[dir])];
  if (dir === '02-database-indexing') args.push('--fresh');
  process.stdout.write(`${dir} ... `);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env: process.env, encoding: 'utf8' });
  if (r.status !== 0) { console.log(`FAILED\n${r.stderr.slice(-800)}`); continue; }
  const saved = JSON.parse(readFileSync(join(ROOT, 'results', `${dir}.json`), 'utf8'));
  cost += saved.usage.cost_usd;
  console.log(`$${saved.usage.cost_usd.toFixed(4)}  ${JSON.stringify(saved.metrics).slice(0, 180)}`);
}
console.log(`\nTotal: $${cost.toFixed(4)}`);
