# Full QA sweep — spec

Queue position: **last. Aaron's explicit instruction.**

Do not start this before `site-speed-audit.md` is done and before the blockers in
`HANDOFF.md` are cleared. A sweep run against a theme with known-open blockers
re-reports the blockers as bugs and buries the real findings.

> **Provenance.** The original `full-qa-sweep.md` lived only on the Mac and was
> never committed. This is a reconstruction from `HANDOFF.md` and a source read of
> `staging` @ c014511. It is a checklist to execute, not a record of results.

---

## Preconditions

- [ ] Shopify Admin token fixed — Lotto can issue codes (`HANDOFF.md` blocker 1)
- [ ] Theme published, then `visit-us` published, in that order (blocker 2)
- [ ] The Everyday Set stock/handle decision made (blocker 3)
- [ ] Favicon supplied (blocker 4)
- [ ] Redirect inventory closed (blocker 5)
- [ ] `site-speed-audit.md` complete

## Ground rules

1. **Measure the wire, not the markup.** A class name is not evidence. A URL is
   not evidence. Bytes transferred and computed values are evidence.
2. **`./scripts/sync.sh "message"` for every push.** Never push without it.
   `scripts/check.py` encodes nine Shopify-rejection rules, each added because it
   actually happened. Shopify rejects invalid theme files **silently** and keeps
   serving the previous version — the only symptom is a change that "didn't
   apply". Sync takes ~60–75s; verify the deployed file's checksum against local
   before concluding a change landed.
3. **`design-reference/*.html` is the source of truth for every page.** A
   discrepancy is a bug in the build, not a licence to redesign.
4. **Read the environment traps in `HANDOFF.md` first.** Several false bug reports
   last session were the hidden-pane artefacts, not real defects.

---

## Sweep

### Per page, against `design-reference/`

For every page with a design reference: type sizes, spacing, colour, image
placement, copy. Check computed values, not the stylesheet.

Known-open, do **not** re-report as new:
- About is short of the design's 19 images. The bands exist; the photography does
  not. Content gap, not a build defect.

### Commerce path

Re-verify the cart findings in `docs/cart-cro-audit.md` rather than rediscovering
them. Confirmed working there — ATC (AJAX, no reload), variant clarity, qty and
remove, live subtotal, guest checkout — needs a regression check only.

Still open and expected to appear:
- Lotto "Apply to this order" at 5.6× the area of Checkout
- Free-shipping threshold hardcoded, in **two** independent places
- Cart add-ons built but no products selected in the theme editor

Not verifiable from the theme repo — do not guess: abandoned-checkout emails and
Klaviyo routing, checkout step count, trust badges, payment icons, mobile checkout
field attributes, post-purchase page.

### Markets

Five enabled: AU, CA, NZ, UK, International. For each: currency symbol, prices,
shipping messaging, and whether any promise made in the UI is actually configured
in Shopify Shipping.

### Somm and the shelf

`worker/somm/src/scoring-engine.js` is authoritative for pairing;
`worker/somm/src/occasions.js` projects it through nine canonical dishes to derive
`custom.food_tags`, which drives the Shop filter. **There is no second scoring
implementation** — a mismatch between Somm's answer and the shelf's filter is a
data problem, not a second engine to find.

- [ ] **NON9 must never pair with fish.** `test/pipeline.test.js` asserts this.
      That test previously asserted the opposite and is why the bug survived its
      first fix. Run it; do not eyeball it.
- [ ] `heatFit` (`cools` / `neutral` / `clashes`): `neutral` and `clashes` **cap**
      the score, they do not deduct.

Known data gaps — content, not code, do not file as bugs:
- NON3 has no `custom.style` → eyebrow reads `NON3 · 0.0% ABV · 750ml`
- NON3 has no `perfect_for_images` → "Made for" correctly renders nothing
- 9 products carry no `food_tags` (sets, 375ml, 3-pack box, waiter's friend)
- 3 orphaned `food_why` sentences (NON2×raw, NON3×braise, STOPPER×raw) describe
  pairings the engine no longer makes. Deleting brand copy is Aaron's call.

### Workers

`curl` from a shell cannot reach `*.workers.dev` — it is proxied and returns
1042/404 artefacts. **Verify Workers from the browser, not from Bash.**

- [ ] Somm — `https://non-somm.polished-snow-7889.workers.dev`
- [ ] Lotto — `https://non-lotto.polished-snow-7889.workers.dev`. `/health`
      reporting `ok:true` is **not** sufficient: it only checks the secret
      exists. Confirm a code is actually issued end to end.

### Design system

- [ ] Two fonts only: NONHelvetica and JetBrains Mono. No named fallbacks.
- [ ] Four motion tokens in `:root` — `--ease-standard`, `--ease-hover`,
      `--duration-reveal`, `--duration-hover`. Nothing invents its own curve.
- [ ] `reveal.js` hides content in JS, never CSS, and reveals unconditionally
      after 2.5s. Confirm the failsafe — an observer that never fires must not
      leave a blank page.
- [ ] Every section exposes appearance settings (background, text colour, font,
      text size, padding) via `snippets/section-style.liquid`.

### SEO

- [ ] Redirects — the highest-risk item on a rebuild
- [ ] Two weak titles: `/collections/the-range` → "Singles – NON",
      `/pages/pairing` → "Pairing – NON". These are Shopify SEO fields on the
      resources, not theme code.
- [ ] Brand `llms.txt` — Shopify's agentic-commerce file occupies `/llms.txt`
- [ ] Structured data via `snippets/structured-data.liquid`
- [ ] Favicon present

### Accessibility

Keyboard path through the drawer, focus trap and restore, visible focus rings,
contrast at the real computed colours, alt text coverage, and behaviour under
`prefers-reduced-motion`.

---

## Do not re-litigate

Settled last session:

- `format: 'webp'` saved **nothing** — 73,290 bytes with and without. The CDN was
  already negotiating from `Accept`. The real image win was `srcset`.
- Press quotes were **never** at the wrong size (27px = design 27px).
- The "missing header" report was the theme editor scrolled past it.
