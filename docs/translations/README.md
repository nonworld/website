# Spanish translation — resume here

Registered against `gid://shopify/OnlineStoreTheme/198370820256`, locale `es`.
All writes so far returned zero `userErrors`.

**241 strings registered so far. All About PROSE is done.**

## Done

| Surface | Strings |
|---|---|
| Theme UI (`locales/es.json`) | 63 |
| Pairing section copy | 25 |
| Homepage section copy | 35 |
| Shop / collection copy | 21 |
| Contact + Stockists copy | 19 |
| About prose (complete) | 78 |

## Resume

All About PROSE is registered; `es-about-remaining.json` is gone because it is
empty. Pick up from "Still to do" below.

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

1. **About process data** — `p_b1..p_b6` × `titles`, `bodies`, `captions`. These
   are NEWLINE-ALIGNED LISTS: line *n* of `titles` pairs with line *n* of
   `bodies` and `captions`. Assert the line count is identical before and after,
   per field, or the steps desync from their captions.
2. **Product copy** — titles, descriptions, and the metafields the PDP reads
   (`profile`, `process`, `ingredients`, `storage`).
3. **The somm worker** — answers are generated live and CANNOT be translated
   afterwards. The target language and the glossary have to go into the prompt
   in `worker/somm/src`. Deploys with wrangler, which is authenticated here.

## The rule that matters

Some settings look like prose and are DATA. Three found so far:

- Pairing axis `options` — `Label | SCORES | trace | SKIP`. Translate fields 0
  and 2 only; carry 1 and 3 across untouched.
- Shop `chip-*.key` — matched against each product's `custom.food_tags` JSON.
  Translate the `.label`, never the `.key`.
- About `p_b*` — newline-aligned lists, as above.

Always list what you did NOT translate, and why. The skipped set is where the
damage lives. See `docs/translation-glossary.md` for the terms that must never
be translated — above all, "wine alternative" must never become
"vino sin alcohol".
