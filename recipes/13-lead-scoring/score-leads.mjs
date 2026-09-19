// Recipe 13: lead scoring with composite scores.
//
//   node --env-file=.env recipes/13-lead-scoring/score-leads.mjs
//
// "How good is this lead?" is several judgments in one. Asking it directly gives a number
// nobody can explain. Instead, ask one Score per dimension (fit, authority, need, timing)
// plus a yes/no for budget, and combine them with weights in code. When sales disagrees
// with the ranking, you change a weight, not a prompt, and every score is explainable.
import { readFileSync } from 'node:fs';
import { ask, score, noul, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const { ideal_customer, leads } = JSON.parse(readFileSync(new URL('./leads.json', import.meta.url), 'utf8'));

const QUESTIONS = {
  fit: score('How well does the company in `lead` match `ideal_customer`?', [
    'Not a business that could buy: a student, journalist, affiliate, spam or unknown',
    'A business, but outside the target: too small, or a different industry',
    'Close to the target: right industry or right size, but not both clearly',
    'A clear match: logistics, delivery or fleet operations with roughly 50 to 1,000 employees',
  ]),
  authority: score("How much buying influence does the person in `lead` have?", [
    'None: student, intern, outsider, or unknown',
    'Researcher or analyst who can recommend',
    'Manager who runs the team that would use it',
    'Executive or budget owner: VP, director, CTO, owner of the decision',
  ]),
  need: score('How clearly does `lead` describe a problem our product solves?', [
    'No problem described',
    'General interest or information gathering',
    'A specific pain the product addresses',
  ]),
  timing: score('How soon does `lead` want to act?', [
    'No timeline, or next year or later',
    'This quarter or within a few months',
    'Within weeks, or a meeting requested now',
  ]),
  budget: noul('`lead` says money is approved, budgeted or set aside'),
};
// Weights live in code. Each dimension is normalised to 0-1 before weighting.
const WEIGHTS = { fit: 0.35, authority: 0.2, need: 0.2, timing: 0.15, budget: 0.1 };
const LEVELS = { fit: 3, authority: 3, need: 2, timing: 2 };

const results = await mapLimit(leads, 8, async (l) => {
  const a = await ask({ ideal_customer, lead: { contact: l.name, message: l.message } }, QUESTIONS);
  const parts = {
    ...Object.fromEntries(Object.entries(LEVELS).map(([k, max]) => [k, a[k].score / max])),
    budget: a.budget.noul,
  };
  const total = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0);
  // A lead that isn't a possible customer can't be priority A or B, however urgent it sounds.
  const priority = parts.fit < 0.34 ? 'C' : total >= 0.7 ? 'A' : total >= 0.45 ? 'B' : 'C';
  return { id: l.id, name: l.name, expected: l.priority, priority, total, parts };
});

results.sort((a, b) => b.total - a.total);
console.log('score  prio  fit  auth need time budget  lead');
for (const r of results) {
  const p = r.parts;
  console.log(`${r.total.toFixed(2)}   ${r.priority}${r.priority !== r.expected ? `≠${r.expected}` : '  '}  ${p.fit.toFixed(2)} ${p.authority.toFixed(2)} ${p.need.toFixed(2)} ${p.timing.toFixed(2)} ${p.budget.toFixed(2)}   ${r.name}`);
}
const ok = results.filter((r) => r.priority === r.expected).length;
const aLeads = results.filter((r) => r.expected === 'A');
const top = results.slice(0, aLeads.length);
console.log(`\nPriority matches the label: ${ok}/${results.length} (${pct(ok, results.length)})`);
console.log(`The top ${aLeads.length} by score contain ${top.filter((r) => r.expected === 'A').length} of the ${aLeads.length} A leads`);
console.log(summary());
saveResult('13-lead-scoring', { metrics: { priority_accuracy: ok / results.length, a_leads_in_top: `${top.filter((r) => r.expected === 'A').length}/${aLeads.length}` }, weights: WEIGHTS, results });
