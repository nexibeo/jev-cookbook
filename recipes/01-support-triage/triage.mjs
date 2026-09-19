// Recipe 01: support ticket triage.
// One Jev call per ticket answers four questions at once: which team, is it urgent,
// how frustrated is the customer, and do they ask for money back. Code then routes
// on confidence: confident answers go straight to a queue, the rest to a person.
//
//   node --env-file=.env recipes/01-support-triage/triage.mjs
import { readFileSync } from 'node:fs';
import { ask, choice, noul, score, route, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const tickets = JSON.parse(readFileSync(new URL('./tickets.json', import.meta.url), 'utf8'));

// Every option is described, because Jev matches the ticket against these words.
// The boundary between "account" and "technical" is spelled out: Jev reads literally.
const QUESTIONS = {
  department: choice('Which team should handle the ticket in `message`?', {
    billing: 'Payments, charges, invoices, refunds, price changes, cancelling a paid plan',
    technical: 'Something in the product is broken or behaves wrongly: bugs, errors, outages, API or app problems',
    account: 'Access and profile: logging in, passwords, security, email changes, admins, merging or deleting an account',
    shipping: 'Physical deliveries: tracking, couriers, damaged or wrong items, returns and exchanges, delivery addresses',
    sales: 'Buying questions from prospects: pricing, plans, discounts, demos, upgrades',
  }),
  urgent: noul('The customer in `message` says or clearly implies it needs a response within hours: an outage, lost money right now, a security breach, or a hard deadline today or tomorrow'),
  frustration: score('How frustrated is the customer in `message`?', [
    'Calm or friendly: a plain question or thanks',
    'Annoyed or inconvenienced, but civil',
    'Angry: complaints about repeated failures, threats to leave or dispute, harsh words',
  ]),
  refund: noul('The customer in `message` asks for money back (a refund, a chargeback, or the difference returned); asking for a replacement or exchange does not count'),
};

const results = await mapLimit(tickets, 8, async (t) => {
  const a = await ask({ message: t.text }, QUESTIONS);
  return {
    id: t.id,
    text: t.text,
    label: t.label,
    got: {
      department: a.department.choice,
      confidence: a.department.confidence,
      urgent: a.urgent.noul,
      frustration: a.frustration.score,
      refund: a.refund.noul,
    },
  };
});

// Routing in code, not in the prompt: the thresholds are yours to tune.
for (const r of results) {
  r.route = route(r.got.confidence, { auto: 0.8, review: 0.5 });
  r.priority = r.got.urgent >= 0.5 ? 'P1' : r.got.frustration >= 1.5 ? 'P2' : 'P3';
}

const n = results.length;
// Ambiguous tickets list every acceptable team; the rest have exactly one.
const okTeam = (r) => (r.label.acceptable ?? [r.label.department]).includes(r.got.department);
const deptOk = results.filter(okTeam);
const ambiguous = results.filter((r) => r.label.acceptable);
const auto = results.filter((r) => r.route === 'auto');
const urgentOk = results.filter((r) => (r.got.urgent >= 0.5) === r.label.urgent);
const frustOk = results.filter((r) => Math.round(r.got.frustration) === r.label.frustration);
const refundOk = results.filter((r) => (r.got.refund >= 0.5) === r.label.refund);

console.log('id   dept (conf)           urgent frust refund  route   priority');
for (const r of results) {
  const flag = okTeam(r) ? (r.label.acceptable ? '  (ambiguous: ' + r.label.acceptable.join(' or ') + ')' : '') : `  <- expected ${r.label.department}`;
  console.log(`${r.id}  ${r.got.department.padEnd(10)}(${r.got.confidence.toFixed(2)})   ${r.got.urgent.toFixed(2)}  ${r.got.frustration.toFixed(2)}  ${r.got.refund.toFixed(2)}   ${r.route.padEnd(7)} ${r.priority}${flag}`);
}
console.log(`
Department: ${deptOk.length}/${n} correct (${pct(deptOk.length, n)})
  auto-routed (confidence >= 0.8): ${auto.length}/${n}, of which ${auto.filter(okTeam).length} correct
  ambiguous tickets: mean confidence ${(ambiguous.reduce((s, r) => s + r.got.confidence, 0) / ambiguous.length).toFixed(2)} vs ${(results.filter((r) => !r.label.acceptable).reduce((s, r) => s + r.got.confidence, 0) / (n - ambiguous.length)).toFixed(2)} for clear ones
Urgent (noul >= 0.5): ${pct(urgentOk.length, n)} correct
Frustration (rounded score): ${pct(frustOk.length, n)} correct
Refund request (noul >= 0.5): ${pct(refundOk.length, n)} correct
${summary()}`);
saveResult('01-support-triage', {
  metrics: {
    department_accuracy: deptOk.length / n,
    auto_routed: auto.length,
    auto_routed_correct: auto.filter(okTeam).length,
    ambiguous_mean_confidence: ambiguous.reduce((s, r) => s + r.got.confidence, 0) / ambiguous.length,
    urgent_accuracy: urgentOk.length / n,
    frustration_accuracy: frustOk.length / n,
    refund_accuracy: refundOk.length / n,
  },
  results,
});
