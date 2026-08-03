# Spanish translation — resume here

Registered against `gid://shopify/OnlineStoreTheme/198370820256`, locale `es`.
All writes so far returned zero `userErrors`.

**259 strings registered so far. All of About is done — prose AND process data.**

## Done

| Surface | Strings |
|---|---|
| Theme UI (`locales/es.json`) | 63 |
| Pairing section copy | 25 |
| Homepage section copy | 35 |
| Shop / collection copy | 21 |
| Contact + Stockists copy | 19 |
| About prose (complete) | 78 |
| About process data (complete) | 18 |

## Resume

All of About is registered. Pick up from "Still to do" below — the next
unit is product copy.

**Re-check digests before any write.** A digest is invalidated the moment the
English changes, and a stale one fails. Re-fetch with
`translatableResource(resourceId: ...) { translatableContent { key value digest } }`
— it returns ~840KB into a tool-results file; filter by prefix rather than
reading it.

**Keep batches to ~13 strings.** A 26-string write timed out mid-flight; the
connector returned an error and NOTHING was written. Always read back after a
timeout rather than assuming either outcome — retrying blind can double-write
or skip.

## Still to do

1. **Product copy** — titles, descriptions, and the metafields the PDP reads
   (`profile`, `process`, `ingredients`, `storage`).
2. **The somm worker** — answers are generated live and CANNOT be translated
   afterwards. The target language and the glossary have to go into the prompt
   in `worker/somm/src`. Deploys with wrangler, which is authenticated here.

## The rule that matters

Some settings look like prose and are DATA. Three found so far:

- Pairing axis `options` — `Label | SCORES | trace | SKIP`. Translate fields 0
  and 2 only; carry 1 and 3 across untouched.
- Shop `chip-*.key` — matched against each product's `custom.food_tags` JSON.
  Translate the `.label`, never the `.key`.
- About `p_b*` — NEWLINE-ALIGNED LISTS: line *n* of `titles` pairs with line
  *n* of `bodies` and `captions`. Assert the count per field before writing or
  the steps desync from their captions. Registered values are in
  `es-about-process.json`; `p_b*.code` (NON1..NON9) is a product name and was
  deliberately left alone.

## The other rule: one English string, one Spanish string

"Tasted to level" appears both as a step title (`p_s5.title`) and as line 5 of
all six bottles' `titles`. It was registered twice with two different Spanish
renderings, which put both on the same page. Harmonised to
**"Ajustado al gusto"**. Before registering a list field, grep the already-
registered set for each line — repeated source strings across blocks are the
normal case here, not the exception.

Always list what you did NOT translate, and why. The skipped set is where the
damage lives. See `docs/translation-glossary.md` for the terms that must never
be translated — above all, "wine alternative" must never become
"vino sin alcohol".
