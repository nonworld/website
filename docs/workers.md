# External endpoints

Two features need a server. Both are stubbed in the theme: set the URL in
**Theme settings** and the theme starts calling it, leave it blank and the
theme degrades to something honest rather than broken.

Neither is a Shopify app. They are standalone Cloudflare Workers, so the theme
stays a theme.

---

## 1. NON Somm — `settings.somm_endpoint`

Consumed by `assets/somm.js`.

### Request

```
POST <endpoint>
Content-Type: application/json

{
  "query":   "roast chicken, friday night",
  "context": "home" | "product" | "collection",
  "page":    "/products/non3",
  "code":    "NON3",                       // product pages only
  "history": [ { "role": "user" | "assistant", "text": "…" } ]
}
```

### Response

```json
{
  "answer": "Roast chicken wants grip and a little sweetness to meet the skin…",
  "picks":  ["NON3", "NON1"]
}
```

`picks` are bottle codes. The theme resolves each one to a live Shopify
product through the catalogue block it renders into the page, so the Worker
never needs to know prices, URLs or stock.

### Streaming

If the response is `text/event-stream`, `somm.js` reads frames as they arrive:

```
data: {"token":"Roast "}
data: {"token":"chicken "}
data: {"picks":["NON3","NON1"]}
data: [DONE]
```

Set **Stream the answer** off in theme settings if you stream, so the client
doesn't also type it out locally.

### Failure

Any non-200, a CORS rejection or a network error falls back to the canned seed
answers held in the section's blocks. The somm never shows an error state to a
customer — it just gets less clever.

### Notes for whoever builds it

- CORS must allow the storefront origin and `https://<store>.myshopify.com`.
- Rate-limit per IP. The input is a free-text box on a public homepage.
- The range is nine bottles. Ground the model in the real catalogue
  (the metafields in `docs/metafields.md` are the source) rather than letting
  it invent SKUs — a pick code the store doesn't have renders as nothing.

---

## 2. NON Lotto — `settings.lotto_endpoint`

Consumed by `assets/lotto.js`.

The original implementation (`nonworld/scratchie`, and the copy in the static
export) picked the prize in the browser from a weighted table and carried all
six discount codes in the page source. Anyone could read every code without
scratching, and the odds were public. That is the one thing that had to move
server-side.

### Draw

```
POST <endpoint>/draw
{ "page": "/" }
```

```json
{
  "ref": "N° 4821",
  "prize": {
    "title": "15% off your first case",
    "code":  "NON15",
    "terms": "Use it at checkout."
  }
}
```

### Claim

```
POST <endpoint>/claim
{ "ref": "N° 4821", "email": "you@email.com" }
```

```json
{ "ok": true }
```

This is where the email goes to Klaviyo. Doing it here keeps the list-write
key out of the theme.

### The odds

Weighting lives in the Worker and must not be readable from the page. Current
table — every card wins, odds sum to 100:

| Prize | Code | Odds | Shopify discount type |
|---|---|---:|---|
| 15% off your first case | `NON15` | 28% | Amount off order — 15% |
| A free NON stopper | `FREESTOPPER` | 24% | Buy X Get Y — 1× stopper at 100% off |
| Complimentary shipping | `FREEPOUR` | 20% | Free shipping |
| A bottle of NON, on us | `ONEONUS` | 14% | Buy X Get Y — 1× bottle free (set a min spend) |
| 10% off | `NON10` | 10% | Amount off order — 10% |
| 25% off + free shipping | `THEHOUSE` | 4% | Amount off order 25% **+** free shipping (allow combine) |

`FREESTOPPER` sits at 24% deliberately: roughly 80% of stopper recipients
reorder, so it is the strongest retention prize in the table.

### Two ways to issue the code

**Static codes** — create the six discounts once in Shopify and have the
Worker return the matching code string. Simplest, and what the table above
assumes. The trade-off is that a code, once revealed, is shareable; cap it
with usage limits and a min spend.

**Minted codes** — the Worker calls the Admin API
(`discountCodeBasicCreate` / `discountCodeBxgyCreate`) and returns a
single-use code like `NON15-4F2A9C`. Not shareable, but needs an Admin API
token with `write_discounts` and some housekeeping for expiry.

The theme supports both — it just renders whatever `prize.code` says.

### Still outstanding

The six discounts do not exist in Shopify yet. They need min-spend, usage-limit
and expiry decisions, and `FREESTOPPER` / `ONEONUS` need the stopper and
free-bottle products chosen before a Buy-X-Get-Y can be created.

Until the endpoint is set, the widget stays closed — a scratch card with no
prize behind it is worse than no scratch card.
