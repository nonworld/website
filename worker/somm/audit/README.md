# NON Somm — audit harnesses

The scripts that produced `docs/somm-audit-2026-08-03.md`,
`docs/somm-megatest-2026-08-03.md` and `docs/somm-fix-pass-2026-08-03.md`.

They live here because the first audit's harness was never committed — only its
findings — so the fix pass had to *reconstruct* the 38 questions from the Q
numbers the findings happened to name. A re-run that rebuilds its own questions
is not a re-run; it cannot tell you whether a fix held.

## Running them

Point at the live Worker. Nothing is mocked, and the results are only as good
as the deploy they hit, so deploy first and check the version.

```bash
node worker/somm/audit/megatest.mjs    # 204 questions, ~17 minutes
```

```bash
node worker/somm/audit/audit38.mjs     # 38 questions, ~3 minutes
```

```bash
node worker/somm/audit/ttft.mjs        # streaming: time to first token
```

Each writes `*-results.jsonl` beside itself. Those are gitignored: they are
evidence for one run against one deploy, not source.

## Two traps, both hit for real

**Run them one at a time.** The Worker rate-limits at 20/minute. Two harnesses
at once do not just take longer, they inflate every latency reading and can
return 429s that read as failures. `megatest.mjs` now takes a lock file to stop
a second run starting; `audit38.mjs` is short enough to sequence by hand.

**A backgrounded run can outlive the shell that started it.** One was killed at
the shell, survived, and kept appending while its replacement wrote to the same
file — 295 rows for 204 questions, silently. Always check the row count and the
unique question count before trusting a result:

```bash
python3 -c "
import json;r=[json.loads(l) for l in open('worker/somm/audit/megatest-results.jsonl') if l.strip()]
print(len(r),'rows,',len({x['n'] for x in r}),'unique')"
```

If those two numbers differ, throw the run away.

## What the checks look for

Analysis is deliberately separate from collection, so a crash at question 150
does not cost the first 149. The scans that matter:

- the range being called "wine" — strip "wine glass", "sits where a wine sat"
  and the somm's own denials first, or the check reports dozens of false
  positives. It did.
- narrating its own sources: "I don't have", "the sheet", "the notes"
- invented bottles: any `NON<digit>` outside 1, 2, 3, 5, 7, 9
- invented prices: any `$` figure at all
- truncation: an answer ending on a letter or comma
- `intent` and `productId` present on every response
