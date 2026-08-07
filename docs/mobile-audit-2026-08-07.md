# Mobile pass — 402pt, staging, 2026-08-07

Every page walked at 402x874 (iPhone 16 Pro width) on the built staging theme,
scrolled end to end so lazy sections mount, then measured. Numbers are computed
values off the live page, not estimates.

Pages covered: home, `/collections/the-range`, bottle PDP, set PDP, accessory
PDP, pairing, stockists, about-us, contact, cart.

**Not covered:** the cart has no line items, so its layout is untested. Worth a
second look with something in it.

---

## 1. Defects — one correct answer, no design call

### 1.1 Contact page email links are 19px tall
`hello@non.world` (x2) and `sales@non.world` render as 19px-high inline links,
against the 44px tap-target floor the rest of the site holds. Three of them,
stacked, on the page whose entire job is getting in touch.

**Fix:** `display: inline-flex; min-height: 44px; align-items: center`. No
design decision — it is the site's own standard applied to the one place that
missed it.

### 1.2 Already fixed, pending Shopify rebuild (`290884e`)
Pushed to `origin/staging`; the theme had not rebuilt at the time of writing, so
these are not yet visible on the preview.

- **Hero:** the prompt chips ended 4px above the hero photograph. Now 28px.
- **Pairing verdict card:** `.non-pair__buymeta` computed to **19px** wide, so
  the bottle name wrapped one word per line and ran out under the Add button.
  `flex: 1` is `1 1 0%` — a zero basis — so the name column only ever got what
  was left after a 64px image and an Add that refuses to shrink. Given a real
  basis so the row is genuinely too wide and `flex-wrap` finally fires.
- **Dish generator:** did not scroll on the *first* WRITE THE DISH, only on
  re-rolls. The scroll was gated on `written`, which is false until the end of
  the function that sets it.

---

## 2. Needs a design call — I am not guessing at these

### 2.1 Mixed 6 band (`.non-firstbuy`) — the one you flagged
Still two columns at 402: **206px copy + 136px image**. That produces the
headline wrapping mid-phrase, "SHOP THE MIXED 6 PACK" wrapping to two lines
inside a narrow button, and a 6-pack photograph cropped to a sliver showing
three-and-a-bit bottles.

It is the only band on the site that keeps a desktop two-column ratio at phone
width. Everything else either stacks or scrolls.

**RESOLVED — (b), picture first.** Aaron's call, shipped in `2e24dfc`.

### 2.2 Stockists — 62px between the search bar and the filters
Down from 92px. Of the remaining 62, **44px is not spacing** — it is the orb's
96px box hanging below a 52px bar. The homepage puts its chips 14px under the
same bar, which is the consistency being asked for.

**RESOLVED — (b), filters in the bar's column.** Aaron's call, shipped in
`2e24dfc`. Offset written as `96px + 44px` (orb column + grid gap) rather than
as 140, so it stays true if either changes.

### 2.3 Sets have no Somm entry
The Somm block is gated on `has_spec`, which is false for anything without
bottle metafields. So a bottle PDP offers "Considering NON1?" and a set PDP
offers nothing.

**RESOLVED — confirmed intended.** Aaron: "sets don't need the somm". The
`has_spec` gate stays exactly as it is. Recorded here so the absence is not read
as a bug and "fixed" by a later pass.

---

## 2b. PDP video — resolved

Video media never played: the gallery's main slot is an `<img>` from
`image_url` and the thumbs swapped its `src`, so a video could only render as
its poster frame. Fixed in `21bfa60` / `9b32051` — a `video_tag` pane per video,
stacked over the image so the `<img>` keeps its eager load and LCP priority,
paused and reset when you switch away.

**The image leads, and that is deliberate.** Aaron: "I dont want it first." The
film stays one tap away on its thumb rather than opening the gallery. Do not
promote it to position 1, and do not add autoplay — the default view is the
bottle.

---

## 3. Content, not code — these are Shopify Admin edits

Flagged rather than papered over with CSS.

- **Set card headings are uppercase.** `CONTAINS / ABOUT / PROFILE /
  INGREDIENTS` against the Stopper's `How it works / No mechanism / Form`. That
  case is typed into the product description; nothing in the stylesheet
  uppercases it. If sets should match accessories, the descriptions need
  editing.
- **Sets have no blurb.** The Stopper carries one under its title because it has
  the metafield; the sets do not.
- **Contact form has no file upload,** and Shopify's native `contact` form
  cannot take one. Attachments need either an app or a third-party form
  service — a procurement decision, not a theme change.

---

## 4. Confirmed clean at 402

No horizontal overflow anywhere. No clipped content, no squeezed text columns,
no sub-40px tap targets outside the contact page.

- **Home** — hero, triptych scroller, range scroller, press row, globe all
  correct.
- **Shop** — 2-up product grid at 172px, correct.
- **Bottle PDP** — Somm entry 72+266, spec strip 2x201, process steps 44+285.
- **Set PDP** — cards stack full width at 356px.
- **Pairing** — clean.
- **About** — the process step rail now reads 3 + 2 with every number beside its
  word.
