// Recipe 14 test suite: six live browser tasks on public sites.
//
//   node --env-file=.env recipes/14-browser-agent/run-tests.mjs
//
// Each task is checked by code, not by the agent's own "done": the final URL must match.
import { run } from './agent.mjs';
import { saveResult } from '../../lib/jev.mjs';

const TESTS = [
  { name: 'Follow links: Coffee to Ristretto', task: 'Reach the Wikipedia article about Ristretto (a short shot of espresso) by following links.', url: 'https://en.wikipedia.org/wiki/Coffee', expect: /\/wiki\/Ristretto$/ },
  { name: 'Search and open an article', task: "Find and open the Wikipedia article about Gödel's incompleteness theorems.", url: 'https://en.wikipedia.org/wiki/Main_Page', expect: /incompleteness_theorems$/ },
  { name: 'Fill a form without submitting', task: 'On this order form choose a Large pizza with Bacon and Onion toppings and a preferred delivery time of 19:30. Leave the name, phone and email fields empty. Do not submit the form; stop once those choices are set.', url: 'https://httpbin.org/forms/post', expect: /httpbin\.org\/forms\/post$/ },
  { name: 'Site search: exact template name', task: 'Find the Cold Email template and open its template page.', url: 'https://templatesgrokbot.com', expect: /\/bot\/cold-email$/ },
  { name: 'Site search: a need, not a name', task: 'Find a Grok Bot template that helps write sales outreach emails and open its template page.', url: 'https://templatesgrokbot.com', expect: /\/bot\/(cold-email|cold-outreach|outbound-sales|sales-automator|outreachagent)$/ },
  { name: 'Jobs page to a template', task: 'Open the page listing Grok Bot templates for recruiters, then open one of those templates.', url: 'https://templatesgrokbot.com', expect: /\/bot\/[a-z0-9-]+$/ },
];

const results = [];
for (const t of TESTS) {
  const t0 = Date.now();
  try {
    const r = await run(t.task, t.url, { executablePath: process.env.CHROME_PATH });
    const passed = t.expect.test(r.final_url) && r.status !== 'stuck' && r.status !== 'max_steps';
    results.push({ name: t.name, passed, status: r.status, final_url: r.final_url, steps: r.steps.length, ms: Date.now() - t0, cost_usd: r.cost_usd, trace: r.steps });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${t.name}: ${r.status}, ${r.steps.length} steps, ${((Date.now() - t0) / 1000).toFixed(1)} s, $${r.cost_usd}  ${r.final_url}`);
  } catch (err) {
    results.push({ name: t.name, passed: false, error: err.message });
    console.log(`FAIL  ${t.name}: ${err.message}`);
  }
}
const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} tasks passed, total $${results.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(4)}`);
// The agent keeps its own cost tally (it also calls a small text model), so report that.
const cost = results.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
saveResult('14-browser-agent', {
  usage: { jev_steps: results.reduce((s, r) => s + (r.steps ?? 0), 0), cost_usd: Number(cost.toFixed(6)), note: 'cost includes the text model used for typing' },
  metrics: { passed: `${passed}/${results.length}` },
  results,
});
