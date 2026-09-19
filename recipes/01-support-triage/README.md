# 01 · Support triage

**The job:** every incoming ticket needs a team, a priority, and a flag if the customer wants money back. Doing that by hand is slow; doing it with an LLM prompt is slow too, and the answer comes back as text you have to parse.

```bash
npm run 01
```

## How it works

One Jev call per ticket asks four questions about the same `message`:

| Question | Type | Used for |
| --- | --- | --- |
| `department` | Choice over 5 described teams | Which queue |
| `urgent` | Noul | P1 if ≥ 0.5 |
| `frustration` | Score, 3 described levels | P2 if ≥ 1.5 |
| `refund` | Noul | Flag for the billing team |

Code then routes on the Choice's `confidence`: 0.8 or more goes straight to the queue, 0.5 to 0.8 to a person, below 0.5 is held. The boundary between teams is written into the option descriptions ("account: access and profile…; technical: something is broken…"), because Jev matches the ticket against those words.

## Results

On 34 hand-labelled tickets ([tickets.json](tickets.json)), 4 of them deliberately ambiguous:

- **Team:** 34/34 acceptable. The 30 clear tickets scored confidence 0.99 or 1.00. The ambiguous ones scored 0.92, 1.00, 0.68 and 0.60, so the two hardest went to a person.
- **Urgency:** 94%. **Frustration** (rounded score): 85%. **Refund request:** 100%, including "I want a replacement, not my money back".
- **Cost:** 34 calls, $0.0009, median 0.39 s per ticket.

## Lessons

- Describe every option and the boundary between neighbours; a bare label list is where mistakes come from.
- Confidence is most useful on the cases you'd argue about yourself. Measure it on a few ambiguous examples before you pick thresholds.
- Asking four questions costs about the same time as asking one. Ask everything you might route on.

## Adapt it

Replace the five teams with your own, keep the descriptions concrete, and add questions your routing needs (`language`, `mentions_competitor`, `vip_customer`). Keep the priority rules in code.
