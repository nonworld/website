# Mobile UI audit, 2026-08-03

Eight pages measured on the staging theme at 390×844 (iPhone 14/15), with
375×667 (SE) and 430×932 (Pro Max) as the narrow and wide checks. Everything
below was measured in the DOM against the deployed theme, not inspected in
source. Four defects found; all four are fixed and re-verified.

## Headline

**No horizontal overflow anywhere.** `document.scrollWidth` equals the viewport
on every page at every width tested. The elements that measure wider than the
screen — `non-announce__track`, `non-poured__track` — are marquees inside
clipped parents, which is what they are supposed to be.

The defects were all **touch targets**, plus one layout fault that put an
element completely off the screen.

| Page | Overflow | Sub-44px targets before | after |
|---|---|---|---|
| Home | none | 5 carousel dots (26×2) | 0 |
| Shop | none | 0 | 0 |
| Product | none | 0 (but no orb, see 1) | 0 |
| Pairing | none | 0 | 0 |
| Stockists | none | 7+ "Directions" (16px) | 0 |
| About | none | 2 CTAs (20px) | 0 |
| Cart | none | 0 | 0 |
| Contact | none | 3 mailto links (21px) | flagged, not changed |

The keyboard-only skip link is excluded throughout: it is deliberately parked
at -9999px and is not a touch target.

---

## 1. The somm orb was off the screen on every phone — CRITICAL

Measured on the product page at 390px: `margin-left: -138.391px` on a 66px
orb, with the component starting at x=22. The orb's box began at **x = -116**.

`--non-orb-core` is `40%`, and a percentage margin resolves against the
**containing block**, not the element. Above 700px the containing block is the
96px orb column, so 40% is 38.4px and the orb shifts by a little of itself.
Below 700px the two-column grid does not apply, so the same 40% resolved
against the full 346px component.

This is why the product page appeared to have no orb at all. It was not
missing or faint — it was 116px past the left edge, on every somm surface, on
every phone.

**Fixed:** below the 700px breakpoint the pull is dropped. The stacked mobile
layout puts the orb on top, so there is nothing to pull it into. Re-measured at
375, 390 and 430: `margin-left: 0`, box at x=22, on screen.

## 2. Carousel dots were 26×2px — HIGH

Five of them, on the homepage hero. A two-pixel-tall touch target.

**Fixed** without moving anything: the bar stays 26×2, and an absolutely
positioned, invisible `::after` centred on it carries the touch at 44px.
Hit-tested afterwards — a tap lands on the dot from −21px to +21px around the
bar, and correctly misses at −30px.

## 3. "Directions" was a 16px target — HIGH

On stockists, every venue row's only action. The one thing someone standing
outside a shop is trying to hit.

Measured 105px of vertical clearance between consecutive rows and nothing else
tappable inside a row, so a 44px area cannot collide with its neighbours.

**Fixed** with the same invisible `::after`, which also avoids adding 28px to
every row of a list that runs to thousands of venues.

## 4. About's two CTAs were 20px — MEDIUM

"Book a tasting" and "Find your pairing" — the two things that page exists to
drive.

The cause is a deliberate one. `.non-about-cta--media .non-about-cta__link`
sets `min-height: 0` so that over a photograph the CTA renders as an underlined
text link rather than a button. A rule further down gives `.non-about-cta__link`
a 44px floor, but it is one class less specific and loses. Correct visually,
wrong for a thumb.

**Fixed:** the underline stays on the text, so the height could not come from
the box. An invisible 44px `::after` takes the touch. Clearance to the nearest
other tappable measured 322px and 99px.

---

## Flagged, deliberately not changed

**Three mailto links on Contact are 21px** — `hello@non.world` twice and
`sales@non.world`. These are inline links inside body copy on consecutive
lines about 29px apart. A 44px hit area would overlap the line above and
below, so a tap near the boundary would fire the wrong link, which is worse
than a small target. WCAG 2.5.8 exempts links inline in a sentence for exactly
this reason. If you want them bigger, the fix is layout — put each on its own
line with real spacing — not a hit area.

**One text size under 12px**: the 9.5px "While stocks last" eyebrow. Legible at
that size in mono caps, but it is the smallest type on the site.

---

## What was already right

- **Form fields on Contact are 44px at 16px font.** The 16px matters: iOS
  zooms the viewport on focus for anything smaller, and that zoom does not
  reverse cleanly. Someone had already got this right.
- **Add to cart is 46×331** on the product page at 375px.
- **The drone video** renders 390×380 at `readyState 4` on About, and the
  process animation fits its column at 390 without the clipping the handoff
  described at 375.
- **The contact dash field's mask survived** being scoped away from the recipe
  band — checked explicitly, since that change could have broken it.

## Method

Per page: `document.scrollWidth` against `innerWidth`; every element whose
rect exceeds the viewport, excluding fixed, hidden and clipped ancestors;
every `a/button/input/select/textarea` with a rendered box, filtered to those
under 44px tall or 24px wide; and text nodes under 12px. Fixes were
re-measured on the deployed theme, and the tap areas hit-tested with
`elementFromPoint` rather than assumed from CSS.
