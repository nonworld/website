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

Carried over from the design, or introduced by the port. None of these block
launch, but none of them are done.

- **Helvetica Neue is `local()` only.** The system font on macOS/iOS is
  licensed to the OS and can't be converted and served from the theme, so Mac
  and iOS visitors get the real face and everyone else falls through to
  Arial. To fix it properly, license a webfont (Helvetica Now, Neue Haas
  Grotesk) and add a `url()` source in `theme.css`.
- **Product prices in the design disagree with each other.** The Mixed 6 is
  $180 on the homepage, $135 on the shop page and "$150 as a case" in the
  somm's copy. Shopify is now the single source of price, but the somm's
  canned answers still contain the old figures as text — worth a pass.
- **The design shows nine bottles; the brief named four.** The theme handles
  whatever is in the collection, but NON4, NON6 and NON8 were already noted as
  missing pack shots, and NON7, NON9 and the Everyday Set need cut-outs on
  white rather than food photography.
- **Imagery still points at the live `non.world` CDN** in the old export. The
  theme uses Shopify-hosted product media instead, so images need to be on
  the products; section images (hero, triptych, venue logos) need uploading
  in the theme editor.
- **NONHQ bookings are a request, not a booking.** The form posts to
  Shopify's native contact form. Real availability needs an app — Liquid
  can't hold a calendar.
- **The pairing page's reverse flow is not built.** The design also went
  bottle → recipe, with three recipes per bottle across fast / Sunday /
  show-off. That's a lot of copy and it belongs in metaobjects, not a section
  schema. Food → bottle is built; recipes are not.
- **No customer account templates.** Shopify's defaults will render unstyled.
- **Untested against a real store.** Everything here is validated
  structurally — JSON, section schemas, tag balance, asset references — but
  Liquid only truly runs on Shopify. Push to `staging` and check the preview
  before merging anything to `main`.
