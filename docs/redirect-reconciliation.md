# Redirect reconciliation

Verified against the live store via the Shopify Admin API on **2026-08-01**.
**31 redirects** exist. Nothing in this document has been created, changed or
deleted — it is a report, and every fix below needs sign-off.

Re-verify before acting. Product statuses in particular move without anyone
touching the redirect list, which is how two of these became dead ends.

---

## The headline

**The rebuild created no redirect debt.** Every rebuilt page kept its handle —
About stayed `/pages/about-us`, Stockists stayed `/pages/store-locator` — so no
URL changed as part of this theme and nothing new needs a redirect. That was the
single highest-risk item on the rebuild and it is clear.

Everything below is **pre-existing debt**, unrelated to the theme.

---

## 1. Dead ends — these 404 the customer today

A redirect that lands on an archived product is worse than no redirect: the
customer follows a link, gets sent somewhere, and still ends up on a 404.

| Path | Target | Target status |
|---|---|---|
| `/products/tomato-water-peppers` | `/products/tomato-water-basil` | **ARCHIVED** |
| `/products/half-bottle-mixed-12-pack-non-bottle-opener` → (chain) | `/products/half-bottle-mixed-12-pack-bottle-opener` | **ARCHIVED** |

Fix: repoint both at a live product or at the range collection. Deleting them is
worse — the old URL then 404s directly instead of at least reaching a real page.

## 2. Chains — A → B → C

Each hop costs a round trip and dilutes whatever ranking signal the original URL
carried. Flatten each to a single hop pointing at the final destination.

| Chain | Hops |
|---|---|
| `/products/waiters-friend` → `non-bottle-opener` → `non-waiters-friend` | 2 |
| `/products/half-bottle-mixed-12-pack-non-bottle-opener` → `375ml-mixed-12-pack-non-bottle-opener` → `half-bottle-mixed-12-pack-bottle-opener` | 2 |
| `/blogs/articles/mike-bennies-top-6-non-alc` → `nicks-top-dog-parks` → `this-is-rish` | 2 |
| `/pages/non-january-update` → `non-january-2024-roundup` → `roundup` | 2 |

Two of the intermediate products **no longer exist at all** —
`non-bottle-opener` and `375ml-mixed-12-pack-non-bottle-opener` both return null
from the Admin API. The chains only resolve because a second redirect catches
the gap. Remove the middle hop and the first redirect must be repointed in the
same change, or it will break.

Note the second chain is both a chain **and** a dead end: flattening it still
leaves it pointing at an archived product. Fix the destination first.

## 3. Valid, no action

The remaining redirects resolve to live products, pages or collections:
`nonstopper` (three old paths), `stewed-cherry-coffee`, `the-spring-set`, the
`non*-process-video` → `non*-process` set, `trade-quiz` → `training-quiz`,
the `collections/frontpage` → `collections/all` set, and the market redirects
(`/en-us`, `/en-gb`).

## 4. Not checked

- **Blog redirects** were verified as pairs but the target articles' publish
  state was not confirmed. Same archived-target risk as the products.
- The `/en-gb` redirects append `?view=codex20260708`, which pins a theme view.
  Worth confirming that is still wanted once this theme publishes — a view
  parameter surviving a theme change is the kind of thing that silently serves
  the wrong template.

---

## Why this file exists

The findings were produced once and delivered only in chat. The queue docs were
lost the same way earlier in this project — written, never committed, gone with
the session. Anything worth acting on later gets written down here.
