# Spanish translation — resume here

Registered against `gid://shopify/OnlineStoreTheme/198370820256`, locale `es`.
All writes so far returned zero `userErrors`.

**310 strings registered. All of About is done, and every storefront product's
title and SEO.**

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
| Product titles + SEO, all 20 storefront products | 51 |

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

1. **Product copy — BLOCKED on the metafield definitions.** `title`,
   `meta_title` and `meta_description` are DONE for all 20 storefront
   products (the 9 POS-only SKUs are deliberately skipped — they never
   render on the storefront). The PDP
   metafields (`custom.profile`, `custom.process`, `custom.ingredients`,
   `custom.storage`, plus `notes`, `sits`, `perfect_for_captions`) hold the
   real copy but do NOT appear in the product's `translatableContent` — their
   definitions are not marked translatable, so Shopify will not accept a
   translation for them. That flag has to be set per definition before any of
   it can be registered. Still to do once unblocked: those metafields,
   `body_html`, and the remaining products (375ml, sets, merch, gift card).

   Pattern used for SEO titles: `<title> | Alternativa al vino 0,0 %`. NOT
   "alternativa al vino sin alcohol" — that string contains "vino sin
   alcohol", which is the one rendering the glossary forbids outright.

   Two English strings carry HARD-CODED AUD PRICES that translate into
   nonsense for every other market: `BUY 6 FOR $150` at the top of every
   bottle's `body_html`, and the gift card's `meta_description` ($40/$70/
   $90/$150). Translating them faithfully propagates the problem into a
   second language. They want fixing in English first.
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
