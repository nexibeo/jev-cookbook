# 08 · Bank transaction categorizer

**The job:** turn a bank export full of `AMZN Mktp UK*2K3L81` and `UBER *TRIP HELP.UBER.COM` into budget categories, and spot recurring bills.

```bash
npm run 08                                                                        # sample statement
node --env-file=.env recipes/08-transaction-categorizer/categorize.mjs my.csv     # your own CSV (date,description,amount)
```

## How it works

- **Code reads the amount's sign first.** Money in is offered income categories (salary, freelance income, refunds, other income, transfers); money out is offered 14 spending categories. A refund can't be filed as shopping and a salary can't be filed as rent, before Jev is asked anything.
- `category`: Choice over the categories for that direction, each described ("Streaming, software and other monthly digital services").
- `recurring`: Noul, "the merchant is usually a recurring bill or subscription".
- Totals per category are computed in code.

## Results

36 transactions from one month ([transactions.csv](transactions.csv)):

- **Category:** 35/36. The one "miss" was Boots filed as shopping instead of health, which is arguable, since Boots sells both.
- **Recurring bills found:** rent, Netflix, Spotify, water, gas, gym, mobile and Adobe.
- **Cost:** 36 calls, $0.0009. A year of transactions for one household costs about a cent.

## Lessons

- Split the option list by a fact code already knows (the sign of the amount). It shortens every question and removes whole classes of mistakes.
- Cryptic merchant strings are Jev's strength: it reads `EASYJET 0HXQ2L` as travel and `DVLA VEHICLE TAX` as car without any lookup table.
- Keep a small override table in code for your own recurring merchants; use Jev for everything else.

## Adapt it

Rename the categories to match your budgeting app or chart of accounts. For bookkeeping, add a Noul "business expense" and a Choice for the VAT treatment.
