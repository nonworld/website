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

### image_tag's height attribute beats aspect-ratio (2026-08-02)

The PDP "Made for" tiles rendered 392×1500 and 392×2133 while
`getComputedStyle` reported `aspect-ratio: 1 / 1`. The property was applied
and **inert**.

`image_tag` writes BOTH `width` and `height` as HTML attributes. Those map to
presentational hints — real CSS declarations author rules must override one by
one. `.non-trip__img` set `width: 100%`, which beat the width hint. Nothing
beat the height hint, so height stayed DEFINITE at the photograph's intrinsic
pixel height, and **`aspect-ratio` only sizes a box whose height is `auto`**.

The fix is `height: auto`. Note the CSS comment above that rule had blamed the
class for three sessions — the class was always there and always lost.

**Rule: any `aspect-ratio` on an `<img>` needs `height: auto` beside it.**
Audited: `.non-trip__img` was broken; `.non-verdict__img` and
`.non-hq-room__img` carried the same latent bug and were fixed with it.
`.non-card__media` and `.non-recipe__media` are safe because the ratio sits on
a wrapper and the img inside is `height: 100%`.

### A row that sized itself by item count (2026-08-02)

Three product rows on one page measured 380 / 200 / 224 at 1280 while all
three had `card_max: 380`. `.non-row` used
`grid-auto-columns: minmax(200px, 380px)`: 3 items fit, so free space was
distributed and every track grew to its max; 7 items overflowed, so there was
no free space and every track fell to its min. **Card size was decided by how
many products were in the row, and the setting all three shared was reached by
exactly one of them.** Tuning the number could never have matched them.

It now computes the track from a column count the way `.non-grid` does
(`--non-row-cols-lg` from each section's Columns setting, 2.2 below 860px so a
card and a peek fill a phone). Every product card on the shop page is now
224×224 — verified grid, Sets and Not drinks together.

### Four traps found on 2026-08-02, all of the same family

Each one rendered markup that was PRESENT and INERT — the thing looked right in
the source and did nothing in the page. Grep for the symptom before re-deriving.

**1. A nested `<form>` is deleted by the parser.** The back-in-stock block was a
`<form>` inside the product's add-to-cart `<form>`. HTML forbids that, so the
parser drops the inner start tag and keeps its children: `outerHTML` contained
`non-bis`, and `querySelector('[data-non-bis]')` returned null. The script bound
to nothing. It is a `<div>` with a plain button now, and Enter on the field is
caught by hand — otherwise Enter submits the CART form and adds a sold-out
product instead of subscribing.

**2. A schema default does not reach a section already placed in a JSON
template.** `klaviyo_public_key` had `"default": "U6PhdU"` and rendered blank,
so the form's own `!= blank` guard hid it. Stored template settings win; the
default only applies when the section is newly added. Fix: write the value into
`templates/*.json` explicitly. Same family as "a default nobody chose" — here it
is a default nobody stored.

**3. `max-width: 100%` cannot be inherited away.** The global
`img, iframe, svg, video { max-width: 100% }` reset capped the YouTube iframe at
its box, so YouTube letterboxed the 16:9 film inside its own viewport. Cover CSS
looked broken; it had never been allowed to run. To crop an iframe it must be
permitted to overflow — `max-width: none`.

**4. A stretched grid spends spare height on its ROWS.** `.non-product`
stretches the gallery column to the buy column's height; `.non-gallery` had auto
rows and default alignment, so the image row grew 480 to 624 and Ingredients
landed 182px below the photograph with nothing between them. `align-content:
start` collects the slack at the foot of the column instead. This was NOT a
margin, and tuning the margin would never have found it.

### The process film: three constraints, only two can hold

Steps on the side, nothing cropped, and a film that is not enormous. Side by
side, the media column must match the copy's height — an uncropped 16:9 at 586px
tall needs to be 1042px wide, leaving 238px for five steps. Widening the column
kept improving the crop (42 → 52 → 60 → 69% of frame kept) and could never reach
it. Settled: the box takes 16/9 from its own WIDTH and centres in the column, so
it is uncropped at 730x410 with page showing above and below. That gap is the
design, not a bug — do not "fix" it by stretching the box again.

YouTube specifics: `loop=1` does nothing alone, the API only loops a PLAYLIST,
so a single video must name itself via `playlist=<id>`. `controls=0` removes the
bar; the title card and share buttons are drawn on hover regardless of any
parameter, which is why the iframe carries `pointer-events: none`. End screens
cannot be disabled by parameter at all — they are set per video in YouTube
Studio. `modestbranding` is ignored by YouTube now; `rel=0` has only limited
suggestions to the same channel since 2018.

