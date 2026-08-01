# Site speed audit — spec

Queue position: **1 (next).**

> **Provenance.** The original `site-speed-audit.md` lived only on the Mac and was
> never committed, so it was lost with the session. This file is a reconstruction
> from `HANDOFF.md`, from in-repo comments that record prior measurements, and from
> a source read of `staging` @ c014511. Findings marked **measured** carry a real
> number and a source. Everything else is **to measure** and must not be reported
> as a result until it has been.

---

## The one rule

**Measure the wire, not the markup.**

Two wrong conclusions in the last session came from inferring behaviour from a URL
or a class name instead of from what was actually transferred or computed. Any
claim in this audit needs a byte count, a timing, or a computed value behind it.

## Where to measure

The live theme is **Ven** (`197808783520`). Our work is on the unpublished staging
theme (`198370820256`).

**Auditing `non.world` measures Ven, not this theme.** A speed audit against the
public URL is a number about code we are replacing. Use a staging preview URL, or
wait until the theme is published.

---

## Measured already — do not re-run

### Image format: no win available

`format=webp` saved **nothing**.

- `NON3-5.jpg` at `width=900`: **73,290 bytes** with the parameter, **73,290
  bytes** without it.
- Same URL fetched with `Accept: */*`: **126,095 bytes** of jpeg.

Shopify's CDN negotiates format from the `Accept` header and always has. The
parameter only matters for a client that fails to advertise webp support. Source:
`snippets/cdn-image.liquid`, lines 16–22.

### The real image win was `srcset`

Sections storing a CDN URL in a text setting — hero slides, triptych, split panels,
NONHQ rooms — emitted a bare `<img src>`: one file, one size, to every device. On a
375px phone the hero shipped 1080×1350 into a 375px slot, and it is the LCP
element. Fixed by `snippets/cdn-image.liquid`.

**To verify:** that every URL-sourced image path actually routes through
`cdn-image.liquid`. The snippet existing is not evidence that every call site uses
it. Grep the sections, then confirm on the wire that a phone viewport pulls a
narrow variant.

### Fonts: one render-blocking request removed

Newsreader was loaded and referenced by nothing — a render-blocking request for a
font that could not have rendered. Removed. Source: `layout/theme.liquid`, 32–39.

---

## To measure — nothing here has a number yet

### Core Web Vitals — the actual gap

**LCP and INP are both still unmeasured.** This is the reason the audit exists.

- LCP on mobile, on a phone viewport, on a real connection profile
- INP — the drawer open, the variant switch, and the Somm query are the
  interaction candidates
- CLS across the revealed bands

Measure via a headless browser you control. Do **not** measure from a pane in
`visibilityState: hidden` — see the environment traps in `HANDOFF.md`; that state
freezes `requestAnimationFrame`, throttles `setTimeout` to ~1s, and can report
`innerWidth: 0`, which silently invalidates every timing and layout number.

### Render-blocking head

`layout/theme.liquid` currently blocks on, in order:

| Line | Request | Blocking? |
|---|---|---|
| 30–31 | `preconnect` to `fonts.googleapis.com` / `fonts.gstatic.com` | no |
| 41–43 | Google Fonts stylesheet, JetBrains Mono 400;500, `display=swap` | **yes** |
| 45 | `theme.css` | **yes** |

Open questions, each needing a number:
- What does the Google Fonts round-trip cost against LCP? JetBrains Mono is the
  secondary face — Helvetica Neue is self-hosted in `theme.css`. Self-hosting the
  mono face would remove a third-party origin from the critical path entirely.
- `theme.css` is **78,394 bytes** uncompressed. What is it over the wire, and how
  much is above-the-fold critical?

### JavaScript weight

All deferred, so not render-blocking, but it is real bytes and real main-thread
time. Uncompressed:

| Asset | Bytes |
|---|---|
| `lotto.js` | 15,208 |
| `globe.js` | 14,237 |
| `cart.js` | 13,676 |
| `stockists.js` | 12,712 |
| `somm.js` | 12,065 |
| `pairing.js` | 6,740 |
| `collection.js` | 5,498 |
| `prize-pop.js` | 5,118 |
| `reveal.js` | 4,542 |

To determine: which of these load on **every** page versus only their own
template. `globe.js` and `stockists.js` are single-page features; if either is in
the global layout it is dead weight on the PDP and on the LCP path's competition
for main thread.

### Third-party origins

Enumerate every non-Shopify origin the page touches and what each costs:
Google Fonts, the Somm Worker, the Lotto Worker, Klaviyo, analytics.

---

## Definition of done

- LCP and INP have numbers, taken on a staging preview, on a phone viewport, in a
  browser that is not backgrounded
- Every image path confirmed on the wire to serve a viewport-appropriate variant
- Render-blocking chain in `theme.liquid` either justified or reduced, with the
  before/after cost stated
- Per-template JS payload known, and anything global-but-single-page moved
- Findings written back into this file with numbers, replacing the "to measure"
  sections
