# The DSH trust layer

Ten small plugins. Each answers **one** question about an agent session, and
answers it deterministically — no model call sits in the trust path.

An agent is trusted with four things at once: what it reads, what it writes,
where it connects, and what it remembers. Most agent-tooling plugins improve
what the agent *can* do. This suite constrains what it is *allowed to get away
with*, and makes every deviation visible instead of silent.

| Question | Plugin | Intercepts | Failure it prevents |
|---|---|---|---|
| What did it **read**? | [`dsh-read-guard`](https://github.com/zhengqiuyang/dsh-read-guard) | `tools/post-execute` results | Prompt injection arriving through files, search results or fetched pages |
| What may it **write**? | [`dsh-pr-gate`](https://github.com/zhengqiuyang/dsh-pr-gate) | write tools, at the moment of the write | Scope creep and residue — the agent editing outside the agreed surface |
| What did it **actually do**? | [`dsh-attest-chain`](https://github.com/zhengqiuyang/dsh-attest-chain) | session events | Unverifiable "the agent said it did X" claims; a signed, hash-chained record instead |
| What can it **call**? | [`dsh-mcp-test`](https://github.com/zhengqiuyang/dsh-mcp-test) | the visible tool surface | A tool silently appearing, disappearing or changing shape between runs |
| Where may it **connect**? | [`dsh-egress-gate`](https://github.com/zhengqiuyang/dsh-egress-gate) | outbound fetches | Data leaving to an unapproved destination |
| What was it **told**? | [`dsh-prompt-drift`](https://github.com/zhengqiuyang/dsh-prompt-drift) | system-prompt sections | A quiet rewrite of the instructions the agent is following |
| What did it **leave behind**? | [`dsh-janitor`](https://github.com/zhengqiuyang/dsh-janitor) | session artifacts | Debris accumulating silently; the janitor proposes, a human disposes |
| Which **composition** is running? | [`dsh-freeze`](https://github.com/zhengqiuyang/dsh-freeze) | profile fingerprint | "It worked yesterday" — a drifted plugin set with no record of the change |
| What **survived compaction**? | [`dsh-compaction-guard`](https://github.com/zhengqiuyang/dsh-compaction-guard) | compaction summaries | Constraints the agent was told to remember, silently dropped by the summary |
| What is the **overall state**? | [`dsh-trust-panel`](https://github.com/zhengqiuyang/dsh-trust-panel) | the nine channels above | Nine separate signals nobody reads; one status light instead |

## Design rules the suite holds to

1. **No LLM in the trust path.** Every verdict is a pure function of session
   state. If a check needs judgement, it reports and the human decides.
2. **Precision over recall for anything that mutates content.** `read-guard`
   defaults to `wrap`, not `block`: it marks and quarantines, it does not
   silently mangle legitimate content.
3. **Fail loud, never silently pass.** A missing baseline, a malformed policy
   or a drifted composition is an error, not a default.
4. **Every claim is testable.** Each plugin ships a fixture suite; the shared
   engines live in [repo-inject-guard](https://github.com/zhengqiuyang/repo-inject-guard),
   [agent-pr-gate](https://github.com/zhengqiuyang/agent-pr-gate) and
   [agent-janitor](https://github.com/zhengqiuyang/agent-janitor) with their own
   tests, and are vendored here so a plugin install stays a single package.

## Compose them, or take one

Each plugin is independent; installing one does not pull in the rest. The
intended deployment is the whole set, because the questions overlap: a write
gate is weaker if you cannot prove what the agent read first.

```sh
dsh plugin --profile default add \
  dsh-read-guard dsh-pr-gate dsh-attest-chain dsh-mcp-test \
  dsh-egress-gate dsh-prompt-drift dsh-janitor dsh-freeze \
  dsh-compaction-guard dsh-trust-panel
```

Start with `observe` wherever a plugin offers it, read the panel for a week,
then tighten the channels that actually fired. Turning everything to `block` on
day one teaches the operator to ignore alarms — the opposite of the goal.

## What this suite does not do

- It does not stop a determined attacker with code execution in the session;
  it narrows and records what the agent can do, it is not a sandbox.
- It does not judge intent. Rules and fingerprints are deterministic; a novel
  attack that matches no rule and no drift will pass.
- It does not replace review. `pr-gate` enforces an agreed scope, it does not
  know whether the change is good.
- It does not phone home. Nothing here sends session data anywhere.

## Status

All ten packages are published on npm (`0.1.x`, `0.2.x` for `read-guard`),
each with its own CI matrix (Ubuntu and Windows × Node 20/22/24), typecheck,
lint and a coverage floor. The suite is young: the channels are implemented and
tested, the operational stories in each README are the part still being
sharpened by real use.
