# NON Somm — pairing API

Cloudflare Worker. Two narrow Claude calls with a deterministic scoring
function between them.

```
theme section (assets/somm.js)
      |
      v
POST /somm
      |
      +-- step 1  Claude — free text → DishProfile        (extraction)
      +-- step 2  rankProducts()     — no AI              (decision)
      +-- step 3  Claude — top result → one sentence      (phrasing)
      |
      v
JSON back to the theme
```

The model never decides which bottle wins. That is the whole point: a wrapper
around a prompt is fluent and unaccountable, and when it is wrong you have
nowhere to go but the prompt. Here a wrong pairing is a number in
`src/scoring-engine.js` and you can see which one.

Two rules do most of the safety work:

- **The model is never shown a price**, so it cannot misquote one. This is not
  hypothetical: the original static design confidently quoted three different
  prices for the Mixed 6, none of which matched the store.
- **The response carries product codes**, not product copy. The theme resolves
  each code to a live Shopify product and renders title, price and stock from
  Liquid.

## Deploy

```bash
cd worker/somm
npm install
wrangler secret put ANTHROPIC_API_KEY   # prompts; paste the key, never pass it as an argument
wrangler deploy
```

`wrangler secret put` prompts for the value and stores it encrypted in
Cloudflare. Do not put the key in `wrangler.toml`, in a `[vars]` block, or on
a command line — `[vars]` is plain text in the repo and a command line lands in
shell history. `.dev.vars` is gitignored for local `wrangler dev`.

If a key is ever pasted somewhere it shouldn't be, rotate it rather than
assessing the blast radius: issue a new one, update the secret, revoke the old.

Then paste the Worker URL into the theme: **Theme settings → NON Somm → Somm
API endpoint**. Until it is set, the theme falls back to the canned seed
answers and nothing breaks.

Optional, for rate limiting: create a KV namespace and uncomment the binding in
`wrangler.toml`. Without it, rate limiting is skipped rather than failing
closed.

## API

**POST `/somm`**

```json
{ "query": "oysters, radicchio, a squeeze of lemon" }
```

```json
{
  "productId": "NON1",
  "productName": "Salted Raspberry & Chamomile",
  "score": 100,
  "explanation": "Murray River salt meets the brine and the verjus does what the lemon does, so the oysters stay the loudest thing on the plate.",
  "alternative": { "productId": "NON5", "productName": "Lemon Marmalade & Hibiscus" },

  "answer": "…same string as explanation…",
  "picks": ["NON1", "NON5"],

  "dish": { "proteins": ["oyster"], "fatLevel": 0, "…": "…" }
}
```

`answer` and `picks` duplicate the first two fields in the shape
`assets/somm.js` already consumes, so the theme needs no change. `dish` is
returned for logging and tuning.

`alternative` appears only when the runner-up is within 15 points. Two options
maximum — the point is confidence, not a menu.

The theme also sends `context`, `page`, `code` and `history`; only `query` is
required, the rest are accepted and echoed or ignored.

## Failure behaviour

| Case | Response |
|---|---|
| Empty query | 400 |
| Query over 500 chars | 400 |
| Rate limited | 429 |
| Extraction fails twice | 200, Mixed 6 fallback |
| Explanation call fails | 200, Mixed 6 fallback |

Extraction is retried once with a stricter instruction, then gives up. It does
**not** fall back to default values — a silently wrong dish profile produces a
confident, wrong recommendation, which is worse than an error.

The customer never sees a failure. The theme's own fallback sits behind this
one, so there are two layers before anything looks broken.

## Tests

```bash
npm test
```

Runs hand-written DishProfiles — what step 1 should produce — straight through
the engine, so a failure is a scoring bug rather than an extraction bug. No API
key and no network needed.

Six cases, six distinct winners. The spread check matters as much as the
individual assertions: if everything came back NON2 the weights would be
broken even with every case passing.

To check extraction itself, deploy and post real queries — that half needs the
model and cannot be asserted offline.

## Product profiles

`src/scoring-engine.js` is the source of truth. Derived from the live store —
each bottle's `custom.profile`, `custom.ingredients` and
`custom.nutritional_panel` metafields.

Two corrections against the original draft, both of which changed results:

- **The range is six bottles, not three.** NON5, NON7 and NON9 cover exactly
  the cases the other three handle worst: chilli, braise, and red meat.
- **NON3 was profiled as body 5, "sits where red sat".** It is neither. Per
  NON it sits where an *aromatic white* sat — still, bright, tart, yuzu and
  orange pith over cinnamon grip. The original design copy called it a "chilled
  light red" throughout, and that was wrong at source. At body 5 it also won
  charred-beef queries belonging to NON9, the actual big-red bottle: Shiraz
  grape skin tannin and real french oak contact.

There is also a **heat axis** the original shape did not have. Alcohol
dissolves capsaicin and amplifies burn, while salt and acid cool it — the one
axis where 0.0% has a genuine advantage over wine. Without it, a hot dish
scores on protein alone and the engine recommends a big tannic bottle, which is
the worst available answer. NON5 carries `coolsHeat: true`; bottles with tannin
4+ are penalised when heat is 3 or more.

## Known weaknesses

- **Ties break on declaration order.** Mushroom risotto currently scores NON2
  and NON7 both at 100, and NON2 wins because it appears first in the array.
  That is arbitrary. If it starts mattering, add a deliberate tiebreak — body
  proximity is the obvious one.
- **Profiles are static.** They live in the Worker, so changing one is a
  deploy. Move `PRODUCTS` into KV or D1 when the numbers stabilise, not before.
- **Nothing is logged.** What customers type into that box is the most valuable
  data this feature produces and none of it is captured yet. A KV or D1 write of
  `{query, dish, winner, score}` per request would pay for itself quickly — it
  is how you find out which pairings the engine gets wrong.
- **Stock is not consulted.** The engine can recommend a sold-out bottle. The
  theme renders availability correctly from Liquid so it will not sell what it
  cannot ship, but the recommendation itself is stock-blind.
