# Spanish translation — resume here

Registered against `gid://shopify/OnlineStoreTheme/198370820256`, locale `es`.
All writes so far returned zero `userErrors`.

## Done

| Surface | Strings |
|---|---|
| Theme UI (`locales/es.json`) | 63 |
| Pairing section copy | 25 |
| Homepage section copy | 35 |
| Shop / collection copy | 21 |
| Contact + Stockists copy | 19 |
| About prose, first batch | 26 |

## Resume

`es-about-remaining.json` holds the **52 remaining About prose strings**, already
translated, with their keys and digests. Register them with:

```graphql
mutation Reg($resourceId: ID!, $translations: [TranslationInput!]!) {
  translationsRegister(resourceId: $resourceId, translations: $translations) {
    translations { key }
    userErrors { field message }
  }
}
```

**Re-check the digests first.** A digest is invalidated the moment the English
changes, and a stale one fails the write. Re-fetch with
`translatableResource(resourceId: ...) { translatableContent { key value digest } }`
— it returns ~840KB, so it lands in a tool-results file; filter by prefix
rather than reading it.

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