**Self-hosting removes all of it with no code change.** The section already
branches to a native `<video>` when the URL is not a YouTube link — upload the
mp4s to Shopify Files and paste the URLs over the YouTube ones in
`custom.process_video_url`. Aaron was shown this and had not actioned it.

### The globe was cropped, not small

`globe.js` scaled the stage from a `data-size` attribute with no reference to its
container: a 420-unit stage in a 331px column on a phone, with `overflow:
hidden` slicing 89px off it. It now takes `min(size, root.clientWidth)` and
re-runs on resize.

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

## OPEN BUG — `sections/contact-form.liquid` is being silently rejected

Staging serves the **22:51 version (8456 bytes)**; local is 9551. Every other
file in the same commits deployed. `check.py` passes, the schema is valid JSON,
tags balance.

What changed in the rejected version:
1. A `.non-contact-hero` header block (mono eyebrow + display h1 + lead), added
   because Contact was opening with `.non-section__title` — the 11px label used
   INSIDE a section — while every other page has a display hero.
2. Two new settings, `eyebrow` (text) and `lead` (textarea).
3. `aside_heading`'s default emptied to remove the stray "ALSO" on the page.

Already tried and NOT the cause: `"default": ""` on the `aside_heading` text
setting. Removing the key entirely still gets rejected.

**Do not guess at this.** Bisect it the way the `contains` bug was found — push
`sections/probe-a.liquid` (this schema + trivial body) and
`sections/probe-b.liquid` (this body + a three-setting schema) in one commit and
see which Shopify accepts, then halve the failing side. That method located a
single bad line in three pushes.

Note the stray "ALSO" is gone regardless — `templates/page.contact.json` had
`aside_heading: "Also"` and that IS cleared and deployed. The rejection only
blocks the new header.

## NEXT: NON Somm premium redesign — design analysed, NOT built

Aaron supplied `Somm boxes premium redesign.zip` (Desktop) twice and it is the
top item. The design is fully decoded below so the next session can build
without re-deriving it. `NON Somm.dc.html` in that zip is the readable source.

**The idea: the box goes away.** It is not a restyle of the grey panel. The
Somm becomes an open, centred, near-black surface — no border, no fill, no
rounded slab. That is the answer to "grey box, not premium".

Palette (all dark, so the light-island rules MUST be unwound with it):
`#000`/`#1e1e1c` ground, `#232321` hairline under the input, `#3a3a37`
borders, `#EDEDE8` ink, `#8d8d87`/`#a9a9a2` muted, `#5f5f5b`/`#4a4a46`/`#3d3d3a`
progressively quieter, and three faint tints (`#dfe6f2`, `#e6f2df`, `#f2e0df`)
used for state, not decoration.

Six keyframes — this is the "dynamic nature" Aaron says the build lost:

- `breathe`  idle orb: scale 1 → 1.06, opacity .85 → 1
- `listen`   active orb: scale 1.1 → 1.24, opacity 1 → .9
- `ring`     three concentric rings, scale .72 → 1.45, opacity .5 → 0,
             2.4s `cubic-bezier(.2,.7,.2,1)`, staggered 0s / .8s / 1.6s
- `shimmer`  gradient sweep across TEXT via `background-clip: text`
             (`linear-gradient(100deg,#3d3d3a 25%,#EDEDE8 50%,#3d3d3a 75%)`,
             `background-size: 200% 100%`, animate `background-position` to -200%)
- `sweep`    a 36%-wide segment travelling a 180x1px rule, 1.4s
- `lineIn`   answers resolve in: opacity 0→1, translateY 8px→0, blur 6px→0

Structure: a 220x220 button holding a 200px blurred orb plus three rings; a
26px shimmering prompt; a borderless centred input with only a
`border-bottom: 1px solid #232321`; the sweep rule as the thinking state.

**Brand conflict to settle before building:** the design uses `border-radius:
999px` on the CTA. NON has no soft corners — the somm seed chips were
explicitly de-pilled and carry a comment saying so. Circles are fine (the orb
and rings are circles by nature). Recommend keeping the CTA square and taking
the motion wholesale; confirm with Aaron.

