# 06 · Duplicate detection

**The job:** two records, from a CRM import and a web form or from two merged databases. Are they the same organisation at the same place? Merge, keep separate, or ask a person.

```bash
npm run 06
```

## How it works

One **Score** per candidate pair, with three levels that map straight onto actions:

1. Different organisations, or different branches of one company → **keep separate** (score < 0.4)
2. Unsure: the evidence conflicts or is thin → **review** (0.4 to 1.5)
3. The same organisation at the same location, written differently → **merge** (≥ 1.5)

Exact comparisons are code's job, so code normalises websites (`www.ibm.com` → `ibm.com`) and phone numbers (last 9 digits), and passes the results in as facts: `same_website_domain: true`, `same_phone_number: 'unknown (a phone is missing)'`. A `rules` field states the policy: parents and subsidiaries are different; branches at different addresses are different.

In production you'd first find candidate pairs cheaply (same postcode, similar name, shared domain), then ask Jev only about those.

## Results

24 pairs ([pairs.json](pairs.json)): abbreviations (IBM / International Business Machines), translations (Müller & Söhne / Mueller und Soehne), look-alikes (Apple Inc. / Apple Bank), chains, a parent and its subsidiary, and two schools on one road. Each run asks both variants:

| | Merged | Kept separate | Review | Wrong automatic decisions |
| --- | --- | --- | --- | --- |
| With code-checked facts | 11 | 11 | 2 | **0** |
| Records only | 12 | 12 | 0 | 1 |

The two review cases are the hard ones: Riverside Dental with two different domains but the same phone and address, and Evergreen with a PO box versus a street address but the same phone. Without the phone fact, Jev kept Evergreen separate, which is wrong. Cost: 48 calls, $0.0011.

## Lessons

- Give Jev the facts that code can compute exactly; judgment is the part left to Jev.
- Leave a real review band. This pair scored 0.49 in one run and 0.52 in the next; a single cut-off at 0.5 would flip between merge-adjacent decisions.
- A Score whose levels are the actions you'll take needs no separate threshold tuning.

## Adapt it

Swap in your own fields (people: name, email, date of birth; products: title, brand, GTIN) and add the exact checks that matter for them.
