// Recipe 08: categorizing bank transactions for budgeting or bookkeeping.
//
//   node --env-file=.env recipes/08-transaction-categorizer/categorize.mjs [statement.csv]
//
// Bank descriptors are short and cryptic ("AMZN Mktp UK*2K3L81"). Jev reads them well, but
// numbers are code's job: the sign of the amount decides whether a row is money in or money
// out, and each side gets its own list of categories. That removes a whole class of mistakes
// (a refund filed as shopping, a salary filed as a transfer) before Jev is asked anything.
import { readFileSync } from 'node:fs';
import { ask, choice, noul, parseCsv, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const file = process.argv[2] ?? new URL('./transactions.csv', import.meta.url);
const rows = parseCsv(readFileSync(file, 'utf8'));

const OUT = {
  housing: 'Rent, mortgage, council tax, home insurance',
  groceries: 'Supermarkets and food shops',
  'eating-out': 'Restaurants, cafes, takeaway and food delivery apps',
  transport: 'Public transport, taxis, ride-hailing, train tickets',
  car: 'Fuel, parking, car tax, repairs and car insurance',
  utilities: 'Energy, water, internet and mobile phone bills',
  subscriptions: 'Streaming, software and other monthly digital services',
  shopping: 'Online and high-street shopping for goods: clothes, furniture, electronics',
  'health-fitness': 'Gyms, pharmacies, doctors, dentists',
  entertainment: 'Cinema, games, events and hobbies',
  travel: 'Flights, hotels and holiday rentals',
  taxes: 'Payments to the tax authority',
  transfers: 'Moving money between your own accounts, savings or investments',
  'gifts-donations': 'Charity donations and gifts',
};
const IN = {
  salary: 'Wages from an employer',
  'freelance-income': 'Payment from a client for freelance or invoiced work',
  refunds: 'Money returned for a purchase',
  'other-income': 'Interest, cashback and other income',
  transfers: 'Money moved in from your own accounts',
};

const results = await mapLimit(rows, 8, async (r) => {
  const amount = Number(r.amount);
  const incoming = amount > 0; // decided by code, never by the model
  const a = await ask({ transaction: { description: r.description, direction: incoming ? 'money in' : 'money out' } }, {
    category: choice('Which budget category does the bank transaction in `transaction` belong to?', incoming ? IN : OUT),
    recurring: noul('The merchant in `transaction` is usually a recurring bill or subscription paid every month'),
  });
  return { ...r, amount, got: a.category.choice, confidence: a.category.confidence, recurring: a.recurring.noul };
});

const totals = {};
for (const r of results) totals[r.got] = (totals[r.got] ?? 0) + r.amount;
console.log('Spending and income by category:');
for (const [k, v] of Object.entries(totals).sort((a, b) => a[1] - b[1])) console.log(`  ${k.padEnd(18)} ${v.toFixed(2).padStart(9)}`);
console.log('\nLikely recurring bills (noul >= 0.6):', results.filter((r) => r.recurring >= 0.6).map((r) => r.description).join(' | '));

const ok = results.filter((r) => r.got === r.category);
console.log(`\nCategory: ${ok.length}/${results.length} match the labels (${pct(ok.length, results.length)})`);
for (const r of results.filter((x) => x.got !== x.category)) console.log(`  ${r.description}: ${r.got} (${r.confidence.toFixed(2)}), expected ${r.category}`);
console.log(summary());
saveResult('08-transaction-categorizer', {
  metrics: { accuracy: ok.length / results.length },
  results: results.map(({ date, description, amount, category, got, confidence, recurring }) => ({ date, description, amount, expected: category, got, confidence, recurring })),
});
