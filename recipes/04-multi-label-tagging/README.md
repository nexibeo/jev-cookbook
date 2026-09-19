# 04 · Multi-label tagging

**The job:** give each article every tag that applies from a fixed vocabulary, not just the single best one.

```bash
npm run 04
```

## How it works

A Choice always returns exactly one option, so it's the wrong tool for several labels. Instead, one Noul per tag, all in the same call:

```js
'tag:databases': noul('The article in `article` is about databases, SQL, schemas or data storage. Answer yes only if this is a main theme, not a passing mention.')
```

`pickLabels()` in [`lib/jev.mjs`](../../lib/jev.mjs) keeps the tags at or above a threshold, best first, and always at least one. Because the answers are probabilities, the recipe can measure several thresholds on the same call.

## Results

24 articles ([articles.json](articles.json)), 13 tags, 1 to 3 tags per article:

| Threshold | Precision | Recall | F1 |
| --- | --- | --- | --- |
| 0.3 | 80% | 94% | 86% |
| 0.5 | 89% | 85% | 87% |
| 0.7 | 90% | 77% | 83% |
| 0.9 | 97% | 64% | 77% |
| top-k (k = true count) | 91% | 91% | 91% |

The top-k row is an upper bound: it cheats by knowing how many tags each article should get. Cost: 24 calls, $0.0008.

## Lessons

- The threshold is a product decision: search filters want recall (0.3), auto-published labels want precision (0.9).
- "Main theme, not a passing mention" in every question cut the loose tags noticeably.
- Many "misses" were debatable, such as `workplace` on an article about one-on-ones. Look at the disagreements before you trust any score, including this one.

## Adapt it

Replace `VOCABULARY` with your tags and a one-line meaning for each. Up to a few hundred tags fit in one call; for open-ended tags, let code or an LLM propose candidates and ask one Noul each to accept or reject them.
