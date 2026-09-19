# 03 · File organizer

**The job:** a folder full of `scan_0012.txt`, `IMG_4471.txt` and `doc (3).txt`. Sort it into folders by document type and rename each file with the document's own date, like `invoices-receipts/2026-03-04 - scan_0012.txt`.

```bash
npm run 03                                              # dry run on the sample inbox: prints the plan
node --env-file=.env recipes/03-file-organizer/organize.mjs path/to/folder --apply   # copies into out/organized/
```

Originals are never moved or deleted; `--apply` copies. Files with category confidence below 0.7 go to `_review/`.

## How it works

One call per file, with the first 2,500 characters as the state:

- `category`: Choice over 12 described document types, including `other`.
- `sensitive`: Noul, "contains personal financial, medical or identity details", which shows as a `[sensitive]` flag in the plan.
- `date`: Choice over **the dates code found in the text**. Jev can't write a date, so [`lib/candidates.mjs`](../../lib/candidates.mjs) finds every date (`4 March 2026`, `17/02/2026`, `2026-03-04`, `Feb 2026`, and month names in several languages), normalises it, and keeps the surrounding words. Jev picks the one that is the document's own date, not a due date, travel date or birth date, or `none`.

## Results

On the 24 sample documents in [`inbox/`](inbox) (invoices, receipts, an NDA, a lease, CVs, meeting notes, recipes, trip plans, medical letters, manuals, school reports, letters):

- **Category:** 24/24, all at confidence ≥ 0.74 (the lowest is the one unrelated parking permit, filed under `other`).
- **Document date:** 23/24. Jev skipped due dates, travel dates, contract start dates and a date of birth. The miss is a vaccination record listing several dates, where "none of these is the document's date" is a fair reading.
- **Cost:** 24 calls, $0.0008.

## Lessons

- "Pick, don't extract" turns an impossible task (Jev writing a date) into an easy one (choosing among dates that really appear), and every answer is already in ISO format.
- The words around a value are what tell dates apart. Keep them in the option text.
- Slash dates are ambiguous: the finder reads them day/month/year. Change one line for American documents.

## Adapt it

Point it at a folder of `.txt` or `.md` files; for PDFs or images, run text extraction (pdftotext, OCR) first and pass the text. Change the categories to your own filing system.
