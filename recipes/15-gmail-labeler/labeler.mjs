// Recipe 15: a Gmail labeler. Classify email with Jev and label it in Gmail.
//
//   npm run 15                                   sample inbox, scored against hand labels (no Gmail needed)
//   npm run gmail                                your Gmail: dry run, prints the labels it would add
//   npm run gmail -- --apply                     add the labels in Gmail (Jev/Work, Jev/Needs reply, ...)
//   npm run gmail -- --max 50 --query "in:inbox newer_than:3d" --headers-only
//
// One Jev call per email: a category (Choice over 11 described types) and two yes/no
// questions, "does the sender expect a reply from you" and "is there a deadline for you".
// Code checks the exact facts first (a List-Unsubscribe header, a calendar invite, a Reply-To
// on a different domain, whether you are in To) and passes them in, because those are
// strong signals Jev shouldn't have to guess. The labeler never deletes, archives, moves
// or sends anything; it only adds labels, and only with --apply.
import { readFileSync } from 'node:fs';
import { ask, choice, noul, route, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const argv = process.argv;
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const BODY_CHARS = has('--headers-only') ? 0 : 1500;

const CATEGORIES = {
  'personal': 'Friends, family, school and personal life',
  'work': 'Colleagues, clients, candidates or work tools: requests, updates, assigned tasks',
  'newsletter': 'Editorial content you subscribed to: news digests, blogs, weekly issues',
  'promotion': 'Marketing: sales, discounts, review requests, upsells',
  'orders-receipts': 'Order confirmations, shipping updates and receipts for things already bought',
  'bills-finance': 'Bills, invoices, statements, and payments to make or that failed',
  'account-security': 'Sign-in alerts, verification codes and password resets from real services',
  'notifications': 'Automated updates from apps and tools: builds, mentions, profile views',
  'calendar': 'Meeting invitations, updates and cancellations',
  'travel': 'Flights, hotels, check-in and trip details',
  'suspicious': 'Phishing or scams: urgent threats, prizes, requests for passwords, codes or card details, lookalike senders',
};
const QUESTIONS = {
  category: choice(
    { question: 'What kind of email is `email`?', note: '`email.facts` were checked by code and are reliable. A Reply-To on another domain plus pressure to act fast or share credentials is a strong sign of phishing.' },
    CATEGORIES,
  ),
  needs_reply: noul('The sender of `email` expects a personal reply or an RSVP from you: a question to you, a request, an invitation. Automated emails, newsletters, receipts and FYI messages do not count.'),
  deadline: noul('`email` asks you to do something by a specific date or time (pay, sign, reply, check in, complete). Sale end dates in marketing do not count.'),
};
const LABEL = (c) => `Jev/${c.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase())}`;

async function classify(email) {
  const state = { email: { from: email.from, subject: email.subject, facts: email.facts, ...(BODY_CHARS ? { body: email.body.slice(0, BODY_CHARS) } : {}) } };
  const a = await ask(state, QUESTIONS);
  const r = {
    category: a.category.choice, confidence: a.category.confidence,
    needs_reply: a.needs_reply.noul, deadline: a.deadline.noul,
  };
  // Labels in code. Low confidence gets a review label instead of a guess.
  r.labels = ['Jev', route(r.confidence, { auto: 0.7, review: 0 }) === 'auto' ? LABEL(r.category) : 'Jev/Review'];
  if (r.needs_reply >= 0.5 && r.category !== 'suspicious') r.labels.push('Jev/Needs reply');
  if (r.deadline >= 0.5 && r.category !== 'suspicious') r.labels.push('Jev/Deadline');
  return r;
}

const show = (email, r) => console.log(`${r.labels.slice(1).join(', ').padEnd(36)} ${email.from.replace(/\s*<.*>/, '').slice(0, 22).padEnd(22)}  ${email.subject.slice(0, 60)}`);

if (!has('--gmail')) {
  // Sample mode: the same classifier on 30 hand-labelled emails.
  const inbox = JSON.parse(readFileSync(new URL('./sample-inbox.json', import.meta.url), 'utf8'));
  const results = await mapLimit(inbox, 8, async (e) => ({ e, r: await classify(e) }));
  for (const { e, r } of results) show(e, r);
  const n = results.length;
  const catOk = results.filter(({ e, r }) => (e.label.acceptable ?? [e.label.category]).includes(r.category));
  // Score the labels you'd see in Gmail, after the code rules (no action labels on suspicious mail).
  const replyOk = results.filter(({ e, r }) => r.labels.includes('Jev/Needs reply') === e.label.needs_reply);
  const deadlineOk = results.filter(({ e, r }) => r.labels.includes('Jev/Deadline') === e.label.deadline);
  const phishing = results.filter(({ e }) => e.label.category === 'suspicious');
  const phishingCaught = phishing.filter(({ r }) => r.category === 'suspicious').length;
  const falseAlarms = results.filter(({ e, r }) => e.label.category !== 'suspicious' && r.category === 'suspicious').length;
  console.log(`\nCategory: ${catOk.length}/${n} (${pct(catOk.length, n)})   Needs reply: ${pct(replyOk.length, n)}   Deadline: ${pct(deadlineOk.length, n)}`);
  console.log(`Phishing caught: ${phishingCaught}/${phishing.length}, false alarms: ${falseAlarms}   Sent to Jev/Review: ${results.filter(({ r }) => r.labels.includes('Jev/Review')).length}`);
  for (const { e, r } of results.filter((x) => !catOk.includes(x))) console.log(`  ${e.subject}: ${r.category} (${r.confidence.toFixed(2)}), expected ${e.label.category}`);
  for (const { e, r } of results.filter((x) => !replyOk.includes(x) || !deadlineOk.includes(x))) console.log(`  ${e.subject}: needs_reply ${r.needs_reply.toFixed(2)} (expected ${e.label.needs_reply}), deadline ${r.deadline.toFixed(2)} (expected ${e.label.deadline})`);
  console.log(summary());
  saveResult('15-gmail-labeler', {
    metrics: { category_accuracy: catOk.length / n, needs_reply_accuracy: replyOk.length / n, deadline_accuracy: deadlineOk.length / n, phishing_caught: `${phishingCaught}/${phishing.length}`, phishing_false_alarms: falseAlarms },
    results: results.map(({ e, r }) => ({ id: e.id, subject: e.subject, expected: e.label, ...r })),
  });
} else {
  // Gmail mode. Reads with gmail.readonly; asks for gmail.modify only with --apply.
  const { SCOPES, accessToken, client, toEmail } = await import('./gmail.mjs');
  const APPLY = has('--apply');
  let gmail;
  try { gmail = client(await accessToken(APPLY ? SCOPES.modify : SCOPES.read)); }
  catch (err) { console.error(err.message); process.exit(1); }
  const you = (await gmail.profile()).emailAddress;
  // "-label:jev" skips mail this labeler already handled (every processed message gets "Jev").
  const query = val('--query', 'in:inbox newer_than:7d -label:jev');
  const ids = await gmail.list(query, Number(val('--max', 25)));
  console.log(`${ids.length} messages match "${query}" in ${you}. Sending sender, subject${BODY_CHARS ? ` and the first ${BODY_CHARS} characters` : ''} of each to Jev on OpenRouter.\n`);
  const emails = await mapLimit(ids, 5, async ({ id }) => toEmail(await gmail.get(id), you));
  const results = await mapLimit(emails, 8, async (e) => ({ e, r: await classify(e) }));
  for (const { e, r } of results) show(e, r);
  if (APPLY) {
    const existing = Object.fromEntries((await gmail.labels()).map((l) => [l.name, l.id]));
    for (const name of new Set(results.flatMap(({ r }) => r.labels))) {
      if (!existing[name]) existing[name] = (await gmail.createLabel(name)).id;
    }
    await mapLimit(results, 5, ({ e, r }) => gmail.addLabels(e.id, r.labels.map((l) => existing[l])));
    console.log(`\nLabelled ${results.length} messages in Gmail. Nothing was archived, deleted or sent.`);
  } else {
    console.log('\nDry run: nothing changed in Gmail. Add --apply to add these labels.');
  }
  console.log(summary());
}
