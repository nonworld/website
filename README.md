# NON — Shopify theme

The NON storefront, rebuilt as a Shopify theme from the static design export
(previously the `site 3` folder in this repo, and the Netlify preview at
`tiny-treacle-53cca3.netlify.app`).

Single theme. No private app. The two features that genuinely need a server —
the somm's model call and the lotto's discount issuance — call out to
Cloudflare Workers hosted separately; see [`docs/workers.md`](docs/workers.md).

---

## Branches

Shopify's GitHub integration connects **one branch to one theme**. Connect
both, from Online Store → Themes → Add theme → Connect from GitHub.

| Branch | Theme in Shopify | Use |
|---|---|---|
| `main` | **NON — live** (published) | Production. Only ever merged into, never committed to directly. |
| `staging` | **NON — staging** (unpublished) | Preview. Everything lands here first and is checked on the preview URL. |

Working rule: branch off `staging`, PR into `staging`, look at the preview,
then PR `staging` → `main`.

Two things to know about the integration:

- It is **two-way**. Edits made in the theme editor commit back to the
  connected branch. Expect commits authored by Shopify, mostly to
  `templates/*.json`, `config/settings_data.json` and section group files.
  Pull before you start work.
- It only syncs the theme directories. Anything else in the repo (`docs/`,
  this README) is ignored by Shopify and safe to keep here.

---

## Layout

```
assets/          css + js, one file per concern
config/          settings_schema.json (theme settings) + settings_data.json
docs/            metafield contract, external endpoint specs
layout/          theme.liquid
locales/         en.default.json
sections/        the page furniture, all schema-driven
snippets/        product-card, cart-drawer, non-code, meta-tags
templates/       JSON templates composing sections
```

### Pages

| Design page | Template | Notes |
|---|---|---|
| home | `templates/index.json` | hero + somm, poured-at marquee, core range, triptych, press, split feature |
| shop | `templates/collection.json` | somm-as-filter over the collection |
| product | `templates/product.json` | gallery, pack variants, per-bottle somm, process, pairings, related |
| pairing | `templates/page.pairing.json` | needs a page with handle `pairing` |
| stockists | `templates/page.stockists.json` | needs a page with handle `stockists` |
| NONHQ | `templates/page.nonhq.json` | needs a page with handle `nonhq` |
| about | `templates/page.json` | plain page; paste the copy into the page body |
| cart | `templates/cart.json` | plus the drawer, on every page |

Create the four pages in Shopify with those exact handles and assign the
matching template.

---

## Setup, in order

1. **Create the products** — NON1, NON2, NON3, NON5, NON7, NON9, the
   NONstopper, the Mixed 6 and the Everyday Set.
2. **Set `custom.non_code` on each** (`NON1`, `NON2`, …). This is the join key
   between Shopify and everything the design keyed off a bottle code. Without
   it the somm's picks and the shop filter are inert. See
   [`docs/metafields.md`](docs/metafields.md).
3. **Add the rest of the metafields** — tastes, blurb, ingredients, process
   steps, food tags. All of the values already exist in the old export.
4. **Build the collections** — one for the core range, set it in
   Theme settings → Product mapping.
5. **Create the menus** — `main-menu` (Shop, Pairing, About, Stockists, NONHQ)
   and `footer`.
6. **Upload the logo** in Theme settings → Brand. Until then the header falls
   back to `assets/non-logotype.svg`, which is the correct mark.
7. **Point the endpoints** at the Workers, if they exist yet. Both features
   degrade gracefully while they don't.

---

## What changed from the design

Faithful in look, spacing, type and imagery. Structurally different where the
design's approach doesn't survive contact with a real store:

- **Cart** is Shopify's AJAX Cart API. The design tracked `cart: 0` in
  component state and never left the page; nothing survives from it beyond the
  header count, which now reads from `/cart.js`.
- **Layout breakpoints** were JS state (`narrow`/`mid` measured on resize) and
  are now CSS media queries, so the page is laid out before JS runs.
- **Product data** was a hardcoded object. It's now Liquid over real products
  and metafields.
- **Lotto odds and codes** moved server-side. The design shipped all six
  discount codes in the page source, so any visitor could read every code
  without scratching.
- **Somm answers** were canned. They're now an API call, with those same
  canned answers kept as the offline fallback and as the one-tap prompts.

---

## Known gaps

Verified against the live store (non.world, AUD, Advanced plan) rather than assumed.

- **Helvetica Neue is `local()` only.** The macOS system font is licensed to
  the OS and cannot be converted and served from the theme, so Mac and iOS get
  the real face and everyone else falls through to Arial. Fix is a licensed
  webfont (Helvetica Now, Neue Haas Grotesk) with a `url()` source in
  `theme.css`.
- **No recipe images.** All thirty `non_recipe` entries have an empty `image`
  field, so the recipe panel renders text-only. See `docs/recipes.md`.
- **Section imagery needs uploading.** Product media comes from Shopify, but
  the hero, triptych and venue logos are theme-editor images and are empty.
- **Duplicate product in the store.** Two active products are both called
  "The Everyday Set" on the same SKU `NON-SET-EVERYDAY` — `the-everyday-set`
  (0 inventory) and `the-everyday-set-1` (807). Not a theme bug, but the
  collection will show it twice.
- **NONHQ is a request, not a booking, by design.** The form emails
  `hello@non.world` through Shopify's native contact form, with the customer's
  address as reply-to. No availability, no calendar, no app, nothing external
  to keep alive. If it ever needs real-time availability that becomes an app —
  but that is not what it is for.
- **No customer account templates.** Shopify's defaults render unstyled.

## Corrected against the live store

Things the design got wrong, now sourced from Shopify instead:

- **Pack pricing.** The design had a 6-pack at $135 ($22.50/bottle) and a
  12-case at $258. The store sells 6 at $150 and 12 at $300 — $25 a bottle
  either way. All price figures are stripped from the somm's canned copy;
  prices render from Liquid only.
- **The Mixed 6.** The design showed $180 on the homepage and $135 on the
  shop page. Both were wrong, and they were conflating two products: the
  Mixed 6 Pack is $150, the Mixed 6 **Stopper** Pack is $180.
- **The NONstopper** is $60 retail, not the $25 in the design.
- **The range is six bottles** — NON1, NON2, NON3, NON5, NON7, NON9 — plus
  eight sets and the accessories. The homepage now reads the real `the-range`
  and `non-sets` collections.
- **Metafields already existed.** The port originally invented `custom.tastes`,
  `custom.nutrition` and `custom.process_steps`. The store already holds
  `custom.profile`, `custom.nutritional_panel` and `custom.process`, so the
  theme reads those. Only `sits`, `food_tags` and `food_why` are genuinely new.
