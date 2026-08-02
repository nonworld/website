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
| Lotto Worker | `https://non-lotto.polished-snow-7889.workers.dev` — deployed. Codes are ACTIVE and the token is fine; the open gap is the Klaviyo flow |
| Design source | `design-reference/*.html` in the repo. **This is the source of truth for every page** |

## Workflow — do not deviate

```bash
./scripts/sync.sh "commit message"
```

Pull → `check.py` → commit → push. **Never push without it.** `scripts/check.py` encodes
ten Shopify-rejection rules, every one added because it actually happened.
Shopify rejects invalid theme files **silently** and keeps serving the previous
version — the only symptom is a change that "didn't apply".

Sync takes ~60–75s. After that, verify the deployed file's checksum against
local before concluding anything about whether a change landed.

### How to actually verify a deploy

`sync.sh` reporting "pushed" means git accepted it. It does **not** mean Shopify
took the file. Check the deployed byte size against local through the Shopify
MCP, which works from a sandbox where `curl` does not:

```graphql
theme(id: "gid://shopify/OnlineStoreTheme/198370820256") {
  files(filenames: ["sections/whatever.liquid"], first: 5) {
    edges { node { filename size updatedAt } }
  }
}
```

Sizes are byte-exact. A mismatch, or a stale `updatedAt`, means Shopify rejected
the file and is still serving the previous version.

**This caught a real one on 2026-08-01:** `sections/product-process.liquid` had
been frozen on the staging theme since 31 July while two later commits touching
it pushed cleanly. Cause: a comment TAG nested inside a `{% liquid %}` block.
Inside a liquid block the enclosing tag ends at the first closing delimiter it
meets, so the nested tag cut the block short and the rest became stray markup.
`check.py` rule 1b now catches that class — and note the rule matches from the
OPENING tag, because once the bug is present a non-greedy match for the closing
delimiter stops at the nested tag and reports nothing wrong. That is why nine
earlier rules and every prior sync missed it.

**JSON templates are the exception — do NOT byte-compare them.** Shopify
re-serialises `templates/*.json` on write: it re-orders keys, re-indents, and
re-adds its own auto-generated comment header. `templates/index.json` is 10462
bytes locally and 7389 on the theme, with identical content. Byte-size is a
valid deploy check for `.liquid`, `.css` and `.js` only. For a JSON template,
fetch the body and read it:

```graphql
files(filenames: ["templates/index.json"], first: 1) {
  edges { node { body { ... on OnlineStoreThemeFileBodyText { content } } } }
}
```

**And the limit of byte-checking:** it proves the file arrived, not that the page
looks right. The About process rail deployed perfectly every time while rendering
as an unrecognisable two-column mess, because it used `class="non-process"` and
so does the PDP process band — whose CSS sets `grid-template-columns: repeat(2,
1fr)`. Renamed to `.non-prail`. **Before adding a new component class, grep
`assets/theme.css` for the name.** Nothing automated will catch a collision.

### The silent rejection that cost an evening (2026-08-01)

`sections/pairing-recipes.liquid` sat frozen on its 31 July version while four
later pushes reported success. One line:

```liquid
{%- if key != blank and seen contains marker == false -%}
```

**Liquid cannot chain a comparison onto `contains`.** `a contains b == false` is
a parse error, not a negation. Shopify rejects the whole file for it and keeps
serving the previous version. Use nested `{% if %}` / `{% unless %}`.

It hid because **Shopify only validates on WRITE**. The line was accepted at
some earlier point, sat harmlessly in an already-live file, and only bit when
that file was next pushed — so the bug appeared to arrive with an unrelated
change. `snippets/non-code.liquid:22` had warned about this exact construct in
prose since the first time it happened; a comment in one file does not stop it
recurring in another. It is now **check.py rule 1d**, which blanks comment
blocks before scanning so the warnings do not report themselves.

**How to find the next one:** bisect with probe sections. Push
`sections/probe-a.liquid` (suspect schema, trivial body) and
`sections/probe-b.liquid` (suspect body, minimal schema) in one commit, see
which Shopify accepts, then halve the failing side. Six probes over three
pushes located this to a single line. Guessing did not.

### Rendering from a container

**`non.world` is blocked.** The egress gateway answers 403 to
`CONNECT non.world:443` — an org policy denial, which `/root/.ccr/README.md`
says to report, not retry. Staging previews are equally unreachable. So the
live site cannot be screenshotted from here.

