# Product metafields

The design carried every bottle's copy in a JavaScript object. In the theme
that copy belongs to the product, so it survives merchandising changes and the
somm can read it.

Create these under **Settings → Custom data → Products** in the `custom`
namespace. Nothing here is required for the theme to render — each field has a
fallback — but the somm, the shop filter and the product page all get thinner
without them.

| Key | Type | Example | Used by |
|---|---|---|---|
| `non_code` | Single line text | `NON1` | **Everything.** The join key between Shopify products and the design's bottle codes. Set this first. |
| `tastes` | Single line text | `Tart, saline, floral` | Card note, product spec grid, somm pick cards |
| `sits` | Single line text | `A dry rosé sat` | Card note, product spec grid |
| `style` | Single line text | `sparkling` / `still` | Product eyebrow |
| `blurb` | Multi-line text | `Tart, saline and floral…` | Product page intro |
| `nutrition` | Single line text | `37 calories, 7.1g sugar` | Product spec grid |
| `serve` | Single line text | `6°C, wine glass` | Product spec grid |
| `ingredients` | Multi-line text | `Water, verjus, raspberries…` | Product page |
| `process_steps` | JSON | see below | "How it's made" |
| `pairings` | JSON | see below | "What to put it with" |
| `food_tags` | JSON | see below | Shop somm filter — scoring |
| `food_why` | JSON | see below | Shop somm filter — the reason line |
| `related` | Product list | 3 products | Related bottles |
| `somm_seeds` | JSON | `[{"label":"…","answer":"…"}]` | Per-bottle somm prompts |

Variant-level, in the same namespace:

| Key | Type | Example | Used by |
|---|---|---|---|
| `units` | Integer | `6` | Per-bottle price maths on the pack selector. Without it a 6-pack reads as one unit and the "each" price is wrong. |

## JSON shapes

`process_steps`

```json
[
  { "n": "01", "title": "Cold steep, 48 hours", "body": "Freeze-dried Tasmanian raspberries sit cold so the fruit stays bright instead of jammy." },
  { "n": "02", "title": "Chamomile for tannin", "body": "Brewed strong. This is the grip that stops it drinking like cordial." }
]
```

`pairings`

```json
[
  { "title": "Oysters & cured fish", "body": "Salinity meets salinity. Verjus does what a squeeze of lemon does." }
]
```

`food_tags` — 0–3 per occasion. The keys must match the `key` on the collection
section's occasion blocks (`raw`, `seafood`, `veg`, `charred`, `braise`,
`spice`, `cheese`, `sweet`, `aperitif`).

```json
{ "raw": 3, "seafood": 3, "veg": 1, "charred": 0, "braise": 0, "spice": 2, "cheese": 2, "sweet": 1, "aperitif": 2 }
```

`food_why` — only for the occasions this bottle actually answers.

```json
{
  "raw": "Salinity meets brine. Verjus does what a squeeze of lemon does.",
  "spice": "Acid and a little fruit cool chilli where alcohol would stoke it."
}
```

## Values from the design

The scoring tables and reason lines for NON1, NON2, NON3, NON5, NON7, NON9,
the NONstopper, the Mixed 6 and the Everyday Set are all in the original
export at `shop.html` (the `RANGE` array). They transfer to `food_tags` and
`food_why` unchanged.

Per-bottle copy — blurb, nutrition, ingredients, process steps, pairings and
somm seeds — is in `product.html` (the `DATA` object) for NON1, NON2, NON3,
NON5, NON7 and NON9.
