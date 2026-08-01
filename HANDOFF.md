# NON theme — session handoff

Paste this into a new chat to pick up where we left off.

## Where everything lives

| Thing | Location |
|---|---|
| Theme repo | `/Users/aarontrotman/Claude Code/non-theme`, branch **`staging`** |
| GitHub | `github.com/nonworld/website` |
| Staging theme | Shopify theme **`198370820256`** (`website/staging`, unpublished) |
| **Live theme** | **`197808783520`** — still the old **Ven** theme. Nothing built here is live yet |
| Somm Worker | `https://non-somm.polished-snow-7889.workers.dev` — working |
| Lotto Worker | `https://non-lotto.polished-snow-7889.workers.dev` — deployed, **blocked** (see below) |
| Design source | `design-reference/*.html` in the repo. **This is the source of truth for every page** |

## Workflow — do not deviate

```bash
./scripts/sync.sh "commit message"
```

Pull → `check.py` → commit → push. **Never push without it.** `scripts/check.py` encodes
nine Shopify-rejection rules, every one added because it actually happened.
Shopify rejects invalid theme files **silently** and keeps serving the previous
version — the only symptom is a change that "didn't apply".

Sync takes ~60–75s. After that, verify the deployed file's checksum against
local before concluding anything about whether a change landed.

---

## BLOCKED — needs Aaron, nothing proceeds without these

1. **Shopify Admin token returns 401.** The Lotto cannot issue codes. `/health`
   says `ok:true` because it only checks the secret *exists*. `wrangler tail`
   shows `shopify 401`. Needs an Admin API access token (`shpat_…`) from a
   custom app with `read_discounts`, set via
   `cd worker/lotto && npx wrangler secret put SHOPIFY_ADMIN_TOKEN`.

2. **Publish the theme, then publish `visit-us`.** `templates/page.visit-us.json`
   renders through *this* theme. The live theme is Ven and has none of these
   sections, so publishing the page first would expose a broken render.

3. **The Everyday Set.** `the-everyday-set` is published with **0 stock**;
   `the-everyday-set-1` has **804 units** and is **unpublished**. Same SKU. The
   set customers can see is out of stock. Needs a publish + archive + handle
   decision (moving the handle changes a live URL).

4. **Favicon** — asset never supplied.

5. **Redirect inventory** — the highest-risk SEO item on a rebuild, and
   uncloseable without the previous theme's URL list (old sitemap, Search
   Console export, or the existing redirect list).

---

## Queue, in order

1. `site-speed-audit.md` — LCP/INP still unmeasured (see pane limits below)
2. `full-qa-sweep.md` — **explicitly last**, Aaron's instruction
3. Cart CRO fixes, if signed off (see below)
4. Two weak page titles: `/collections/the-range` → "Singles – NON",
   `/pages/pairing` → "Pairing – NON". Shopify SEO fields on the resources,
   not the theme
5. Brand `llms.txt` — Shopify's agentic-commerce file occupies `/llms.txt`

### Cart CRO — reported, awaiting sign-off
- Lotto "Apply to this order" is **5.6× the area of Checkout** in the drawer
- Free-shipping line hardcodes **75** across **5 markets**. Real: AU $75 ✓,
  US $75 ✓, **UK £50 ✗**, CA/NZ appear to have no free rate at all
- Cart add-ons are built but no products selected in Theme settings → Cart

---

## Environment traps — these cost hours, read them

The verification browser pane is **`visibilityState: hidden`**. Consequences:

- **`requestAnimationFrame` never fires.** CSS animations freeze at frame 0.
  Anything measured inside an animating container reads ~2% short.
- **`setTimeout` is throttled to ~1s.** 100ms sleeps land 1000ms apart, so
  timing assertions are meaningless without accounting for it.
- **`innerWidth` can report 0**, which makes every `vw` unit compute to zero
  and `clamp()` fall to its floor.
- **Screenshots return blank surfaces.** Measure computed values instead.
- **`curl` from Bash cannot reach `*.workers.dev`** — it is proxied and returns
  1042/404 artefacts. Verify Workers from the browser pane instead.
- Before measuring inside an animated container:
  `el.getAnimations().forEach(a => a.finish())`

**Rule that emerged: measure the wire, not the markup.** Two wrong conclusions
this session came from inferring behaviour from a URL or a class name instead
of what was actually transferred or computed.

---

## Architecture decisions worth preserving

**One brain.** `worker/somm/src/scoring-engine.js` is authoritative for pairing.
`worker/somm/src/occasions.js` projects it through nine canonical dishes to
derive `custom.food_tags`, which drives the Shop filter. There is no second
scoring implementation. Retune an axis and the shelf moves with Somm.

- `heatFit` (`cools` / `neutral` / `clashes`) replaced the old `coolsHeat`
  boolean. `neutral` and `clashes` **cap** the score rather than deducting.
- NON9 must never pair with fish. The profile lost `white fish`/`raw fish`, and
  `test/pipeline.test.js` now asserts the correction — that test previously
  asserted the opposite and is why the bug survived the first fix.

**Two fonts only**: NONHelvetica and JetBrains Mono. No named fallbacks.

**Motion**: four tokens in `:root` (`--ease-standard`, `--ease-hover`,
`--duration-reveal`, `--duration-hover`). Nothing invents its own curve.
`reveal.js` hides content in JS, never CSS, and reveals everything
unconditionally after 2.5s — an observer that never fires must not leave a
blank page.

**Every section has appearance settings** (background, text colour, font, text
size, padding) via `snippets/section-style.liquid`.

---

## Known data gaps (not code)

- NON3 has no `custom.style` → eyebrow reads `NON3 · 0.0% ABV · 750ml` instead
  of `NON3 · still · …`
- NON3 has no `perfect_for_images` → "Made for" correctly renders nothing
- 9 products carry no `food_tags` at all (sets, 375ml, 3-pack box, waiter's friend)
- 3 orphaned `food_why` sentences (NON2×raw, NON3×braise, STOPPER×raw) explain
  pairings the engine no longer makes. Left in place — deleting brand copy is
  Aaron's call
- About is still short of the design's 19 images; the bands exist, the
  photography for them does not

## Corrections already issued — don't re-litigate

- `format: 'webp'` saved **nothing**. Shopify's CDN already negotiates format
  from the `Accept` header. Measured: 73,290 bytes with and without the param.
  The real image win was `srcset`.
- Press quotes were **never** at the wrong size (27px = design 27px).
- The "missing header" report was the theme editor scrolled past it.