**Learn from the failed attempt (reverted, 35983c1).** Flipping
`--non-somm-bg`/`--non-somm-fg` and the radii is NOT enough. There are 8
references to `--non-somm-fg` in theme.css (lines ~32, 2635, 2636, 2645, 2658,
2663, 2698, 2760) plus white-filled seed chips. Changing three of them produced
contrast ratios of 1.01, 1.05 and 1.63 — invisible. **Unwind all eight, then
verify by computed contrast in the browser, not by eye.** Anything under 4.5:1
is a fail.

## Three traps from the 2026-08-02 evening session

**1. The storefront needs the `/en-au/` locale prefix.** Two products appeared
to 404 for hours and four theories were chased and disproven — channel
publication, market catalog, URL redirects, stale publication records — before
the real answer surfaced. Shopify reports the canonical URL as:

```
https://www.non.world/en-au/products/non-gift-card
```

`/products/non-gift-card.js` returns **404**; `/en-au/products/non-gift-card.js`
returns **200**. Nothing was ever wrong with those products. Aaron said
"Shopify changed prefix" early on and it was misread as being about the Lotto's
store domain.

**Outstanding work:** internal links and section pickers that use a bare
`/products/...` path need the prefix. The Not drinks row on the shop page is the
known case. **Before diagnosing any "missing product", test the prefixed URL
first.**

**2. Never give a pseudo-element `flex: 0 0 100%`.** The Somm orb was
`width: clamp(72px,7vw,96px)` with `aspect-ratio: 1/1`, and it rendered ~1100px
wide, swallowing the homepage hero. flex-basis overrides width, and the aspect
ratio then matched the height to it. Set an explicit width AND height with
`flex: none` on anything decorative in a flex container.

**3. The Somm stylesheet has an accumulated specificity problem.** Rules scoped
`.non-somm .non-somm__input` (0,2,0) beat later single-class rules (0,1,0), so
three separate fixes shipped looking correct and did nothing: the seed chips
stayed white-filled, the hero input kept dark ink on a dark panel (1.0
contrast), and the field surface stayed transparent.

There is now a block at the END of theme.css commented **"NON SOMM — FINAL,
CONSOLIDATED"**. It is authoritative and everything above it touching the Somm
is superseded. **Work there, not above it**, and match the existing selector
specificity rather than reaching for `!important`.

**The lesson underneath all three:** every one shipped looking right and was
wrong. Verify by computed value in the browser — contrast ratios, box
geometry, matched CSS rules — not by reading the diff.

### Known loose end
The Somm's field-to-chips gap measures 44px against the 20px set in the
consolidated block; something upstream still adds margin. Cosmetic, unchased.

## NON Lotto returns "closed" — narrowed to the Worker's own token (2026-08-02)

Aaron scratched, entered an email, and got "NON Lotto is closed right now."
Five code paths return `closed`. Four are now eliminated by measurement:

- `/health` returns `{"ok":true,"prizes":6,"missing":[]}` — the pool loads and
  all four config vars are present, so it is not the pool and not missing env.
- **All six pool codes read ACTIVE** through the Admin API using the EXACT query
  `codeIsLive` runs (`codeDiscountNodeByCode`). So it is not the codes.

That leaves the Worker's Shopify call itself failing. The most likely cause is
its `SHOPIFY_ADMIN_TOKEN` lacking the **`read_discounts`** scope.

**Important distinction this file previously blurred.** Blocker 1 says "the
token is fine, do not re-raise" — but the evidence for that was Admin API calls
succeeding through a DIFFERENT credential (the MCP/Admin connection), not the
Worker's `SHOPIFY_ADMIN_TOKEN` secret. Those are two separate tokens. The
earlier note is still right that the *store's* Admin access works; it never
tested the Worker's secret, and nothing else can now explain the closed state.

**A real defect was found and fixed while narrowing this** (`0a69dab`, committed
NOT deployed): `codeIsLive` checked `res.ok` and then read the data, but never
checked `data.errors`. Shopify answers a missing scope with **HTTP 200** plus an
errors array and `data: null` — which passed the ok check, produced an undefined
node, and returned `false`. A permissions failure was therefore indistinguishable
from "this code is inactive": all six got skipped and the customer saw "closed".
It now throws, so the reason appears in `wrangler tail`.

**The Worker does NOT deploy with the theme.** The theme ships through Shopify's
GitHub integration; the Worker needs `wrangler deploy` from `worker/lotto`. The
fix above is in git and is not live until someone runs that.

### How to test it

```
cd worker/lotto && npx wrangler tail
```

Then scratch a card. The branch that fires names itself:

