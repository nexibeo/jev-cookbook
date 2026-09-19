# 07 · PII column scanner

**The job:** you have dozens of databases and nobody knows which columns hold personal data. Label every column with what it holds, whether it's personal data, and how sensitive it is, to feed a data catalog, masking rules and GDPR records.

```bash
npm run 07     # writes out/data-catalog.json
```

## How it works

For each column, the state is its table, name, five sample values (as `SELECT col FROM t LIMIT 5` returns them) and **pattern hints computed by code**: the share of samples that pass the Luhn card checksum, look like an IBAN, an email, an IP or a phone number. Jev is weak at judging digit strings, so code does the exact checks and Jev does the judgment.

Three questions per column:

- `type`: Choice over 21 semantic types (email, national ID, payment card, health info, free text, identifier…)
- `personal`: Noul, "identifies or relates to an identifiable person (personal data under GDPR), including partial identifiers and free text that mentions contact details"
- `sensitivity`: Score over 4 described levels, from public to restricted

The action (`encrypt + restrict access`, `mask in analytics`, `none`) is decided in code from the sensitivity level.

## Results

25 columns across `customers`, `payments` and `patients` ([tables.json](tables.json)):

- **Type:** 25/25, including a free-text `agent_notes` column holding a phone number, `card_last4` versus full card numbers, and `home_lat_lng`.
- **Sensitivity:** 25/25 exact; all 5 restricted columns (card number, IBAN, NHS number, allergies, visit reason) marked for encryption.
- **Personal data:** 23/25. Both misses are arguable: `customer_id` was called personal (under GDPR a pseudonymous ID often is), and `visit_reason` was not, because the samples alone name nobody.
- **Cost:** 25 calls, $0.0010.

## Lessons

- Pair cheap exact detectors with Jev's judgment. Regex alone misses the notes column; Jev alone struggles with digits.
- Put the policy in code, keyed off a Score, so compliance can change the rules without changing the questions.
- Sample values carry the signal. Five is usually enough; include empty values if the column has them.

## Adapt it

Replace `tables.json` with a dump of `information_schema.columns` plus `SELECT ... LIMIT 5` per column. Never send more real data than you need: five values per column, and consider hashing values before sampling in very sensitive systems.
