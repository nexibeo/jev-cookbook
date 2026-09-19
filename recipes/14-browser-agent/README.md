# 14 · Browser agent

**The job:** give a goal and a start URL; the agent navigates, searches and fills forms on a real website. Jev decides every action; code owns the loop and every safety rule.

```bash
npm install                     # playwright-core
npx playwright install chromium # or set CHROME_PATH to an installed Chrome
npm run browser -- "Find and open the Wikipedia article about Gödel's incompleteness theorems." https://en.wikipedia.org/wiki/Main_Page
npm run 14                      # the six test tasks
```

## How it works

Each step of [agent.mjs](agent.mjs) (about 180 lines):

1. **Snapshot** the page in one call: every visible link, button, field and dropdown gets a `data-jev-id` and a description with its label, current value, checked state, link path and the text of its enclosing card. On-screen elements come first, capped at 240. Password and file fields are never offered.
2. **Ask Jev once:** `action`, a Choice over `click_e12`, `type_e3`, `select_e5`, `scroll_down`, `back` and `done`, plus two Nouls, `goal_done` and `stuck`.
3. **Stop gates in code:** stop at `done` (marked `done_unconfirmed` if `goal_done` disagrees), at goal > 0.85, or at stuck > 0.85 after step 2.
4. **Act** through the element's own id, never through model text. When Jev picks a typing action, a small text model (`inception/mercury-2.5` by default) writes the value as `{"text": "..."}`.
5. **Record** whether the page changed; if an action had no effect, take the next-best option.

It also offers only moves that can work (no `scroll_down` at the bottom of the page), retries with fewer elements if a page exceeds Jev's 32k-token limit, and treats a failed click as an outcome rather than a crash.

## Results

Six live tasks ([run-tests.mjs](run-tests.mjs)), each checked by code against the final URL:

| Task | Result | Steps | Time | Cost |
| --- | --- | --- | --- | --- |
| Wikipedia: follow links from Coffee to Ristretto | PASS | 3 | 4.6 s | $0.0025 |
| Wikipedia: search and open an article | PASS | 3 | 4.6 s | $0.0030 |
| Fill a test order form without submitting | PASS | 5 | 4.9 s | $0.0005 |
| templatesgrokbot.com: open the "Cold Email" template | **FAIL**: opened Cold Outreach | 2 | 3.2 s | $0.0010 |
| templatesgrokbot.com: find a sales-outreach template | PASS | 2 | 3.5 s | $0.0010 |
| templatesgrokbot.com: recruiters page, then a template | PASS | 3 | 4.1 s | $0.0016 |

The failure is instructive: "Cold Email" and "Cold Outreach" look alike, and both the action and the `goal_done` check agreed on the wrong page. Only code (checking the page title or URL) catches that.

## Lessons from building it

- The `stuck` check reads high on step 1, before anything has happened (0.59 to 0.85 with no history). Only act on it after step 2.
- Show current state: adding `[checked]` to checkboxes raised the final `goal_done` on the form from 0.67 to 0.89.
- Scrolling must count as a change, or no-op recovery fires on every scroll.
- Pages with many languages (Wikipedia's home page) exceed the token limit faster than character counts suggest. Retry with fewer elements.
- Low confidence among look-alike options is normal; don't block navigation on it. Use the watchers and the stop gates.

## Safety

Model output never becomes a selector, coordinates or code. Leave dangerous actions (buy, pay, delete, send) out of the action list unless the task allows them, put irreversible clicks behind a human confirmation, use a separate browser profile, and treat page text as hostile. For a hardened agent, see [Browser Use's Jev Ultrafast](https://github.com/browser-use/jev-ultrafast), which adds freshness and click-occlusion checks. The [guide](../../docs/GUIDE.md#browser-automation-with-jev) compares both designs.
