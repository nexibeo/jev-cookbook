// Recipe 03: a file organizer. Sort a messy folder into category folders with dated names.
//
//   node --env-file=.env recipes/03-file-organizer/organize.mjs [inbox-dir] [--apply]
//
// For each text file, one Jev call picks a category and the document's own date.
// Jev can't write a date, so code finds every date in the text with a regex and Jev
// picks which one is the document date ("pick, don't extract"). Low-confidence files go
// to _review/. Without --apply it only prints the plan; with --apply it COPIES files
// into out/organized/. Originals are never moved or deleted.
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT, ask, choice, noul, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';
import { dateCandidates } from '../../lib/candidates.mjs';

const inbox = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? new URL('./inbox', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const REVIEW_BELOW = 0.7;

const CATEGORIES = {
  'invoices-receipts': 'Bills, invoices and receipts for things bought or sold',
  'bank-tax': 'Bank statements, tax returns and official financial summaries',
  'contracts-legal': 'Contracts, agreements, leases, NDAs and other legal documents',
  'meeting-notes': 'Notes, minutes and retrospectives from meetings',
  'cv-career': 'CVs, resumes, cover letters and job applications',
  'recipes': 'Cooking and baking recipes',
  'travel': 'Bookings, tickets and trip plans',
  'health': 'Medical letters, test results and vaccination records',
  'manuals': 'Instructions and user guides for devices or software',
  'school': "School reports, homework and anything about a child's schooling",
  'personal-letters': 'Letters, cards and invitations between friends and family',
  'other': 'Anything that fits none of the above',
};

// Code finds date candidates and normalises them (lib/candidates.mjs); Jev only chooses.

const files = readdirSync(inbox).filter((f) => !f.startsWith('.')).sort();
const plan = await mapLimit(files, 8, async (name) => {
  const text = readFileSync(join(inbox, name), 'utf8').slice(0, 2500);
  const dates = dateCandidates(text);
  const questions = {
    category: choice('What kind of document is `document`?', CATEGORIES),
    sensitive: noul('`document` contains personal financial, medical or identity details that should not be shared'),
  };
  if (dates.length) questions.date = choice(
    'Which date is when `document` itself was written, issued, sent or last updated? Not a due date, a travel date, a validity period, a start date or a date of birth.',
    { ...Object.fromEntries(dates.map((d, i) => [`d${i}`, `${d.value}, in: "...${d.context}..."`])), none: 'None of these dates is the date of the document itself' },
  );
  const a = await ask({ file_name: name, document: text }, questions);
  const date = a.date && a.date.choice !== 'none' ? dates[Number(a.date.choice.slice(1))].value : null;
  const review = a.category.confidence < REVIEW_BELOW;
  const target = review
    ? join('_review', name)
    : join(a.category.choice, `${date ?? 'undated'} - ${basename(name)}`);
  return { name, category: a.category.choice, confidence: a.category.confidence, date, sensitive: a.sensitive.noul >= 0.5, review, target };
});

const out = join(ROOT, 'out', 'organized');
for (const p of plan) {
  console.log(`${p.review ? '?' : ' '} ${p.name.padEnd(26)} -> ${p.target}${p.sensitive ? '   [sensitive]' : ''}   (${p.confidence.toFixed(2)})`);
  if (APPLY) {
    mkdirSync(join(out, p.target, '..'), { recursive: true });
    copyFileSync(join(inbox, p.name), join(out, p.target));
  }
}
console.log(APPLY ? `\nCopied ${plan.length} files into out/organized/.` : '\nDry run. Add --apply to copy the files into out/organized/.');

// Score against the hand labels shipped with the sample inbox.
const labelsFile = new URL('./labels.json', import.meta.url);
const labels = JSON.parse(readFileSync(labelsFile, 'utf8'));
const scored = plan.filter((p) => labels[p.name]);
if (scored.length) {
  const catOk = scored.filter((p) => p.category === labels[p.name].category);
  const dateOk = scored.filter((p) => p.date === labels[p.name].date);
  const wrong = (key) => scored.filter((p) => p[key] !== labels[p.name][key]).map((p) => `${p.name}: ${p[key]} (expected ${labels[p.name][key]})`);
  console.log(`\nCategory: ${catOk.length}/${scored.length} (${pct(catOk.length, scored.length)})   Document date: ${dateOk.length}/${scored.length} (${pct(dateOk.length, scored.length)})`);
  for (const w of [...wrong('category'), ...wrong('date')]) console.log(`  ${w}`);
  console.log(summary());
  saveResult('03-file-organizer', {
    metrics: { category_accuracy: catOk.length / scored.length, date_accuracy: dateOk.length / scored.length, sent_to_review: plan.filter((p) => p.target.startsWith('_review')).length },
    misses: [...wrong('category'), ...wrong('date')],
    plan,
  });
}