What works instead, and is genuinely decisive for layout, sizing and contrast:
render the **real `assets/theme.css`** against markup mirroring the section, in
Chromium via Playwright (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`),
and **measure computed geometry** rather than eyeballing. This caught two fixes
that were wrong: a `.non-shell` cap that letterboxed the site, and a thumb
override placed above the rule it was meant to beat, which rendered identically
to the bug. Label it a harness — it cannot see Liquid output or live data.

### The pattern behind half of tonight's bugs

**A default that nobody chose, quietly doing the wrong thing.** Not a missing
setting — an actively wrong one:

- `card_max` defaults to **640** in the schema; the collection template never
  set it, so every shop card capped at 640px.
- `--non-invert-fg` is **#000000** ("invert" = the dark-on-light pairing), so
  `color: var(--non-invert-fg, #fff)` painted black type on a dark photograph.
  The `#fff` fallback never fires — a var() fallback only applies when the
  variable is UNDEFINED.
- `.non-filter` hardcodes `color: #e8e8e6` for the near-black page, so on any
  light band its unselected chips were invisible.

The editability audit (`docs/editability-audit.md`) checked for settings that
render nothing. It did not check for defaults that render badly. That is a real
gap in it.

**Second recurring shape: scope.** Somm CSS corrections are scoped
`.non-somm …` because the panel is a light island. Anything living outside the
form — the pairing seeds, the hero answer stream — matches none of them and
falls back to dark-page defaults. Two separate "it doesn't work" reports came
from this, plus a third where `somm.js` resolved a missing target to `null` and
threw mid-handler. **A thrown click is indistinguishable from a dead button.**
Every optional target in `somm.js` is now guarded.

---

## BLOCKED — needs Aaron, nothing proceeds without these

1. ~~**Shopify Admin token returns 401.**~~ **CLOSED — Aaron confirmed the token
   is fine, 2026-08-01.** Do not re-raise this. It was written here as an open
   blocker and every subsequent session inherited the claim, could not verify it
   from a sandbox, and asked about it again. That loop is the reason this entry
   now says closed rather than being deleted.

   Corroborating evidence, so nobody re-opens it on a hunch: Admin API calls
   authenticate fine — themes, files, products, discounts, redirects and menus
   were all read successfully on 2026-08-01. All six NON Lotto discount codes
   (LOTTO10, LOTTO15, FREESTOPPER, FREEPOUR, ONEONUS, THEHOUSE) are **ACTIVE**.

   If the Lotto still fails to issue a code, look elsewhere before blaming the
   token — and note `/health` is not a usable signal either way, because
   `worker/lotto/src/index.js:256` only checks the variable is non-empty.

2. **Publish the theme, then publish `visit-us`.** `templates/page.visit-us.json`
   renders through *this* theme. The live theme is Ven and has none of these
   sections, so publishing the page first would expose a broken render.

3. **The Everyday Set.** `the-everyday-set` is published with **0 stock**;
   `the-everyday-set-1` has **804 units** and is **unpublished**. Same SKU. The
   set customers can see is out of stock. Needs a publish + archive + handle
   decision (moving the handle changes a live URL).

4. ~~**Favicon** — asset never supplied.~~ **CLOSED 2026-08-01.** The NON Somm
   identity kit supplied the square mark the brand never had — the full stop
   from "NON." at baseline left. Shipped as a theme asset
   (`assets/non-somm-favicon.svg`) and wired in `layout/theme.liquid` as the
   fallback when Theme settings → Favicon is empty, so it needed no Files
   upload and no Admin action. Setting a square PNG in Theme settings still
   wins and additionally emits apple-touch-icon, which SVG cannot serve.

5. **Redirect inventory** — **reconciled 2026-08-01, see
   `docs/redirect-reconciliation.md`.** The rebuild created NO redirect debt:
   every rebuilt page kept its handle, so no URL changed. What remains is
   pre-existing — two redirects that land on ARCHIVED products and 404 the
   customer, and four two-hop chains. Report only; nothing created or deleted,
   all of it needs sign-off.

---

## Outstanding after 2026-08-01 — nothing started, no half-built work

1. **Stockists** — the largest remaining design gap, and a rebuild rather than a
   tweak. `design-reference/stockists.html` has: a display headline ("Find it
   poured near you.") over an eyebrow, a two-column panel with the map BESIDE
   the list rather than under it, result rows carrying venue type / bottles
   poured / distance, a "See all 1,400+ venues" card closing the list column,
   and a venue-suggestion form under the map. The build has none of that shape.
   Raised twice by Aaron; deliberately not started rather than half-done.
2. **Mobile** — untouched all evening, and Aaron has seen it ("pretty bad").
   Everything below 860px is unverified, and several 2026-08-01 changes have
   breakpoint behaviour only checked at desktop: the 5-across grids, the 380px
   card caps, the now-full-bleed shell, the recipe band's two-column panel, the
   PDP's 44px/28px step rail. Render every page at 390 and 768 in the harness
   and produce a list BEFORE changing anything.
3. **Cart "YOU WON" banner** — Aaron reports the animation not firing, and his
   screenshot also shows the description and code slots blank. Traced from
   source as far as it goes: `prize-pop.js` IS loaded, `is-popping` IS applied
   in `maybePop()`, which bails on three conditions — `box.hidden`, empty code,
   or `alreadyPopped(code)`, which marks a code in storage so **it only ever
   animates once per code**. That alone would explain "not triggering". But
   `cart.js` cannot un-hide that box without a code present, so a visible box
   with empty slots does not reconcile from source. Needs the live page; do not
   guess at it.
4. **Shop bottom cards** — done, but the two images are my pick from what was
   already on the CDN, not a brief. Swap in the editor if wrong.

## Queue, in order

1. `docs/site-speed-audit.md` — LCP/INP still unmeasured (see pane limits below)
2. `docs/full-qa-sweep.md` — **explicitly last**, Aaron's instruction
3. Cart CRO fixes, if signed off — full findings in `docs/cart-cro-audit.md`
4. Two weak page titles: `/collections/the-range` → "Singles – NON",
   `/pages/pairing` → "Pairing – NON". Shopify SEO fields on the resources,
   not the theme
5. Brand `llms.txt` — Shopify's agentic-commerce file occupies `/llms.txt`

### Cart CRO — reported, awaiting sign-off
Full audit with exact file:line references: **`docs/cart-cro-audit.md`**.

- Lotto "Apply to this order" is **5.6× the area of Checkout** in the drawer
- Free-shipping line hardcodes **75** across **5 markets**. Real: AU $75 ✓,
  US $75 ✓, **UK £50 ✗**, CA/NZ appear to have no free rate at all
- Cart add-ons are built but no products selected in Theme settings → Cart

**NON Lotto — the remaining gap is Klaviyo, not the token.** The Worker posts an
event named `Scratched NON Lotto` (`worker/lotto/wrangler.toml`, list `WQLa3T`).
No such metric exists in Klaviyo and no flow receives it, so a revealed code
currently emails nobody. A metric only comes into existence when its first event
arrives, and a metric-triggered flow needs an existing metric to bind to — so
this is built after one real event has fired, not before.

**Free shipping is FIXED** — both locations, one commit, deployed to staging.
`snippets/free-shipping.liquid` is now the single source of truth, keyed on
`localization.country.iso_code`: AU $75, US $75, GB £50, and **nothing rendered**
for CA / NZ / International. The global `settings.free_shipping_threshold` is
gone, and the announcement bar's hardcoded `"free shipping over $75"` is now a
`free_shipping` block type that resolves per market. Add a market in the snippet
and nowhere else.

Still open in the cart: the Lotto button size, and the add-ons with no products
selected.

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

### If you are in a remote container, not on the Mac

Claude Code on the web runs in an ephemeral Linux container with a fresh clone,
not on `/Users/aarontrotman/…`. What that changes:

- **`./scripts/sync.sh` RUNS FINE.** An earlier version of this file said it
  could not, which was wrong and shaped a whole session's decisions. It is pure
  git plus `check.py` — no Shopify CLI, no wrangler, no credentials. Deployment
  happens through Shopify's two-way GitHub integration, so pushing the `staging`
  branch IS the deploy. It pushed all day on 2026-08-01 from a container.
- **Shopify and Klaviyo are reachable via MCP**, which does not go through the
  blocked HTTP path. That is how deploys get verified from a sandbox — see the
  verification note below. Direct `curl` to `admin.shopify.com`, `non.world`,
  `cdn.shopify.com` and `*.workers.dev` all still 403 at the proxy gateway.
- **Staging is unpublished, so it is unreachable** without a preview URL.
  Auditing `non.world` measures **Ven**, the old live theme — numbers about
  code we are replacing. Do not run the speed audit that way.
- **The hidden-pane traps above do not apply.** Chromium and Playwright are
  installed and driven directly, so `requestAnimationFrame`, `setTimeout` and
  `innerWidth` behave normally. Different environment, different failure modes.
- Useful there anyway: anything that reads from source — file:line audits,
  asset weights, grep-level checks, writing specs.

**Commit anything worth keeping before the context window closes.** The queue
docs were lost once already because they only ever existed on the Mac.

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