- `[lotto] shopify graphql: <message>` — the new line. Scope or query problem.
- `[lotto] shopify check failed: shopify 401/403` — token rejected outright.
- `[lotto] skipping inactive code: X` then `closed-no-live-code` — genuinely
  inactive codes.
- `[lotto] refusing to draw, missing config: ...` — an env var is absent.

Check the scope directly with:

```
npx wrangler secret list
```

and confirm the token behind `SHOPIFY_ADMIN_TOKEN` has `read_discounts` in the
Shopify admin app's API scopes.

## BLOCKED — two products 404 on the storefront (found 2026-08-02)

`NON Waiter's Friend` (`non-waiters-friend`) and `NON Gift Card`
(`non-gift-card`) are both picked in the Not drinks row and **neither
renders**. They are not missing from the template — they are missing from the
storefront:

```
/products/non-waiters-friend  → 404
/products/non-gift-card       → 404
```

Both read ACTIVE in the Admin API with stock (20 on the Waiter's Friend) and
`resourcePublications` reporting `isPublished: true` for Online Store. So the
Admin says published and the storefront says gone — which means they are
excluded from the **market's catalog**, not unpublished. `block.settings.product`
correctly resolves to nil for a product the storefront cannot see, and the
section correctly renders nothing.

Needs Aaron: add both to the AU market catalog (Settings → Markets → Catalog,
or the product's market availability). Nothing in this repo can fix it, and
the picks are already in place, so they will appear the moment the store does.

**Do not "fix" this in Liquid.** A theme-side fallback would be inventing a
product the storefront is refusing to serve.

## Known DATA gaps found by measuring, not reading (2026-08-02)

- **NON2's nutrition label was misspelt `Calroes per serve`.** `non-nutrition`
  matches the label exactly, so it returned blank, so `nutrition` was blank, so
  the whole NUTRITION cell dropped off the NON2 PDP only. **Fixed in Shopify**
  (`custom.nutritional_panel`, 2026-08-02) — NON2 now reads
  "27 calories, 5.1 g sugar". The spec strip is built from an alternating
  label/value rich-text run with no keys, so a typo anywhere in it silently
  deletes a cell rather than erroring.
- **`custom.not_a_drink` is now SET** on the Cap, Beanie, Stopper, Waiter's
  Friend and Gift Card (2026-08-02), which is what finally switched off the
  bottle claims on those PDPs: no ABV/volume eyebrow, no somm, no invented
  serve. Two of those fixes were catalogue-wide, not accessory-only — TASTES
  used to fall back to `product.title` (so the Cap's flavour note was "NON
  Cap"), and SERVE hardcoded "Chilled, wine glass" for a field that is null on
  every product. Bottles keep the serve default; accessories get nothing.
- **`custom.process_video_url` is set on NON1, 3, 5, 7 and 9** with YouTube
  links, per bottle. NON2 has none yet.
- **`custom.tastes` and `custom.profile` are null on every product**, so the
  TASTES cell renders its label over nothing. Same class of failure, still open.
- `custom.serve` is null on every product and the Liquid supplies a hardcoded
  `'Chilled, wine glass'`. That is invented copy on a live page.
- `custom.not_a_drink` is null on **every** product, so the accessory
  suppression written for it is currently inert.

## NEXT UP — Sets and the Stopper PDPs (raised 2026-08-02, not started)

Aaron: "Sets PDP need a lot of copy and work to make them feel consistent with
singles. Check the stopper too."

The singles PDPs are rich because they carry metafields the sets and the
accessories do not. Verified against the live store on 2026-08-02:

- `custom.process` exists on NON1/2/3/5/7 (and drives the numbered "How it's
  made" rail). **The Spice Set, The Spring Set, The Everyday Set, Mixed 6 Pack,
  The Stopper Set, The NON Stopper and NON Waiter's Friend have none**, so the
  whole process band is absent on those pages.
- Same story for the eyebrow/spec strip (`custom.style`, serve, storage,
  nutrition) and `custom.food_tags`.
- `The NON Stopper` is productType "Bottle Stoppers & Savers" and
  `NON Waiter's Friend` has NO productType at all — worth setting.

So this is mostly a MERCHANDISING DATA job, not a theme job: the sections
already render whatever is present and correctly render nothing when it is
absent. Before writing any Liquid, check which metafields a set actually has —
the temptation is to build a fallback that invents copy, and this project has
already been bitten by a fake `custom.serve` fallback once.

A set also needs a different shape to a single: what is IN it, why those three,
and what it costs per bottle versus buying them separately. That is new copy,
and it is Aaron's to write or approve.

## NEXT UP — "How it's made" animation, native rebuild (approved 2026-08-02)

Aaron supplied `Process animation sequence.zip` (on his Desktop) and asked if it
could go on the Shop page. Agreed instead: **rebuild it natively as a theme
section, and put it on About, not Shop.** Aaron approved this.

Why not the zip as-is: it is a bundled React artifact — 139KB HTML plus a 69KB
support script — that pulls **React 18 from unpkg** at runtime and base64-decodes
its assets on load. Shop is the highest-intent page and the one where LCP matters
most; a heavy decorative animation above the grid pushes the shelf down. About is
editorial and can carry a set piece, and it is where "how it's made" belongs
without competing with the PDP process band and the five films.

**Brand ruling from Aaron, and it is an exception to the monochrome rule:**

> "I do think the fruit can have colour for once, but agree with the fonts etc."

So: **the fruit may be in colour** — this is the one sanctioned break from the
strictly-monochrome identity. Everything else holds. No `-apple-system`, no
system fonts: NONHelvetica and JetBrains Mono only. No CDN dependency, no React.
Use the existing house conventions — 1px strokes, butt caps, mitre joins,
`currentColor` for anything that is not the fruit, and the four motion tokens in
`:root`. `snippets/stat-icon.liquid` is the reference for how NON draws.

The zip's own palette (`#faf9f5` ground, `#E4573F` stroke) is NOT approved as
such — colour on the fruit is approved, that specific orange was never discussed.

## Outstanding after 2026-08-01 — nothing started, no half-built work

1. **Stockists offer cards** — the two closing cards ("Stock NON" / "Have it
   delivered") still put a large image ABOVE the text in a bordered card, while
   the equivalent pairs on Pairing and Shop overlay the text ON the photograph
   via `split-feature`. Aaron has flagged this twice as "not consistent". The
   fix is to render those two through `split-feature` like the others rather
   than tuning the ratio again — the media is now 16/9, and it is still the odd
   one out because it is a different component.

2. **Pairing dish chips do nothing useful** — they carry
   `data-answer="{{ block.settings.label }}"`, i.e. the answer IS the dish name,
   so clicking one types the label back at you instead of asking the somm. The
   chips are wired and fire (verified in a browser); the data is the problem.
   Either give `dish` blocks a real answer field, or drop `data-answer` and make
   somm.js fall through to a live `ask(label)` when a seed has none.

3. **Checkout is NOT theme-controlled.** Aaron flagged it as inconsistent. It is
   Shopify's hosted checkout — nothing in this repo styles it. It is changed
   through Settings → Checkout branding, or the Admin API
   (`checkoutBrandingUpsert`). That is a LIVE surface, so it needs explicit
   sign-off before anyone touches it.

4. **Stockists** — the largest remaining design gap, and a rebuild rather than a
   tweak. `design-reference/stockists.html` has: a display headline ("Find it
   poured near you.") over an eyebrow, a two-column panel with the map BESIDE
   the list rather than under it, result rows carrying venue type / bottles
   poured / distance, a "See all 1,400+ venues" card closing the list column,
   and a venue-suggestion form under the map. The build has none of that shape.
   Raised twice by Aaron; deliberately not started rather than half-done.
5. **Mobile** — untouched all evening, and Aaron has seen it ("pretty bad").
   Everything below 860px is unverified, and several 2026-08-01 changes have
   breakpoint behaviour only checked at desktop: the 5-across grids, the 380px
   card caps, the now-full-bleed shell, the recipe band's two-column panel, the
   PDP's 44px/28px step rail. Render every page at 390 and 768 in the harness
   and produce a list BEFORE changing anything.
6. **Cart "YOU WON" banner** — Aaron reports the animation not firing, and his
   screenshot also shows the description and code slots blank. Traced from
   source as far as it goes: `prize-pop.js` IS loaded, `is-popping` IS applied
   in `maybePop()`, which bails on three conditions — `box.hidden`, empty code,
   or `alreadyPopped(code)`, which marks a code in storage so **it only ever
   animates once per code**. That alone would explain "not triggering". But
   `cart.js` cannot un-hide that box without a code present, so a visible box
   with empty slots does not reconcile from source. Needs the live page; do not
   guess at it.
7. **Shop bottom cards** — done, but the two images are my pick from what was
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
