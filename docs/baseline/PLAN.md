# Plan — rebuild NON on the Baseline theme

Written 2026-08-08, off the port test on theme `198551339168`
("Test - new elements current theme", Baseline 4.0.49, unpublished).

---

## 0. Which theme is which — verified 2026-08-08

| Theme | ID | Role | Schema |
|---|---|---|---|
| `Ven Shopify Theme cache refresh 2026-07-08 fresh` | 197808783520 | **MAIN — live** | Baseline 4.0.49 |
| `Test - new elements current theme` | 198551339168 | unpublished | Baseline 4.0.49 |
| `website/staging` | 198370820256 | unpublished | **NON 1.0.0** |

Read off `Shopify.theme` from each theme's own preview, not from an admin list.

**This is not a re-platform. The live site is already Baseline.** The custom
theme in this repo — `website/staging`, schema `NON 1.0.0` — has never been
published, and none of the work on `concept/light-inverse` is live. The real
decision is therefore narrower and cheaper than "migrate": *stop finishing the
custom theme, and build the NON design onto the Baseline theme already in
production.*

`Test - new elements current theme` is a straight copy of live — identical
section set, identical colour schemes, only a later asset-version hash. It is
the correct workspace, and it is what the port test ran against.

Two consequences worth stating up front:

- **There is no publish cliff.** Phase 6 is not a migration; it is a promotion
  of an improved copy of the theme already serving the site.
- **The brand faults are live right now.** The violet accent `#623CEA` and the
  lime `#C6F91F` are not hypothetical risks of a future port — they are on
  non.world today, and the accent slot drives every link and button hover.

---

## 1. The verdict

Baseline is more structurally sound than the custom theme in three specific
ways, and worse in one that has to be resolved before anything else starts.

**Better**

1. **Colour is a five-token contract, not 300 hand-placed values.** Baseline
   resolves every surface through `[data-color-scheme="scheme1..5"]`, five
   tokens each, stored as space-separated RGB channels. The port test proved
   the Light appearance lands as *one stylesheet writing values Baseline
   already reads* — every stock section turned over, worst-case text contrast
   18.21:1, AA everywhere. The custom theme needed a 900-line semantic layer
   and a preflight check to get the same result.
2. **Rendering is islands, not a monolith.** `<data-island on="idle">`,
   `on="before:visible"`, `src="product"` — sections hydrate lazily and
   independently. The custom theme ships a React vendor bundle plus 25 loose
   scripts on every page.
3. **Someone else maintains the commodity 80%.** Cart drawer, quick-buy,
   carousels, FAQ, testimonials, localisation, age gate, sticky header — all
   already built, and all already reading the scheme tokens correctly.

**Worse — and this is the gate**

**The theme has a build step you do not appear to have the source for.**
`base.bundle.css` (99KB, minified, with a sourcemap), `global.bundle.js`,
`island-product.bundle.js`, `vendor.bundle.min.js` (Alpine 3.14.7 + Splide),
and Tailwind utilities compiled to a fixed bundle. `theme_store_id` is `null`,
so it did not come from the Theme Store and has no update channel there.

The consequence is concrete: **you cannot add a Tailwind class that is not
already in the compiled bundle.** Writing `class="gap-7"` in a new section does
nothing if `gap-7` was never compiled. Every custom section must therefore ship
its own scoped CSS rather than reach for utilities — which is fine, but it has
to be a rule from day one or the theme will be half-Tailwind, half-not, and
nobody will know which half they are in.

**Answer this before Phase 1: who has the Baseline source repo, and does the
Shopify theme have a GitHub connection?** If the answer is nobody, you are
forking a minified build and the "maintained by someone else" advantage in
point 3 disappears.

---

## 2. What actually has to move

34 sections and 23 snippets in `nonworld/website`. They sort into three piles,
and the piles are very unevenly sized — which is the good news.

### Pile A — delete, Baseline already does it (17)

`announcement-bar` · `header` · `footer` · `featured-collection` ·
`featured-set` · `logo-marquee` · `press-quotes` · `rich-text` ·
`split-feature` · `editorial-triptych` · `related-products` · `main-cart` ·
`main-collection` · `main-list-collections` · `main-page` · `main-search` ·
`product-card` (snippet)

Baseline's equivalents are already configured and live on the test theme:
`scrolling-text`, `featured-collection-carousel`, `featured-collection-table`,
`testimonials`, `feature-text`, `media-split`, `text_columns_with_images`,
`logo-list`, `faq`, `image_with_text`. This is not a port — it is content
re-entry into existing sections.

### Pile B — port, no equivalent exists (14)

These are NON, not commerce furniture. Each needs Liquid + scoped CSS + its
existing JS re-mounted as an island.

