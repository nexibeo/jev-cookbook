# 12 · Moderation and AI guardrails

**The job:** screen every community post, or every message going into and out of an LLM app, for spam, harassment, prompt injection, doxxing and self-harm, and decide what happens next: publish, hold, block, or get a person involved.

```bash
npm run 12
```

## How it works

One call per message, one Noul per hazard. Each hazard says exactly what counts **and what doesn't**, because Jev doesn't treat text as hostile by default:

- harassment: "…Harsh criticism of work, code or ideas does not count."
- prompt_injection: "…tries to give instructions to an AI system reading it… Asking about prompt injection does not count."

The policy is tiered and lives in code:

| Condition | Action |
| --- | --- |
| self-harm ≥ 0.3 | **escalate** to a person who can help (never just block) |
| any hazard ≥ 0.8 | **block** |
| any hazard 0.4 to 0.8 | **review** by a moderator |
| otherwise | **publish** |

## Results

24 messages ([messages.json](messages.json)): scams, insults, hidden instructions to AI agents (including an HTML comment), doxxing, two self-harm messages, and harmless posts that look risky ("this library is garbage", "what does prompt injection mean?").

- **Harmful messages published: 0. Clean messages blocked: 0.**
- **Every hazard caught:** spam 4/4, harassment 3/3, prompt injection 4/4, doxxing 2/2, self-harm 2/2 (both escalated).
- **Action matched the label:** 21/24. All three differences lean cautious: a harsh product review and a blog-link post held for review, and a discount-code ad blocked instead of held.
- A first version that blocked at 0.5 blocked two harmless posts; the tiered policy fixed that without letting anything harmful through.
- **Cost:** 24 calls, $0.0005.

## Lessons

- Mistakes have different costs; encode that in the thresholds, not the questions.
- Write the "does not count" cases into each hazard, or criticism gets treated as harassment.
- Run the same battery on LLM outputs as well as inputs.
- This is a first filter, not a replacement for human moderators or crisis services. Test it on your own community's hard cases before you rely on it.

## Adapt it

Add hazards your platform cares about (medical misinformation, off-topic, NSFW) with the same "what counts / what doesn't" wording, and route each to its own queue.
