# Case study: filing 3,267 Grok Bot templates with Jev

[TemplatesGrokBot](https://templatesgrokbot.com) is a free catalog of 3,267 Grok Bot templates, each filed under one of 8 categories, several of 27 topics and 21 jobs, and free-form tags. Before Jev, another LLM (DeepSeek) did the filing. On September 19, 2026 we ran Jev (`~typesafe/jev-latest`, answering as `typesafe/jev-1.13-20260917`) against those existing labels. The scripts read the catalog's own data, so they live in the TemplatesGrokBot project rather than in this repo; the question design and every result are below. The same patterns are runnable here as [recipe 04](../recipes/04-multi-label-tagging) (multi-label tagging) and [recipe 05](../recipes/05-taxonomy-tree) (category trees).

## Worked example: filing a template in one call

The classifier sends each template's name, tagline, identity and capabilities as the state. It asks for everything in one call: the category, a main topic, and yes/no for each of 27 topics, 21 jobs and 120 common tags. It leaves out the existing labels, so Jev can't copy them. The request, trimmed:

```json
{
  "model": "~typesafe/jev-latest",
  "state": { "template": { "name": "Web Vitals Optimizer", "tagline": "...", "identity": "...", "capabilities": ["<capability name>: <its first sentence>", "..."] } },
  "questions": {
    "category": {
      "type": "choice",
      "instructions": "Which catalog category fits the main work of the template in `template`?",
      "criteria": {
        "engineering": "Software work: writing, reviewing, testing or deploying code, developer tools, infrastructure",
        "creative": "Creative output: fiction, art, music, design, images or video",
        "...": "one described option per category, 8 in all"
      }
    },
    "primary_topic": {
      "type": "choice",
      "instructions": "Which one topic best describes the main work of the template in `template`?",
      "criteria": { "coding": "Coding: Write, review, test and debug software.", "...": "...", "none": "None of these topics fits the work" }
    },
    "topic:coding": {
      "type": "noul",
      "instructions": {
        "question": "Is \"Coding\" (Write, review, test and debug software.) one of the main kinds of work the template in `template` does for its user?",
        "rules": "Judge the work the bot does for its user. Every template is an AI bot, so being built on a language model does not count ..."
      }
    },
    "job:it-and-development": {
      "type": "noul",
      "instructions": { "question": "Would people in \"IT and Development\" (Engineers, DevOps, security and IT teams.) use the template in `template` as a regular part of their job?", "rules": "Judge by who does this work professionally ..." }
    },
    "tag:4": { "type": "noul", "instructions": "The tag \"performance\" is an accurate search keyword for what the template in `template` does" }
  }
}
```

Question keys like `topic:coding` are for your code only; Jev never sees them. Code turns the yes/no answers into label sets:

```js
// Noul answers -> labels: at or above the threshold, best first, capped, and never empty.
function pick(answers, prefix, { threshold, max, min = 1 }) {
  const scored = Object.entries(answers).filter(([k]) => k.startsWith(prefix)).map(([k, a]) => [k.slice(prefix.length), a.noul]).sort((a, b) => b[1] - a[1]);
  const chosen = scored.filter(([, p]) => p >= threshold).slice(0, max);
  return (chosen.length >= min ? chosen : scored.slice(0, min)).map(([k]) => k);
}
const topics = pick(answers, 'topic:', { threshold: 0.5, max: 3 });
const jobs = pick(answers, 'job:', { threshold: 0.5, max: 4 });
const tags = pick(answers, 'tag:', { threshold: 0.8, max: 6, min: 0 }).map((i) => tagVocab[Number(i)]);
```

Real output from the run, next to the catalog's existing labels:

| Template | Jev's labels | Existing labels |
| --- | --- | --- |
| Web Vitals Optimizer | engineering (confidence 1.0); topics: coding; jobs: IT and Development; tags: performance, optimization, monitoring, audit, frontend, analysis | engineering; topics: Cloud & DevOps, Coding; jobs: IT and Development, Product Development |
| Fal Image Edit | creative (0.99); topics: Generative Art; jobs: Creatives | engineering; topics: Generative Art; jobs: Creatives |
| Google Analytics Automation | marketing (0.80); topics: Data Analysis; jobs: Marketing; tags: automation, analytics, rube mcp | operations; topics: Data Analysis; jobs: Marketing, Operations |
| Market Sizing Analysis | research (0.73); main topic Data Analysis; topics: Research; jobs: Executives and Strategy | operations; topics: Data Analysis, Research; jobs: Executives and Strategy, Finance, Marketing |
| Domain Name Brainstormer | marketing (0.52, flagged for review); topics: Research; jobs: Marketing | creative; topics: Marketing & Growth, Writing & Content |

## Results on 100 catalog templates

The run covered 100 random English templates on September 19, 2026, each with the plain wording and with boundary rules added. The reference labels came from other models: the import model's category and tags, and DeepSeek's topics and jobs. So these figures measure agreement, not accuracy.

| Measure | Plain wording | With boundary rules |
| --- | --- | --- |
| Category, 1 of 8 (Choice): matches the catalog | 80% | 79% |
| Category, when Jev's confidence is 0.8 or more | 86% match, on 86 of 100 | 86% match, on 86 of 100 |
| Main topic, 1 of 27 (Choice): among DeepSeek's topics | 81% | 81% |
| Topics (Nouls, threshold 0.5, max 3): precision / recall | 50% / 65% | 64% / 50% |
| Jobs (Nouls, threshold 0.5, max 4): precision / recall | 63% / 61% | 73% / 55% |
| Templates given "Generative AI and LLM" (DeepSeek: 8) | 36 | 6 |
| Topics per template (DeepSeek: 1.73) | 2.26 | 1.36 |
| Existing tags recovered, from the 120-tag vocabulary | 79% | 79% |
| Input tokens per call | 6,527 | 10,034 |
| Median time per call | 528 ms | 547 ms |
| Cost for 100 templates | $0.027 | $0.042 |

The threshold is a dial between precision and recall. Topics with boundary rules:

| Threshold | Precision | Recall |
| --- | --- | --- |
| 0.3 | 59% | 59% |
| 0.5 | 64% | 50% |
| 0.7 | 68% | 46% |
| 0.9 | 71% | 42% |

What the numbers say:

- **Boundary rules fixed the literal-reading problem.** With plain wording, 36 of 100 templates got "Generative AI and LLM" just for being AI bots. After one sentence saying that doesn't count, it was 6.
- **The rules also made Jev stricter.** It gave 1.36 topics per template against DeepSeek's 1.73. A lower threshold (0.3) balances precision and recall again.
- **Disagreement is often the old label's fault.** I checked 12 category disagreements by hand. Jev was better in 6, such as creative for an image editor the catalog files under engineering. The catalog was better in 2, and 4 were genuinely ambiguous.
- **Confidence finds the doubtful ones.** The ambiguous cases mostly had confidence around 0.5. At 0.8 and above, 86 of 100 templates can be filed automatically and the other 14 go to review.
- **Tags can only be checked one way.** Jev recovered 79% of the existing tags that were in its vocabulary. Its extra tags can't be scored, because the old tags list only about 5 per template. On inspection they were sensible: "performance, optimization, monitoring, audit, frontend" for Web Vitals Optimizer.
- **It stays cheap.** Filing the whole catalog of 3,267 templates this way would cost about $1.40 with the rules wording.

## Category trees and lists over 255

When the options form a tree or number more than 255, choose level by level. The site files 477 professions under 21 job categories, too many for one Choice. The hierarchy script gives Jev only a profession's task list, such as "Reconcile bank statements" or "File tax returns". It then asks two Choices in two calls:

```mermaid
flowchart LR
    A[Task list] --> B[Choice 1<br/>job category, 21 options]
    B --> C[Keep the top 2<br/>categories]
    C --> D[Choice 2<br/>professions in those<br/>categories, max 250]
    D --> E[Top profession<br/>+ runners-up]
```

Keeping the top 2 categories instead of 1 (a "beam") matters, because many professions sit in two or three categories. Results on 60 random professions:

| Step | Result |
| --- | --- |
| Level 1: true category in Jev's top 2 of 21 | 60 of 60 (100%) |
| Level 2: right profession ranked first | 52 of 60 (87%) |
| Level 2: right profession in the top 3 | 58 of 60 (97%) |
| Cost | 120 calls, $0.014 in total |

Both misses were near-synonyms. "Global Heads of IT" ranked behind CIOs, Directors of IT and VPs of IT. "Physicists" ranked behind professors and research scientists. Show the top 3 when a person can pick, and ask for confirmation when the top two are close. TypeSafe's [hierarchical classification cookbook](https://docs.typesafe.ai/cookbooks/hierarchical_classification) does the same with a beam search over deeper trees.