| Section | What carries over | Risk |
|---|---|---|
| `hero-somm` + `somm-orb`, `somm-sheet` | `somm.js`, `somm-orb.js`, `somm-sheet.js`, worker | High — the orb is canvas, the sheet is a focus-trapped overlay |
| `pairing-tool` | `pairing.js` | High — `--non-somm` grid, the rule preflight guards |
| `pairing-matrix`, `pairing-recipes` | `recipes.js`, `pairing-triptych.js` | Medium |
| `process-animation` + `process-anim-1..4`, `process-scene` | `process-sequence.js`, `dc-support.js` | High — four hand-drawn scene snippets |
| `product-process`, `product-pairings`, `product-picks`, `product-perfect-for` | `product.js`, `product-sticky.js` | Medium — PDP blocks |
| `non-lotto` | `lotto.js`, `prize-pop.js`, worker + D1 | Medium — prize codes, the inverted island |
| `nonhq-concierge` | `contact-field.js` | Low |
| `stockists` | `stockists.js`, `globe.js`, Leaflet | High — canvas + map, both had colour hardcoded |
| `about-process`, `about-story` | `reveal.js`, `steps-accordion.js` | Low |
| `contact-main` | `contact-field.js` | Low |
| `main-product` | the whole custom buy box | High — Baseline has its own `island-product.bundle.js` |
| `cart-drawer` (snippet) | `cart.js`, `scroll-lock.js` | Decide: keep Baseline's `ModalCart` instead |
| `non-code`, `non-nutrition`, `drinks-like`, `desc-cards` | metafield renderers | Low |
| `structured-data`, `meta-tags` | SEO | Low, but do not skip |

### Pile C — untouched by the theme choice (4 workers)

`worker/somm`, `worker/lotto`, `worker/watch`, plus D1 `non-somm-log` and the
hourly Sheet export. These are HTTP endpoints. Only the *mount point* changes,
not the service. **This is the single biggest reason the port is affordable** —
the hard, stateful half of the site does not move.

---

## 3. The two sections that already broke the rules

From the port test, exactly two things on the Baseline homepage ignore the
colour schemes. Both are already NON's own code, and both are the shape of
every mistake this port will otherwise repeat.

1. **`non_home_hero`** — three rules, five hex values:
   `background:#000`, `border-bottom:1px solid #000`,
   `.non-home-hero__panel { background:#fff; color:#000 }`. Painted itself, so
   it survived the scheme change unchanged while every stock section turned
   over.
2. **The Somm chatbot launcher** — hardcoded `#000` throughout, and it sits
   outside every section so no scheme reaches it at all.

**Rule for the whole port: a custom section may not name a colour.** It reads
`rgb(var(--color-scheme-text))` / `-background` / `-accent` /
`-accent-contrast` / `-secondary` and `rgb(var(--color-gridline))`, or it is
wrong. This is check 7 in `preflight.py` restated for a different theme, and
the existing script can be pointed at the new repo nearly as-is.

---

## 4. Phases

All work happens on `Test - new elements current theme` (198551339168).
The live theme is never edited directly. Each phase ends at a gate that can
fail; nothing is promoted to MAIN until Phase 6.

### Phase 0 — Establish the ground (blocking, ~half a day)

- **Locate the Baseline source repo and build config.** This is now urgent
  rather than academic: the bundles are what non.world serves today, so if
  nobody holds the source, the live site is a build no one can rebuild.
  Ask whoever supplied "Ven Shopify Theme" — the theme name is the lead.
- Connect the theme to a GitHub branch so changes are reviewable. The custom
  theme's worst time sinks were all silent deploy rejections; a repo does not
  fix that, but it makes the diff legible.
- Pull the theme locally (`shopify theme pull`; the CLI is **not installed on
  this machine** — that is a prerequisite, not a step).
- Re-authorise the Shopify connector. It is currently invalidated, which is
  why the theme identities in §0 had to be read off page previews rather than
  an admin query.
- **Gate:** local copy byte-matches the deployed theme, and 198551339168
  byte-matches 197808783520 apart from anything deliberately changed. Confirm
  the copy has not drifted from live before building three weeks on top of it.

### Phase 1 — Land the appearance (~half a day)

The work is already done and tested. Apply `non-light.css`'s five scheme
blocks to `config/settings_data.json` as real colour-scheme settings rather
than a stylesheet, so the theme editor shows the truth.

- scheme1 → white page, warm-black ink (`#171513`), accent = ink
- scheme2 → panel `#F4F4F3` (replaces the acid lime `#C6F91F`)
- scheme3/4 → the inverted island, kept dark on purpose
- scheme5 → white, ink warmed to match
- `--color-gridline` → `#E2E2E0`

Fix the hero's five hex values in the same pass.

- **Gate:** re-run the DOM audit from the port test. Zero painted elements
  outside the token set, worst-case contrast ≥ 4.5:1 on every section.
- **Also fixes two brand faults that exist today, independent of the port:**
  the violet accent `#623CEA` and the lime `#C6F91F` both violate the
  monochrome rule, and the accent drives every link and button hover.

