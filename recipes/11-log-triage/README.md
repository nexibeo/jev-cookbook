# 11 · Log triage

**The job:** decide which log lines and alerts should page someone at 3 a.m., which become a ticket, and which are noise. Log levels don't tell you: a `WARN` can be a brute-force attack and an `ERROR` can be a retry that already succeeded.

```bash
npm run 11
```

## How it works

One call per log line reads the message itself:

- `component`: Choice over 9 described parts of the system
- `severity`: Score over 4 described levels, routine to critical
- `actionable`: Noul, "an engineer needs to do something; it will not resolve by itself"
- `critical:outage`, `critical:security`, `critical:data`, `critical:money`: four Nouls that split "is it critical" into concrete facts

Two paging policies are computed in code from the same answers:

- **Score policy:** page if actionable and severity ≥ 2.5
- **Composite policy:** page if actionable and any critical Noul ≥ 0.6

## Results

24 log lines ([logs.json](logs.json)), 7 of them critical:

| | Critical events paged | Non-critical paged |
| --- | --- | --- |
| One severity Score | 4/7 | 1 |
| Four critical yes/no questions | **7/7** | 1 |

- **Component:** 96%. **Actionable:** 92%. **Severity:** 71% exact, 92% within one level.
- The Score bunched in the middle: an exhausted database pool scored 2.1, an OOM-killed API pod 2.0 and a 96%-full database disk 2.5 (just under the cut-off), so none of them paged. The specific questions ("are users unable to use the product right now?", "is data at risk?") caught all three.
- The composite policy's one extra page was a single declined card, which tripped the "payments failing" question. Its wording can be tightened to "many payments".
- **Cost:** 24 calls, $0.0007.

## Lessons

- When a judgment matters, don't ask for a number on a scale; ask the specific facts that make it serious, and combine them in code.
- Keep the Score anyway: it's a good sort order for the ticket queue.
- Run it on new error signatures, not every line: group by message template first, then ask Jev once per group.

## Adapt it

Replace the components with your services and the critical questions with your own "wake me up" rules (SLA breach, data loss, security, revenue).
