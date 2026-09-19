# 13 · Lead scoring

**The job:** rank inbound sales leads so the team calls the right people first, and be able to explain every score.

```bash
npm run 13
```

## How it works

"How good is this lead?" is several judgments in one, so it's asked as several questions, measured against an `ideal_customer` description in the state:

| Question | Type | Weight |
| --- | --- | --- |
| `fit`: company matches the ideal customer | Score, 4 levels | 0.35 |
| `authority`: buying influence of the contact | Score, 4 levels | 0.20 |
| `need`: a problem the product solves | Score, 3 levels | 0.20 |
| `timing`: how soon they want to act | Score, 3 levels | 0.15 |
| `budget`: money approved or set aside | Noul | 0.10 |

Each Score is normalised to 0–1 and weighted in code. A lead that isn't a possible customer (fit below one third) can't be A or B, however urgent it sounds. Priority: A ≥ 0.7, B ≥ 0.45, otherwise C.

## Results

16 leads for a fictional fleet-software company ([leads.json](leads.json)): strong fits, a student, a journalist, a spam test, an intern, a huge enterprise RFP, a tiny bakery.

- **The top 5 by score are exactly the 5 priority-A leads.**
- **Priority matched the label:** 13/16. The three differences are judgment calls: an evaluating operations manager scored A (labelled B), a tiny courier startup scored B (labelled C), and a global enterprise RFP scored C (labelled B, since its size is outside the ideal customer).
- **Cost:** 16 calls, $0.0005.

## Lessons

- Every score comes with its parts. "Fit 1.0, authority 0.43, timing 1.0, no budget" is something a sales team can argue with and correct.
- When sales disagrees, change a weight or a threshold in code and re-run.
- Hard rules (a non-customer can't be A) belong in code, not in the question wording.

## Adapt it

Write your own ideal customer in one or two sentences, and rename the dimensions to your qualification framework (BANT, MEDDICC). Log the parts next to the CRM record.
