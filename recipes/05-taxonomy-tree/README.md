# 05 · Category trees

**The job:** place items in a two-level taxonomy (8 departments × 6 categories = 48 leaves), and know when to do it in one step or two.

```bash
npm run 05
```

## How it works

Two strategies on the same 36 products ([taxonomy.json](taxonomy.json)):

- **Flat:** one Choice over all 48 leaves, each described as "Department > category".
- **Level by level:** a Choice over the 8 departments, keep the best 2 (a "beam", because an item can sit near a border), then a Choice over just those 12 leaves.

## Results

| | Leaf correct | Calls | Input tokens | Cost |
| --- | --- | --- | --- | --- |
| Flat | 36/36 | 36 | 58,356 | $0.0025 |
| Level by level | 36/36 | 72 | 51,721 | $0.0022 |

Both got everything right on these clear product titles. Level by level used 11% fewer tokens despite twice the calls, because each question carries a shorter option list.

## When to use which

- **Flat** while the leaves fit in one Choice (up to 255) and are easy to describe. One call, lowest latency.
- **Level by level** when there are more than 255 leaves, when leaves need long descriptions, or when you want to show "department" and "category" confidence separately. In the [TemplatesGrokBot case study](../../docs/case-study-templatesgrokbot.md), 477 professions under 21 job categories could only be done this way: the right profession came first 87% of the time and was in the top 3 97% of the time.
- Keep a beam of 2 or 3 at the upper level; picking only the single best parent throws away items that sit on a border.

## Adapt it

Put your taxonomy in the same JSON shape. For deeper trees, repeat the step per level, keeping the top 2 or 3 each time.
