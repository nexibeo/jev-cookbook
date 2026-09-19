// Recipe 09: extracting fields from invoices by picking, not generating.
//
//   node --env-file=.env recipes/09-extract-by-picking/extract.mjs
//
// Jev can't copy text out of a document. So code finds every candidate with a regex
// (dates, amounts, reference numbers), normalises them, and Jev answers one Choice per
// field: which candidate is the invoice number, the invoice date, the due date, the total?
// Every answer is a value that really appears in the document, already in a clean format,
// and each field has a "none" option so a quote or receipt doesn't get a fake due date.
import { readFileSync } from 'node:fs';
import { ask, choice, noul, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';
import { dateCandidates, amountCandidates, referenceCandidates, asOptions } from '../../lib/candidates.mjs';

const invoices = JSON.parse(readFileSync(new URL('./invoices.json', import.meta.url), 'utf8'));
const FIELDS = {
  invoice_number: ['reference', 'Which value is the number of the invoice or receipt in `document` itself? Not an order, PO, customer or account number unless it is the only reference.'],
  invoice_date: ['date', 'Which date is the date the invoice or receipt in `document` was issued?'],
  due_date: ['date', 'Which date is the payment deadline in `document`? Not the issue date, a service period or a validity date.'],
  total: ['amount', 'Which amount is the final total to pay in `document`, after tax, discounts and credits?'],
};

const results = await mapLimit(invoices, 8, async (inv) => {
  const found = { date: dateCandidates(inv.text), amount: amountCandidates(inv.text), reference: referenceCandidates(inv.text) };
  const questions = {
    is_invoice: noul('`document` is an invoice, bill or receipt asking for or confirming payment (not a quote, estimate or statement of prices)'),
  };
  for (const [field, [kind, question]] of Object.entries(FIELDS)) {
    if (found[kind].length) questions[field] = choice(question, asOptions(found[kind], 'None of these values'));
  }
  const a = await ask({ document: inv.text }, questions);
  const got = {};
  for (const [field, [kind]] of Object.entries(FIELDS)) {
    const c = a[field]?.choice;
    got[field] = a.is_invoice.noul < 0.5 || !c || c === 'none' ? null : found[kind][Number(c.slice(1))].value;
  }
  return { id: inv.id, label: inv.label, got, is_invoice: a.is_invoice.noul, candidates: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])) };
});

let right = 0, total = 0;
for (const r of results) {
  const cells = Object.keys(FIELDS).map((f) => {
    total++;
    const ok = r.got[f] === r.label[f];
    if (ok) right++;
    return `${f}=${r.got[f] ?? '-'}${ok ? '' : ` (expected ${r.label[f] ?? '-'})`}`;
  });
  console.log(`${r.id}  ${cells.join('  ')}`);
}
const perField = Object.fromEntries(Object.keys(FIELDS).map((f) => [f, results.filter((r) => r.got[f] === r.label[f]).length / results.length]));
console.log(`\nFields right: ${right}/${total} (${pct(right, total)})  ${Object.entries(perField).map(([f, v]) => `${f} ${Math.round(v * 100)}%`).join(', ')}`);
console.log(summary());
saveResult('09-extract-by-picking', { metrics: { field_accuracy: right / total, per_field: perField }, results });
