# 10 · Search re-ranking

**The job:** a user types a question; find the help article that actually answers it, or say honestly that none does.

```bash
npm run 10
```

## How it works

Three strategies on the same 16 questions and 30 help-center articles ([help-center.json](help-center.json)), all answered in one call per question:

1. **Keyword search:** a small TF-IDF scorer, standing in for SQLite FTS5, Postgres full-text or Elasticsearch.
2. **Keyword + Jev:** the keyword top 12 become the options of a Choice, plus `none`.
3. **Jev over everything:** all 30 articles as the options of one Choice (anything up to 255 fits).

The questions are phrased the way people really ask: "how do I stop paying for this", "does it work on the train without internet". Two have no answer.

## Results

| Strategy | Top-1 correct |
| --- | --- |
| Keyword search | 2/16 (13%) |
| Keyword top 12, re-ranked by Jev | 12/16 (75%) |
| Jev over all 30 articles | 16/16 (100%) |

- Jev said `none` for both unanswerable questions ("record Slack huddles", "a desktop app for Linux") in both Jev strategies.
- The re-ranker's misses: 3 of the 4 were questions whose answer never reached the keyword top 12. A re-ranker can't find what retrieval missed.
- **Cost:** 16 calls with both Choices each, $0.0012.

## Lessons

- For collections under 255 items (FAQs, product categories, a team's docs, a menu of tools), skip retrieval and let Jev read everything.
- For bigger collections, recall of the retrieval step is the ceiling. Widen the candidate set (Jev handles 100 to 250 options easily) or use embeddings for retrieval.
- A `none` option turns "closest match" search into "is there an answer at all", which is what a support bot needs before replying.

## Adapt it

Replace the articles with your own. For large sets, retrieve 100 to 200 candidates with your existing search, then re-rank with one Choice.
