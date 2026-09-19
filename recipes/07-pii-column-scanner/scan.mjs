// Recipe 07: a PII column scanner for a data catalog.
//
//   node --env-file=.env recipes/07-pii-column-scanner/scan.mjs
//
// Point it at a database's columns (here: names plus five sample values each, as you would
// get from SELECT ... LIMIT 5) and it labels every column with a semantic type, whether it is
// personal data, and a sensitivity level. The labels drive masking, access rules and
// retention. Code runs cheap pattern checks first (Luhn for card numbers, IBAN shape, IP
// shape) because Jev is weak at judging digit strings; Jev does the judgment: a free-text
// "notes" column that happens to contain phone numbers is personal data too.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ask, choice, noul, score, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const tables = JSON.parse(readFileSync(new URL('./tables.json', import.meta.url), 'utf8'));

const TYPES = {
  'identifier': 'An internal ID or key for a record',
  'person-name': "A person's name",
  'email': 'An email address',
  'phone': 'A phone number',
  'postal-address': 'A street address',
  'location': 'A city, region or country on its own',
  'geo-coordinates': 'Latitude and longitude',
  'date-of-birth': "A person's date of birth",
  'national-id': 'A government ID: passport, social security, NHS or tax number',
  'payment-card': 'A payment card number, or part of one',
  'bank-account': 'A bank account number or IBAN',
  'ip-address': 'An IP address',
  'health-info': 'Medical or health information about a person',
  'free-text': 'Notes, comments or messages written by people',
  'money-amount': 'An amount of money',
  'timestamp': 'A date and time when something happened',
  'category-code': 'A value from a short fixed list: status, tier, currency, type',
  'boolean-flag': 'A true/false setting',
  'organization': 'The name of a company or organisation',
  'url': 'A web address',
  'other': 'None of the above',
};

const luhn = (s) => {
  const d = s.replace(/\D/g, ''); if (d.length < 13 || d.length > 19) return false;
  let sum = 0; for (let i = 0; i < d.length; i++) { let x = +d[d.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } sum += x; }
  return sum % 10 === 0;
};
// Cheap, exact checks in code; the share of sample values that match each pattern.
function patternHints(samples) {
  const v = samples.filter(Boolean), share = (re) => v.filter((x) => re.test(x)).length / (v.length || 1);
  const hints = {
    email_shape: share(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i),
    passes_card_checksum: v.filter(luhn).length / (v.length || 1),
    iban_shape: share(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/),
    ip_shape: share(/^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+:[0-9a-f:]*)$/i),
    phone_shape: share(/^\+?[\d\s()-]{8,}$/),
  };
  return Object.fromEntries(Object.entries(hints).filter(([, s]) => s > 0).map(([k, s]) => [k, `${Math.round(s * 100)}% of samples`]));
}

const QUESTIONS = {
  type: choice('What kind of data does the column in `column` hold? Judge from its name and sample values.', TYPES),
  personal: noul('Values in `column` identify a person or are information about an identifiable person (personal data under GDPR), including partial identifiers and free text that mentions contact details'),
  sensitivity: score('How much harm would it cause if the values in `column` leaked?', [
    'Public: no harm, e.g. currency codes or public URLs',
    'Internal: little harm on its own, e.g. IDs, timestamps, amounts, a city, the last 4 card digits',
    'Confidential: identifies or contacts people, e.g. names, emails, phones, addresses, IP addresses, locations',
    'Restricted: enables fraud or reveals special-category data, e.g. full card numbers, bank accounts, national IDs, health data',
  ]),
};

const columns = Object.entries(tables).flatMap(([table, cols]) => Object.entries(cols).map(([name, c]) => ({ table, name, ...c })));
const results = await mapLimit(columns, 8, async (c) => {
  const a = await ask({ column: { table: c.table, name: c.name, samples: c.samples, pattern_hints: patternHints(c.samples) } }, QUESTIONS);
  const level = Math.round(a.sensitivity.score);
  return {
    column: `${c.table}.${c.name}`, label: c.label,
    type: a.type.choice, type_confidence: a.type.confidence, personal: a.personal.noul, sensitivity: a.sensitivity.score,
    // Policy lives in code: change the actions without touching the questions.
    action: level >= 3 ? 'encrypt + restrict access' : level === 2 ? 'mask in analytics' : 'none',
  };
});

console.log('column                        type             personal  sensitivity  action');
for (const r of results) {
  const miss = [r.type !== r.label.type && `type: expected ${r.label.type}`, (r.personal >= 0.5) !== r.label.pii && `personal: expected ${r.label.pii}`]
    .filter(Boolean).join('; ');
  console.log(`${r.column.padEnd(30)}${r.type.padEnd(17)}${r.personal.toFixed(2).padStart(6)}   ${r.sensitivity.toFixed(2).padStart(6)}      ${r.action}${miss ? `   <- ${miss}` : ''}`);
}
const n = results.length;
const typeOk = results.filter((r) => r.type === r.label.type).length;
const piiOk = results.filter((r) => (r.personal >= 0.5) === r.label.pii).length;
const sensOk = results.filter((r) => Math.round(r.sensitivity) === r.label.sensitivity).length;
const restrictedCaught = results.filter((r) => r.label.sensitivity === 3 && Math.round(r.sensitivity) >= 3).length;
const restricted = results.filter((r) => r.label.sensitivity === 3).length;
console.log(`\nType: ${typeOk}/${n} (${pct(typeOk, n)})   Personal data: ${piiOk}/${n} (${pct(piiOk, n)})   Sensitivity level: ${sensOk}/${n} (${pct(sensOk, n)})`);
console.log(`Restricted columns caught at level 3: ${restrictedCaught}/${restricted}`);
mkdirSync(join(ROOT, 'out'), { recursive: true });
writeFileSync(join(ROOT, 'out', 'data-catalog.json'), JSON.stringify(results.map(({ label, ...r }) => r), null, 2));
console.log('Catalog written to out/data-catalog.json');
console.log(summary());
saveResult('07-pii-column-scanner', { metrics: { type_accuracy: typeOk / n, personal_accuracy: piiOk / n, sensitivity_accuracy: sensOk / n, restricted_caught: `${restrictedCaught}/${restricted}` }, results });