### Phase 2 — Content re-entry into Pile A (~2 days)

No code. Rebuild the home, collection, about and generic pages out of
Baseline's existing sections. Do this *before* porting anything, because it
tells you which of Pile B you actually still need — some may turn out to be
expressible in a stock section plus settings.

- **Gate:** every page in Pile A renders with real copy and real photography,
  reviewed against `design-reference/*.html`.

### Phase 3 — Port the low-risk half of Pile B (~3 days)

`about-process`, `about-story`, `contact-main`, `nonhq-concierge`,
`non-code`, `non-nutrition`, `drinks-like`, `desc-cards`, `structured-data`,
`meta-tags`.

Establishes the pattern the rest follow: Liquid + `{% stylesheet %}` scoped to
the section, tokens only, JS mounted as a `<data-island on="before:visible">`.

- **Gate:** the pattern is written down, and one section is reviewed against it
  before the other nine are built.

### Phase 4 — Port the Somm and the PDP (~1 week, the real work)

`hero-somm`, `somm-orb`, `somm-sheet`, `pairing-tool`, `pairing-matrix`,
`pairing-recipes`, `main-product` and the four product blocks.

Two decisions land here:

- **Buy box:** extend Baseline's `island-product.bundle.js` or replace it. If
  the source repo does not exist, you cannot extend it — you replace it, and
  you inherit maintenance of quick-buy and variant handling.
- **Cart:** keep Baseline's `ModalCart` and retire `cart-drawer` + `cart.js`.
  Recommended. The custom drawer's focus-trap and zoom-wrap fixes were three
  separate commits; Baseline's is already solved.

- **Gate:** the somm megatest fixtures (`tests/eval`, 450 questions) run green
  against the new mount. The worker is unchanged, so this tests the front end
  only — which is the point.

### Phase 5 — Port the heavy visual set (~1 week)

`process-animation` + the four scene snippets, `stockists` + `globe.js` +
Leaflet, `non-lotto` + prize codes.

All three had colour hardcoded in the custom theme and needed dedicated
commits to stop doing it. Port the *fixed* versions from `concept/light-inverse`
(`5111fc2`, `0b838a3`), not from `main`.

- **Gate:** canvas and map read the scheme in both appearances. Verify by DOM
  measurement — the Browser pane pauses `requestAnimationFrame`, so canvas
  screenshots read as static and prove nothing.

### Phase 6 — Parity, then promote (~3 days)

Smaller than it would be on a re-platform: the theme being promoted is a
descendant of the one already live, so markets, apps, redirects and metafield
definitions carry over untouched. What still has to be checked:

- Translations: 4 published locales + ko/zh-CN/es/th unpublished. Theme-level
  strings are per-theme, so any new section's strings need registering. Keep
  writes ≤13 per batch; a 26-string `translationsRegister` timed out and wrote
  nothing — and a timeout tells you nothing about whether the write landed.
- Structured data and `robots.txt` on the new sections only.
- Markets: US is `enabled: false` today. Unchanged by this work, still a
  decision.
- Speed: measure against 197808783520, the live theme — that is the honest
  baseline, not staging.
- **Gate:** side-by-side against live on every template, then publish. Keep
  197808783520 unpublished-but-intact as the rollback.

**Total: roughly 4 weeks of focused work.** Phase 4 and 5 are two thirds of it.

---

## 5. What this costs you

Stated plainly, because the phases above make it sound cheaper than it is.

- **The 900-line semantic token layer is thrown away.** It gets replaced by 25
  lines of scheme settings — which is the argument *for* Baseline, but it does
  mean the last month of `concept/light-inverse` work survives as design
  decisions and hex values, not as code.
- **`preflight.py` and its seven silent-rejection modes were learned the
  expensive way.** They mostly still apply (they are Shopify traps, not theme
  traps), but the file needs re-pointing and checks 6b/7 rewritten.
- **You inherit an app stack.** The test theme carries a gift-upsell app with
  14 asset injections, Klaviyo, an age gate and a privacy banner — the Klaviyo
  modal alone locks body scroll and had to be defeated to run the port test.
- **No upstream.** `theme_store_id: null` means no Theme Store updates
  regardless of what you decide in Phase 0.

What it does **not** cost you, because the live site is already Baseline: a
re-platform, a data migration, an app re-install, or a risky publish. Those
were the expensive parts, and they are already behind you.

---

## 6. Decisions needed before Phase 1

1. **Baseline source repo — exists or not?** Everything else depends on it.
2. **Buy box: extend or replace Baseline's product island?**
3. **Cart: Baseline's `ModalCart`, or port the custom drawer?** (Recommend
   Baseline's.)
4. **Is the custom theme retired, or does it stay as the design reference?**
   `design-reference/*.html` should survive either way — it is the source of
   truth for what the pages are meant to look like, and nothing in this plan
   replaces it.
