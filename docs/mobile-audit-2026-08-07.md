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

**Options**
- **(a) Stack, image below the CTA.** Copy gets the full 358px, button fits on
  one line, image runs full-bleed at its natural ratio. Costs vertical height.
- **(b) Stack, image above the copy.** Leads with the product — consistent with
  how the PDP and the range cards behave on a phone.
- **(c) Keep two columns, flip the ratio.** Image takes the larger share and is
  re-cropped to a square detail rather than a squeezed group shot. Cheapest,
  keeps the band compact, but the button still wraps.

Recommendation: **(b)**. It matches the mobile pattern already used everywhere
else, and the 6-pack shot is the argument for the product.

### 2.2 Stockists — 62px between the search bar and the filters
Down from 92px. Of the remaining 62, **44px is not spacing** — it is the orb's
96px box hanging below a 52px bar. The homepage puts its chips 14px under the
same bar, which is the consistency being asked for.

**Options**
- **(a) Shrink the orb on this page** to roughly the bar's height. Closes the
  gap properly; makes the stockists orb smaller than the homepage's.
- **(b) Let the filters sit in the bar's column**, aligned to it rather than to
  the page gutter, so the orb's overhang sits beside them rather than above
  them. Also fixes an x-alignment inconsistency: the filters currently start at
  x=64 while the bar starts at x=204.
- **(c) Accept 62px.** It reads as deliberate spacing rather than as a mistake.

Recommendation: **(b)** — it fixes both the vertical gap and the left edge, and
it is the arrangement the homepage already uses.

### 2.3 Sets have no Somm entry
The Somm block is gated on `has_spec`, which is false for anything without
bottle metafields. So a bottle PDP offers "Considering NON1?" and a set PDP
offers nothing.

Defensible — a set is not one bottle, and the Somm answers about bottles. But it
is a deliberate absence rather than an accident, and worth confirming.

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
