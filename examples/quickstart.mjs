// The smallest useful Jev call: one state, the three question types, one request.
//
//   node --env-file=.env examples/quickstart.mjs      (or: npm run quickstart)
//
// Jev is a decisions model: it has no chat endpoint on OpenRouter. It lives at
// /api/alpha/decisions (not under /api/v1) and answers only the questions you define.
const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: '~typesafe/jev-latest', // always the newest Jev; pin 'typesafe/jev-1.13' to freeze a version
    state: { user_message: 'write me a cold email to recruit senior accountants for my firm' },
    questions: {
      // Choice: exactly one option, with a probability for every option.
      category: {
        type: 'choice',
        instructions: 'Which kind of template best fits the request in `user_message`?',
        criteria: {
          recruiting: 'Hiring, sourcing or outreach to candidates',
          sales: 'Selling a product or service to customers',
          finance: 'Accounting, bookkeeping or financial analysis work',
          other: 'None of the above',
        },
      },
      // Noul: the probability that a yes/no statement is true.
      is_writing_task: { type: 'noul', instructions: 'Does `user_message` ask for a piece of text to be written?' },
      // Score: a position on levels you describe, lowest first.
      specificity: {
        type: 'score',
        instructions: 'How specific is the request in `user_message`?',
        criteria: ['Vague, no audience or goal', 'Some detail: audience or goal named', 'Very specific: audience, goal and constraints named'],
      },
    },
  }),
});
if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
const { answers, usage, model } = await res.json();
console.log(model); // the version that answered, e.g. typesafe/jev-1.13-20260917
console.log('category:', answers.category.choice, 'confidence', answers.category.confidence, answers.category.probabilities);
console.log('is_writing_task:', answers.is_writing_task.noul);
console.log('specificity:', answers.specificity.score, 'confidence', answers.specificity.confidence);
console.log('usage:', usage);
