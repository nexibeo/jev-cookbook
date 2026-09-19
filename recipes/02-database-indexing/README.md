# 02 · Database indexing

**The job:** your table has free text (a title, a description) and you want to filter and group by things the text only implies: category, audience, "eco-friendly", "gift idea". Jev turns each row into typed columns and a tags table; SQL indexes make them fast to query.

```bash
npm run 02     # builds out/shop.db from products.json (uses node:sqlite, built into Node 22+)
```

## How it works

1. The source table `products` stays untouched.
2. `product_facets` gets `category`, `category_confidence`, `audience`, `indexed_by`, `indexed_at`; `product_tags` gets one row per tag with its probability. Both are indexed.
3. Only rows without facets are sent to Jev, so the job is incremental and safe to run on a schedule. A second run indexed 0 rows.
4. One call per row: a Choice for the category (10 described options), a Choice for the audience, and one Noul per tag in the vocabulary (8). Tags at or above 0.6 are stored.
5. The price never goes to Jev. Numbers are code's job, and SQL handles `price_cents < 4000`.

Then plain SQL answers questions the text couldn't:

```sql
SELECT p.title FROM products p
JOIN product_tags g ON g.product_id = p.id AND g.tag = 'gift-idea'
JOIN product_tags e ON e.product_id = p.id AND e.tag = 'eco-friendly'
WHERE p.price_cents < 4000;
```

## Results

On 36 products ([products.json](products.json)), 9 of them honestly fitting two categories:

- **Category:** 35/36. The miss: a silk pillowcase filed under home-kitchen instead of beauty.
- **Review list:** 3 rows under 0.8 confidence (a water bottle at 0.53, a kids' bike helmet at 0.54, a keyboard at 0.74), which are exactly the ones a person would argue about.
- **Tags:** 41 stored. Most are sensible; a few are literal stretches (a tent tagged `sleep`, a cast-iron pot tagged `eco-friendly`).
- **Cost:** 36 calls, $0.0014.

## Lessons

- Store the confidence next to the label. A `WHERE category_confidence < 0.8` query is your review queue.
- Tag meanings need boundaries ("made from sustainable, organic, reusable or plastic-free materials") or Jev reads them loosely; raise the tag threshold if precision matters more than coverage.
- Record `indexed_by` and the date so you can re-index when you change the questions or the model moves on.

## Adapt it

Point the `SELECT` at your own table, swap the categories, audiences and tag vocabulary, and keep the write in one transaction. For Postgres or MySQL the same three tables work unchanged.
