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

---

## 3. Klaviyo — where the scratch card sign-ups land

Wired to the lotto's `/claim` endpoint. The Worker calls Klaviyo; the theme
never does, so no Klaviyo key is exposed in the storefront.

### The list

Created and empty:

| | |
|---|---|
| Name | **NON Lotto — scratch card entries** |
| List ID | `WQLa3T` |
| Opt-in | single |
| Admin | https://www.klaviyo.com/lists/WQLa3T |

Single opt-in is deliberate: the customer has just been shown a prize and asked
where to send it, so a confirmation email in between loses most of them. It
does mean the list is a lower-consent audience than the main newsletter — keep
it separate rather than merging it in, and hold the double opt-in list as the
one you send broad campaigns to.

### What `/claim` should do

Two calls, in this order.

**1. Track the event.** This is what a flow triggers off, and it carries the
prize so the email can name it.

```
POST https://a.klaviyo.com/api/events/
Authorization: Klaviyo-API-Key <private key>
revision: 2024-10-15

{ "data": { "type": "event", "attributes": {
    "metric":  { "data": { "type": "metric", "attributes": { "name": "Scratched NON Lotto" } } },
    "profile": { "data": { "type": "profile", "attributes": { "email": "you@email.com" } } },
    "properties": {
      "prize_title": "15% off your first case",
      "discount_code": "NON15",
      "prize_terms": "Use it at checkout.",
      "ref": "N° 4821",
      "page": "/"
    },
    "unique_id": "N° 4821"
} } }
```

`unique_id` set to the draw ref makes the call idempotent — a double-submit or
a retry will not fire the flow twice.

**2. Subscribe to the list.** This is the consent record.

```
POST https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/
{ "data": { "type": "profile-subscription-bulk-create-job", "attributes": {
    "profiles": { "data": [ { "type": "profile", "attributes": {
        "email": "you@email.com",
        "subscriptions": { "email": { "marketing": { "consent": "SUBSCRIBED" } } }
    } } ] }
  }, "relationships": { "list": { "data": { "type": "list", "id": "WQLa3T" } } } }
}
```

Order matters. Track first: if the subscribe call fails you still have the
event and can recover the address, whereas the reverse loses the prize context.

### The flow — not built, deliberately

The delivery email should trigger on the **Scratched NON Lotto** metric rather
than on list membership, because the metric carries `discount_code` and list
membership does not. One email, sent immediately:

> Subject: `{{ event.prize_title }}` — here's your code
> Body: the code, the terms, an expiry, and a link straight to the shop.

I have not created or activated it. Anything that sends to customers should be
built and approved in Klaviyo rather than pushed by an agent, and the copy and
send settings are a marketing decision, not a technical one.

### Before any of this can go live

The six discount codes still do not exist in Shopify. They need min-spend,
usage-limit and expiry decisions, and `FREESTOPPER` / `ONEONUS` need the
stopper and free-bottle products chosen before a Buy-X-Get-Y can be created.
Until they exist, a customer who scratches gets a code that fails at checkout —
which is worse than no scratch card.
