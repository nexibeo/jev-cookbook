// Recipe 11: triaging log lines and alerts.
//
//   node --env-file=.env recipes/11-log-triage/triage-logs.mjs
//
// Log levels lie: a "WARN" can be a brute-force attack and an "ERROR" can be a retry that
// already succeeded. One Jev call per line reads the message itself and answers three
// questions: which part of the system, how bad, and does a person need to act. Code turns
// that into a page / ticket / ignore decision. At ~0.4 s and a fraction of a cent per
// line, it can run on every new error signature.
import { readFileSync } from 'node:fs';
import { ask, choice, noul, score, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const logs = JSON.parse(readFileSync(new URL('./logs.json', import.meta.url), 'utf8'));

const QUESTIONS = {
  component: choice('Which part of the system does the log line in `log` come from or concern?', {
    api: 'The HTTP API and application servers',
    database: 'The main database: connections, queries, locks',
    auth: 'Sign-in, sessions, tokens and access control',
    payments: 'Payment processing and billing integrations',
    frontend: 'The web front end running in browsers',
    jobs: 'Background and scheduled jobs',
    email: 'Sending email',
    search: 'The search cluster and indexing',
    infrastructure: 'Servers, containers, disks, certificates and deployments',
  }),
  severity: score('How serious is the event in `log` for users or the business?', [
    'Routine: normal operation, nothing wrong',
    'Minor: a hiccup that recovered or a slow trend worth watching',
    'Significant: some users affected, or a problem that will get worse within days',
    'Critical: an outage, data at risk, money failing or a security attack in progress',
  ]),
  actionable: noul('An engineer needs to do something about the event in `log`; it will not resolve by itself through retries'),
  // The same "how bad" judgment split into concrete yes/no questions (composite scoring).
  // A single Score tends to bunch in the middle; specific facts are easier to judge.
  'critical:outage': noul('`log` shows users unable to use part of the product right now (errors, crashes or timeouts for many requests)'),
  'critical:security': noul('`log` shows a likely security attack in progress or a leaked or broken secret'),
  'critical:data': noul('`log` shows data at risk of loss or corruption, or storage about to run out'),
  'critical:money': noul('`log` shows the business failing to take or record payments'),
};

const results = await mapLimit(logs, 8, async ({ line, label }) => {
  const a = await ask({ log: line }, QUESTIONS);
  const sev = a.severity.score, act = a.actionable.noul >= 0.5;
  const critical = Math.max(...['outage', 'security', 'data', 'money'].map((k) => a[`critical:${k}`].noul));
  return { line, label, component: a.component.choice, severity: sev, actionable: a.actionable.noul, critical,
    // Two response policies, both in code: one on the Score, one on the composite Nouls.
    decision: act && sev >= 2.5 ? 'page on-call' : act ? 'open ticket' : 'ignore',
    decision_composite: act && critical >= 0.6 ? 'page on-call' : act ? 'open ticket' : 'ignore' };
});

for (const r of results) {
  const flags = [r.component !== r.label.component && `component ${r.label.component}`, Math.round(r.severity) !== r.label.severity && `severity ${r.label.severity}`, (r.actionable >= 0.5) !== r.label.actionable && `actionable ${r.label.actionable}`].filter(Boolean);
  console.log(`${r.decision.padEnd(13)} ${r.component.padEnd(15)} sev ${r.severity.toFixed(1)}  ${r.line.slice(21, 95)}${flags.length ? `   <- expected ${flags.join(', ')}` : ''}`);
}
const n = results.length;
const comp = results.filter((r) => r.component === r.label.component).length;
const sev = results.filter((r) => Math.round(r.severity) === r.label.severity).length;
const sevNear = results.filter((r) => Math.abs(r.severity - r.label.severity) <= 1).length;
const act = results.filter((r) => (r.actionable >= 0.5) === r.label.actionable).length;
const critical = results.filter((r) => r.label.severity === 3);
const paging = (key) => ({
  critical_paged: critical.filter((r) => r[key] === 'page on-call').length,
  non_critical_paged: results.filter((r) => r.label.severity < 3 && r[key] === 'page on-call').length,
});
const scorePolicy = paging('decision'), compositePolicy = paging('decision_composite');
console.log(`\nComponent ${pct(comp, n)}, severity exact ${pct(sev, n)} (within one level ${pct(sevNear, n)}), actionable ${pct(act, n)}`);
console.log(`Paging on the severity Score >= 2.5:   ${scorePolicy.critical_paged}/${critical.length} critical events paged, ${scorePolicy.non_critical_paged} non-critical paged`);
console.log(`Paging on any critical Noul >= 0.6:    ${compositePolicy.critical_paged}/${critical.length} critical events paged, ${compositePolicy.non_critical_paged} non-critical paged`);
for (const r of results.filter((x) => (x.label.severity === 3) !== (x.decision_composite === 'page on-call'))) console.log(`  composite ${r.label.severity === 3 ? 'missed' : 'extra page'}: ${r.line.slice(21, 100)}`);
console.log(summary());
saveResult('11-log-triage', { metrics: { component_accuracy: comp / n, severity_exact: sev / n, severity_within_one: sevNear / n, actionable_accuracy: act / n, critical_events: critical.length, score_policy: scorePolicy, composite_policy: compositePolicy }, results });
