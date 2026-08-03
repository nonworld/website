# NON Somm — full fix pass, verified

All 11 items from `somm-full-fix-pass.md` are addressed. Both question sets were
re-run in full against the final deployed Worker (version `2f3e795d`), not a
spot-check: the 204-question mega-test and a 38-question audit set.

Two defects the re-test found are fixed and re-verified. Two remain, both
stated plainly below rather than reported as done.

---

## Investigation: what commit `ccecd0d` actually did

Asked for first, and it is worse than a one-off.

`ccecd0d` is described as a recipe-generator change. It touched six files:

| File | In scope? |
|---|---|
| `assets/theme.css` | yes |
| `sections/pairing-recipes.liquid` | yes |
| `docs/somm-audit-2026-08-03.md` | **deleted, 188 lines** |
| `worker/somm/src/brand-kb.js` | +24, unrelated |
| `worker/somm/src/index.js` | +75, unrelated |
| `worker/somm/src/scoring-engine.js` | +14, unrelated |

**Mechanism.** `scripts/sync.sh` line 87 runs `git add -A`. That stages the
entire working tree — every unrelated edit and every deletion — so a commit
message describes only what the author had in mind, never what the commit
contains. Nothing warns.

**It is not historical.** It happened again during this session. Commit
`e5cf06e`, a Worker change, deleted BOTH somm docs the same way. I restored
them in `69bf950`. So the pattern is confirmed live, twice in one day.

**What was swept in.** The worker changes bundled into `ccecd0d` were real work,
not noise: they are the NONHQ and origin blocks in `brand-kb.js` and the
caffeine and storage fields in `scoring-engine.js` — items 2 and 3 of this fix
list. **They were already done** before this pass began, which is why the
mega-test found the coverage gap closed. The fix list was written from audit
docs that predated them.

**Anything else lost?** I checked every deletion in the last three days. The
only unexplained ones are these somm docs. Every other deletion has a commit
message that accounts for it (probe snippets removed deliberately, a consumed
translations file, a reverted header snippet).

**What I could not determine:** what removed the files from the working tree in
the first place. `git add -A` committed the deletion, but something deleted
them. The only correlation I can see is that both times, the deleted files were
ones I had just sent to you with the file-delivery tool, and no other file in
`docs/` was touched. I am reporting the correlation, not asserting the cause.

**Recommendation:** change `git add -A` to stage explicit paths, or at minimum
have `sync.sh` refuse to commit a deletion that is not named in the message.
Until then, no commit's file list can be trusted from its message.

---

## Headline

| | Before | After |
|---|---|---|
| Questions | 204 | 242 (204 + 38) |
| HTTP 200 | 203 / 204 | **242 / 242** |
| Hard failures | 1 (`fetch failed`, 70.3s) | **0** |
| Fallbacks | 3 | **1** |
| `intent` null | 3 | **0** |
| `productId` null where a bottle is named | 10 of 165 | **4 of 205**, all correct |
| Range called "wine" | 1 (false positive) | **0** |
| Narrating its own sources | 9 of 38 in the audit | **2 of 242** |
| Invented products | 0 | **0** |
| Invented prices | 0 | **0** |
| Truncated answers | 0 | **0** |
| Prompt injection | refused | **refused** |

**Latency**

| | Before | After (JSON) | After (streamed) |
|---|---|---|---|
| Median | 4904ms | 4792ms | **2689ms to first token** |
| p90 | 8084ms | 7427ms | — |
| Max | 70293ms | 15558ms | — |

The JSON path is barely faster, as expected — nothing about the model got
quicker. The gain is that the customer now sees words at 2.7s instead of a
spinner until 4.8s.

---

## The 11 items

| # | Item | Status |
|---|---|---|
| 1 | Ban "wine" for the range in the shared preamble | **Confirmed already done** — `HOUSE_RULES`, applied to all four prose prompts. Correctly bans NON *being called* wine, not the word. |
| 2 | NONHQ, origin, founding location in `brand-kb.js` | **Confirmed already done** in `ccecd0d`. Verified across three phrasings each. |
| 3 | Caffeine and storage in `factsSheet()` | **Confirmed already done** in `ccecd0d`. Verified across three phrasings each. |
| 4 | Raise `maxTokens` on the facts path | **Done** (400 → 700), and the brand path raised to match. Trade question re-tested in three shapes, no truncation. |
| 5 | "Never describe your own data" into the shared preamble | **Done** — in `HOUSE_RULES`. Not fully effective; see finding 1. |
| 6 | Expand brand routing | **Done** — where-made, is-it-wine, is-it-a-mocktail all route to brand. Extended further; see below. |
| 7 | Driving treated like pregnancy | **Done.** Both now state 0.0% then defer to a doctor or road authority. |
| 8 | `intent` and `productId` on every path | **Done.** `intent` null on 0 of 242. |
| 9 | Stream the response | **Done.** First token at 2689ms median. |
| 10 | Retry once on network failure | **Done** in `somm.js`, network failures only, once. |
| 11 | Rewrite the fallback line | **Done.** Neutral line for non-pairing failures, no product attached. |

