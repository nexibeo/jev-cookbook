# 09 · Invoice extraction by picking

**The job:** read the invoice number, invoice date, due date and total from invoices and receipts in any layout and several languages.

```bash
npm run 09
```

## How it works

Jev can't copy a value out of a document. So:

1. [`lib/candidates.mjs`](../../lib/candidates.mjs) finds every date, amount and reference number with regular expressions and normalises them (`15.01.2026` → `2026-01-15`, `€1.200,00` → `1200.00`, `9 febbraio 2026` → `2026-02-09`), keeping the words around each one.
2. One call per document: a Noul "is this an invoice, bill or receipt (not a quote)" and one **Choice per field** over the candidates, each with a `none` option.
3. Every answer is a value that really appears in the document, already in a clean format.

```js
due_date: choice('Which date is the payment deadline in `document`? Not the issue date, a service period or a validity date.',
  { c0: '2026-03-04 (in: "...Invoice date: 4 March 2026 Due date: 3 A...")', c1: '2026-04-03 (in: "...")', none: 'None of these values' })
```

## Results

10 documents ([invoices.json](invoices.json)): English, German and Italian invoices, a cloud bill with credits, a dental statement with an earlier payment, a restaurant receipt, a membership renewal with a service period, and a quote that is not an invoice.

- **Fields:** 40/40 in the final run. An earlier run left the receipt's "Order #5531" out as its number, a defensible reading of "not an order number unless it is the only reference".
- The quote correctly returned no invoice fields; the German and Italian formats worked with no extra code.
- **Cost:** 10 calls, $0.0005.

## Lessons

- "Pick, don't extract" gives you exact, normalised values and no invented ones.
- The question wording carries the business rule: "after tax, discounts and credits" and "not a service period".
- Test the candidate finders offline first. Jev can't pick a value the regex didn't find.

## Adapt it

Add fields the same way (VAT number, IBAN, PO number) with a finder for each. For scanned PDFs, OCR first and pass the text.
