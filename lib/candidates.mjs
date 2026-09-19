// Candidate finders for "pick, don't extract".
//
// Jev never writes text, so it can't copy a value out of a document. Instead, code finds
// every plausible value with a regular expression, and Jev picks which one is the right
// one (a Choice). Each candidate keeps a snippet of surrounding text, because the words
// around a value ("Total due", "Due date") are what tell them apart.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const M = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*';
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const month = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

function collect(text, finders) {
  const found = new Map(); // normalised value -> context of its first appearance
  for (const [re, normalise] of finders) {
    for (const m of text.matchAll(re)) {
      const value = normalise(m);
      if (value && !found.has(value)) found.set(value, text.slice(Math.max(0, m.index - 45), m.index + m[0].length + 25).replace(/\s+/g, ' ').trim());
    }
  }
  return [...found].map(([value, context]) => ({ value, context }));
}

/** Dates as ISO strings. Slash dates are read day/month/year; change it for US documents. */
// Month names match case-insensitively on their first three letters, which also covers
// many European languages ("febbraio", "marzo", "Dezember").
export const dateCandidates = (text) => collect(text, [
  [new RegExp(`\\b(\\d{1,2})\\.? ${M}\\.? (\\d{4})\\b`, 'gi'), (m) => iso(m[3], month(m[2]), m[1])],
  [new RegExp(`\\b${M} (\\d{1,2}),? (\\d{4})\\b`, 'gi'), (m) => iso(m[3], month(m[1]), m[2])],
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => iso(m[1], m[2], m[3])],
  [/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g, (m) => iso(m[3], m[2], m[1])],
  [new RegExp(`(?<!\\d\\.? )\\b${M} (\\d{4})\\b`, 'gi'), (m) => iso(m[2], month(m[1]), 1)],
]);

/** Money amounts as plain numbers with two decimals ("1,234.50" and "1.234,50" both work). */
export const amountCandidates = (text) => collect(text, [
  [/(?:[$£€]|\b(?:USD|GBP|EUR))\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?)(?![.,]?\d)|(?<![\d.,])(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?![.,]?\d)/g, (m) => {
    const raw = m[1] ?? m[2];
    const decimals = /[.,]\d{2}$/.test(raw) ? raw.slice(-2) : '00';
    const whole = (/[.,]\d{2}$/.test(raw) ? raw.slice(0, -3) : raw).replace(/[.,\s]/g, '');
    return `${Number(whole)}.${decimals}`;
  }],
]);

/** Reference-like tokens: invoice numbers, order ids, PO numbers. */
export const referenceCandidates = (text) => collect(text, [
  // Letters and digits joined by - or /, e.g. INV-2026-0311, RE-7741/26
  [/\b(?=[A-Z0-9/-]*\d)(?=[A-Z0-9/-]*[A-Z])[A-Z0-9]{1,}(?:[/-][A-Z0-9]+)+\b/g, (m) => m[0]],
  // Whatever follows "#", "No.", "Nr.", "n." or "number", as long as it contains a digit, e.g. #48213, n. 2026/045
  [/(?:#|\b(?:no|nr|n|number)\b\.?:?)\s*((?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{2,})/gi, (m) => m[1]],
]);

/** Build Choice criteria from candidates, plus a way out. */
export const asOptions = (candidates, none = 'None of these') => ({
  ...Object.fromEntries(candidates.map((c, i) => [`c${i}`, `${c.value}  (in: "...${c.context}...")`])),
  none,
});