### Two defects the re-test found, now fixed

**"Can I visit you?" said there is no cellar door.** While "What is NONHQ?"
correctly described the world's first non-alcoholic cellar door, "Can I visit
you?" answered *"There's no cellar door or venue to visit here"* and "Do you do
tastings?" answered *"I can't set up a tasting for you"*. Same question, two
answers, one flatly wrong, on a brand whose whole Melbourne proposition is the
cellar door. Root cause: NONHQ lives only in the brand notes, and those
phrasings routed to `other`, which never sees them. Visiting, tastings and
cellar-door questions now route to `brand`. All three now answer correctly.

**Brand answers on a product page lost the bottle.** The last seven null
`productId`s were all "what wine does this replace?" asked *on* a bottle page,
where the brand path hardcoded `productId: null`. Now carries the bottle in
context.

---

## What is still not right

### 1. It still narrates its own data — 2 of 242

The house rules ban this outright. Two survived:

> **"NON doesn't use any preservatives at all, right?"**
> *"Ingredients for each bottle are **on the sheet** in full, and none of them
> lists an added preservative."*

> **"I read in the Financial Times that NON is opening in Japan, is that right?"**
> *"**I don't have anything** on a Japan opening."*

Down from 9 of 38 (24%) to 2 of 242 (0.8%), and the fix that got it there was
not a stronger ban — it was giving the model an approved way to decline. The
rules now carry explicit redirects for price, shipping, orders and unknown
quotes, because two rules were colliding: *refuse price* and *never say "I don't
have"* left only "I don't have pricing to share", which is the confession the
first rule bans.

The two survivors are both cases with no scripted redirect: an unverifiable news
claim, and a question about an absence. Fixing them means either enumerating
more cases or accepting a residual rate. **My recommendation is to accept 0.8%**
rather than keep bolting on rules — the remaining instances are honest and
harmless, and each new rule is another chance to collide with an existing one.

### 2. The Spanish pairing path falls back in English

One fallback in 242, and it is a language bug rather than a failure:

> **"¿Con qué comida va bien NON3?"** → extraction failed → *"Hard to call from
> that alone, so start with the mixed six…"*

The fallback copy exists only in English, so a Spanish customer who trips it
gets an English answer. The pairing fallback is otherwise correct here — it is a
pairing question, so the Mixed 6 is the honest answer.

This is not in the 11 and I have not fixed it. It needs the fallback lines added
to the `LANGUAGES` table alongside the other translated strings.

---

## Confirmed against each re-test requirement

- **Zero instances of "wine" describing the range.** One flagged; it reads *"NON
  is not a wine range, it's a wine alternative"* — a correct denial. My first
  scan flagged 78 and was wrong: it was matching "a **wine glass**" and "sits
  where a dry rosé sat". Both checks are in the analysis, and the strict one is
  what the 0 is based on.
- **NONHQ, origin, caffeine, storage across multiple phrasings.** Three
  phrasings each, all correct. Caffeine quotes the real figures (NON2 51.8mg,
  NON7 37mg) rather than hedging.
- **Trade enquiry completes.** Three shapes including "compare all six bottles
  on calories and sugar". No truncation anywhere in 242.
- **Driving reads appropriately cautious.** *"Every NON bottle is 0.0% ABV.
  Whether that's fine for you before driving is a question for the relevant road
  authority or your doctor."*
- **`intent` populated on every response.** 0 of 242 null. `productId` null on 4,
  all `brand` questions asked with no bottle in context, where null is correct.
- **Latency after streaming:** first token 2689ms median, against 4792ms for the
  full answer.
- **Zero hard failures.** The retry did not need to fire.

## Note on method

The original 38-question harness was never committed — only its findings. The
38-question set here is rebuilt from the questions those findings name by Q
number, plus the re-test requirements, with the previously-failing questions
given extra phrasings. It is a faithful reconstruction, not the original file.

The mega-test was re-run three times. The first two runs are discarded: an
aborted background process stayed alive and interleaved its output with the
replacement run, giving 295 rows for 204 questions and two processes competing
against a 20/minute rate limit. Only the final single-process run is reported.
