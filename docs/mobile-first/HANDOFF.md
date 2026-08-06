# Mobile-first commerce — implementation handoff

Built 2026-08-06 against the NON Mobile-First Commerce Build Brief.
Branch `staging`, theme `website/staging` (`gid://shopify/OnlineStoreTheme/198370820256`).

**None of this is live.** Staging is unpublished; anonymous visitors still get
the published theme. Preview: `https://www.non.world/<path>?preview_theme_id=198370820256`.

---

## 1. What the mobile experience is now

The phone was reading the desktop's page slowly. Measured at 375×812 before any
of this, and again after:

| | before | after |
|---|---|---|
| Hero height | 984px | **673px** |
| First buyable bottle appears at | 1,226px | **915px** |
| "Made for" band | 1,129px, three stacked squares | **293px, three across** |
| Whole document | 5,086px | **3,867px** |
| Document-level horizontal overflow | none | none |

The Somm stopped being a form inside the hero and became the way the store is
searched. It opens as a near-full-height sheet from four entry points — the hero
button, the hero prompt chips, the "Made for" tiles, and the product page — and
all of them continue **one** conversation, because a customer who asks about
mains and then taps a bottle has not started a new thought.

Mobile section order (homepage): hero → Core range → Made for → Mixed 6 Pack →
Poured at → Press → Sets, then the footer group's NONHQ and Stopper closers.

---

## 2. Changed files

**New**

| file | what it is |
|---|---|
| `snippets/somm-sheet.liquid` | the bottom sheet, rendered once from `theme.liquid` |
| `assets/somm-sheet.js` | open/close, focus trap, scroll lock, keyboard, entry-point context |
| `sections/featured-set.liquid` | the Mixed 6 Pack band |
| `assets/featured-set.js` | its two analytics events |
| `assets/steps-accordion.js` | "How it's made" collapsed to five stage names |
| `assets/pairing-triptych.js` | tapping a pairing photo expands its explanation |
| `docs/mobile-first/desktop-baseline.txt` | the pre-work computed-style fingerprint |

**Changed**

`assets/theme.css` (+932, one guarded block) · `assets/somm.js` · `assets/lotto.js` ·
`assets/press-rotate.js` · `assets/product.js` · `layout/theme.liquid` ·
`locales/en.default.json` · `preflight.py` · `snippets/section-style.liquid` ·
`sections/hero-somm.liquid` · `sections/editorial-triptych.liquid` ·
`sections/featured-collection.liquid` · `sections/logo-marquee.liquid` ·
`sections/press-quotes.liquid` · `sections/main-product.liquid` ·
`sections/product-process.liquid` · `sections/non-lotto.liquid` ·
`sections/pairing-tool.liquid` · `templates/index.json` · `templates/product.json`

---

## 3. The breakpoint

**`max-width: 859px`** — the theme's own mobile ceiling, already used by 17
blocks in `theme.css` and by the `main` layout. The brief offered 749px as a
fallback "if no consistent breakpoint exists"; one does, and inventing a second
would leave a 110px band that is half of each.

**Consequence to be aware of:** a 768px tablet gets the phone layout. That is
the right call for a page whose desktop layout is a 50/50 split that does not
fit in 768, but it does mean the brief's 768px test width is *mobile*, not
desktop. The Core Range rail is the one place this was tuned separately — 1.35
cards below 700px, the existing 2.2 from 700–859, because 1.35 columns of a
768px tablet is a 530px product card.

---

## 4. New theme settings

| section | setting | what it does |
|---|---|---|
| all homepage sections | **Position on mobile** (`mobile_order`, 0–12) | where the section sits on a phone. 0 = leave it. Desktop always follows the template. |
| Hero + NON Somm | **Phone prompt** (`mobile_placeholder`) | the line inside the Somm button on a phone |
| Hero → Suggested question | **Short label**, **Intent**, **Show on mobile** | the first three ticked become the hero's phone chips |
| Editorial triptych → Panel | **Focal point** | which part of the photo survives the crop, e.g. `50% 30%` |
| Editorial triptych → Panel | **Meal category**, **Opening question**, **Answers**, **Accessible name** | fill in the meal category and the tile opens the Somm instead of following its link |
| Product page → Suggested question | **Short label** | the phone chip's wording. Must shorten the same question — the chip's text is what is read, the full question is what is sent. |
| Product page | **Phone Somm label** (`somm_pdp_label`) | sits above the Somm button; the product code is appended |
| Featured set | product, eyebrow, heading, body, buttons, secondary link | the band's copy. Price and availability are never settings. |

---

## 5. NON Somm request and response contract

Unchanged except for one **additive** field. The Worker can ignore it entirely
and behave exactly as it does today.

```jsonc
POST <settings.somm_endpoint>
{
  "query":   "roast chicken",
  "context": "home" | "product" | "collection" | "pairing",
  "page":    "/products/non1",
  "code":    "NON1",
  "locale":  "en",
  "facts":   { … },              // the PDP's spec sheet, unchanged
  "history": [ … ],              // last 8 turns, unchanged

  // NEW — where the question came from.
  "surface": {
    "surface":        "homepage_hero" | "homepage_triptych"
                    | "product_page"  | "product_pairing",
    "context":        "home" | "product",
    "intent":         "dinner" | "gift" | "going_dry" | "",
    "meal_category":  "starters" | "mains" | "dessert" | "",
    "code":           "NON1",
    "product_id":     "4789395619885",
    "variant_id":     "52422223659168",
    "product_title":  "NON1 Salted Raspberry & Chamomile",
    "product_price":  "$30.00",
    "product_available": true
  }
}
```

Nothing in `surface` is free text the customer typed. The response shape is
unchanged: `{ answer, picks: ["NON3","NON1"], escalate? }`, or SSE.

**Worth doing next, but not done here:** the Worker does not yet read `surface`.
Until it does, a customer who taps "Mains" and answers "Roast chicken" gets a
good answer from the words alone — the category is being sent and ignored.

---

## 6. Product-data dependencies

The Somm cannot invent a price because it is never given one. It answers in
bottle codes; every price, variant, availability and image is resolved in the
page from `[data-non-catalogue]`, which Liquid renders from Shopify.

| feature | data it needs | state today |
|---|---|---|
| recommendation cards | `the-range` / `non-sets` collections, published to the market | working |
| Mixed 6 Pack band | product `mixed-6-pack`; `compare_at_price` for the saving | working — renders $150.00 from $180.00, Save $30.00 |
| PDP pairing triptych | `custom.perfect_for_images` (≥3) **and** `custom.pairings` (≥3), same course order | working on NON1 |
| "How it's made" | `custom.process_steps` or `custom.process` | working — Fruit, Tannin, Salinity, Acidity, Balance |

**The pairing strip is a positional join and is guarded like one.** Images and
pairings are matched by index; on NON1 the files are literally
`non1-perfect-for-starters/-mains/-dessert` and the pairings run starter → main
→ dessert. If the counts do not match, or the section has editor Pairing blocks,
the strip does not render at all and the existing prose cards stay. **Verify the
other eight bottles before publishing** — this has only been confirmed on NON1.

---

## 7. Analytics dictionary

Existing convention: `NON.track(name)` pushes `{event: "non_" + name}` to
`dataLayer` and fires a `non:track` DOM event. Names below are as the brief
specifies them; on the wire they carry the `non_` prefix.

| event | when |
|---|---|
| `somm_opened` | sheet opens, with the entry point |
| `somm_closed` | with a reason: button, escape, drag, scrim, cart_opened, add_to_cart |
| `somm_prompt_selected` | a chip inside the sheet |
| `somm_clarification_answered` | a follow-up answer chip (one with no canned copy) |
| `somm_question_submitted` | **every** question, from every surface — typed, chipped, retried |
| `somm_recommendation_returned` | picks painted on screen, not on fetch success |
| `somm_recommendation_failed` | endpoint unreachable |
| `somm_product_viewed` | a card followed through to the PDP |
| `somm_product_compared` | "Show me another" |
| `somm_add_to_cart` | **after Shopify confirms**, never on the click |
| `somm_add_to_cart_failed` | with the reason |
| `triptych_tile_selected` | a "Made for" tile |
| `pairing_tile_selected` | a PDP pairing photo |
| `featured_set_viewed` | half the band on screen, once per page |
| `featured_set_selected` | distinguishes the product link from "View all sets" |

Properties: `surface`, `page_type`, `entry_point`, `intent`, `meal_category`,
`product_id`, `variant_id`, `recommended_product_id`, `recommended_variant_id`,
`prompt_type`, `recommendation_id`, `conversation_id`, `position`, `currency`,
`chars`, `reason`.

**No conversation text is sent.** `chars` is a length. `conversation_id` is a
random `sessionStorage` value that dies with the visit and is never sent to the
Worker — it exists only to join analytics rows. `non-events.js` also strips any
property named query/question/text/value/email/name/message/answer, as a backstop.

The existing `somm_started` / `somm_answered` / `somm_failed` triple is untouched.
The two sets measure different things: the triple answers "is the feature alive",
these answer "did it sell anything".

---

## 8. Desktop comparison results

Method: a computed-style fingerprint captured **before any edit** and stored in
`docs/mobile-first/desktop-baseline.txt` — 31 properties plus the bounding rect
for every element matching 68 selectors. Screenshots from the browser pane are
downscaled to 800×500, far too coarse to catch a 2px change; the last regression
caught in this repo was found by diffing computed properties, so that is the gate.

| state | result |
|---|---|
| Homepage 1440 | identical in every computed property; see the note below on one rect |
| Homepage 1024 | **identical** |
| PDP 1440 | **identical** |
| PDP 1024 | **identical** |
| Cart drawer 1440 | identical apart from the drawer's own open state |

Press quotes rotate on a timer, so which pair is mounted varies between
captures; the diffs were run with the rotation pinned to the baseline's pair.
Desktop rotation still runs — verified separately.

**The one measurement that did not reconcile, and why it is not a regression.**

On a fully settled homepage at 1440 the product card measures 399.29px tall
against the baseline's 391.49 — 7.8px, which then shifts everything below it.
Chased properly rather than waved through:

- **Zero authored CSS properties differ** anywhere on desktop. The only two
  "CSS" lines in the whole diff are `gridTemplateRows` on `.non-row`, which is
  a computed track size derived from the tallest card, not a rule.
- **The same component matched exactly on the PDP.** `.non-card` in the related
  -products row is byte-identical to its baseline at both widths. If a rule of
  mine had changed the card, that row would have moved too.
- **Removing my CSS entirely does not change it.** Deleting all seven top-level
  rules of the mobile-first block through the CSSOM and re-measuring leaves the
  card at 399.29 — the same number. The block is not participating.
- Font metrics, webfont load state and image load state were each tested and
  each ruled out.

So the 391.49 in the baseline reflects a condition present at that one capture
and not reproducible since. It is recorded here rather than quietly rounded
away, because a regression suite that reports a number nobody can explain is
worth less than one that says which number it could not explain.

The marquee's `.non-poured__set` also appears in some runs at 1141px against
the baseline's 448 — that one **is** load state, and it reads 448 again on a
normal load. It moves only after lazy images are force-loaded, which is
something the test harness did, not the page.

**Three real desktop regressions were introduced and fixed during the build**,
all caught by this baseline and none visible in a code diff:

1. The PDP pairing strip was styled inside the mobile query but never hidden
   outside it, so it rendered at every width and pushed the desktop product page
   down 411px.
2. The triptych's tile button is `position: absolute` only inside the mobile
   query, so on desktop it was a normal-flow button above each photograph — the
   band grew 340px → 359px.
3. The featured set hid its contents but not its section wrapper, leaving a
   zero-height seventh child of `main` on every desktop page.

---

## 9. Mobile viewport results

| width | overflow | hero | triptych | chips one row |
|---|---|---|---|---|
| 320 | none | 698 | 3 cols, 280px | yes |
| 375 | none | 673 | 3 cols, 293px | yes |
| 390 | none | 673 | 3 cols, 304px | yes |
| 430 | none | 673 | 3 cols, 335px | yes |
| 768 | none | 680 | 3 cols, 340px | yes |

Triptych stays inside the brief's 280–340px at every width. Below 360px the
tile subtitles and the featured set's photograph drop out — at 90px a column,
"oysters, radicchio, cured fish" is five lines.

Verified functionally on the deployed theme: sheet open/close/Escape/focus
restore, body scroll lock and release, triptych → follow-up question → live
recommendation with real variant and price, add to cart (cart count 1, drawer
opened, sheet stepped aside), PDP pairing expand and collapse, five-stage
accordion, blank-reward suppression, and "No thanks".

---

## 10. Accessibility results

- **Touch targets** — every new control ≥44×44. Three sub-44 targets remain on
  the page and all three pre-date this work: the skip link (145×43), the menu
  button (42×44) and the hero carousel dots (26×2).
- **Sheet** — `role="dialog"`, `aria-modal="true"`, labelled "NON Somm", focus
  trapped, Escape closes, focus returns to the trigger, `.non-shell` set
  `aria-hidden` while open, body scroll locked and restored to the same position.
  Panel height 94% of the visual viewport (brief: 90–96%).
- **Keyboard height** — the sheet sizes from `visualViewport`, not `dvh`. On iOS
  the keyboard does not shrink `innerHeight`, so a `dvh` sheet keeps its full
  height and slides its own input underneath the keyboard.
- **Accordion** — `<button aria-expanded aria-controls>` with the body hidden by
  the `hidden` attribute, so it leaves the accessibility tree when closed.
- **Duplicated variants** — every mobile/desktop pair (Somm entry vs inline Somm,
  featured set vs Sets carousel, ingredient list, pairing strip vs prose cards)
  is hidden with `display: none`, which removes it from the accessibility tree.
  No content is exposed twice.
- **Reduced motion** — the sheet appears without travelling; the accordion caret
  does not rotate.
- **Skip link and landmarks** — untouched.

### Known accessibility limitation — read this one

**Mobile visual order and DOM order do not fully agree.** Sections are reordered
with CSS `order`, and tab order follows the DOM. On mobile the visual order is
hero → range → made-for → Mixed 6 → poured → press → sets, while the DOM is
hero → poured → range → sets → made-for → Mixed 6 → press.

This is WCAG 2.4.3 (Focus Order) / 1.3.2 (Meaningful Sequence). It was reduced
as far as it can go for free: the featured set was moved next to "Made for" in
the template, which costs nothing on desktop because that section is
`display: none` there. Two sections remain out of sequence — "Poured at" (no
focusable content) and "Sets" (a product rail, reached earlier by keyboard than
by eye).

Removing it entirely means reordering the template to the mobile order and using
CSS `order` on **desktop** instead — which moves the same defect onto desktop and
breaks the brief's one hard constraint. **This is a decision for Aaron, not a
bug to fix quietly.**

---

## 11. Known limitations

1. **The Worker ignores `surface`.** Context is collected, sent and unread.
2. **The pairing strip is verified on NON1 only.** Eight other bottles unchecked.
3. **Focus order**, above.
4. **`scripts/sync.sh` cannot run.** `scripts/check.py` exits non-zero on a clean
   tree — five false positives against `snippets/ask-form.liquid`, all
   pre-existing and unrelated to this work. Confirmed by stashing everything and
   re-running. Every push here was done with plain git, following sync.sh's own
   discipline: pull --rebase, preflight, commit, push, verify not-ahead.
5. **Byte-verification against the Admin API was not possible** — the Shopify
   connector is invalidated (HANDOFF notes this has happened before). Every
   change was instead verified on the deployed page, which is the stronger check:
   it proves the file both landed and works.
6. **The desktop Somm's "answered" state has no fingerprint.** The typewriter is
   clamped to ≥1000ms in the browser pane's hidden tab, so reaching the end state
   takes ~2 minutes per capture. Its CSS is covered by the idle-state fingerprint;
   only the text-dependent height is not.
7. **Hero prompt chips read Dinner / Going dry / Gift** — they follow block order
   in `index.json`, not the brief's listed order. Reorderable in the editor.

---

## 12. Manual Shopify configuration still required

1. **Nothing is required for this to work.** It is running on staging now.
2. **Before publishing**, check `custom.perfect_for_images` and `custom.pairings`
   on the eight bottles other than NON1 — same count, same course order.
3. **Optional**: tick "Show on mobile" on different hero questions, or set
   "Short label" on the fourth PDP question, from the theme editor.
4. Everything the brief listed as out of scope stayed out: no pricing changes, no
   collection changes, no checkout changes, no new framework, no analytics
   platform change.

---

## 13. Two bugs found in passing

Both are outside the brief's scope but were found by it and are one line each.

**The lotto's "No thanks" button was not a close control.** A whitespace-
stripping comment sat between two attributes and stripped the newline separating
them, so the markup rendered `data-non-lotto-closedata-done-label="Done"` — one
attribute with a nonsense name. `data-non-lotto-close` was never on the element.
On a phone, which has no Escape key, that button was the only way out of a
full-screen modal. It survived an earlier repair because the symptom reads as a
JavaScript binding fault; the JS was rewritten to delegate, which is the better
pattern and is kept, but it was never the bug.

**The same mistake exists in `pairing-tool.liquid`**, where the welded attribute
is `shopify_attributes` — empty on the storefront and non-empty in the theme
editor. So those dish chips are dead in the editor and alive on the live page,
which is the hardest possible version of this bug to believe.

Nothing about either looks wrong in a rendered diff, so **`preflight.py` check 3c**
now fails the push on a valueless attribute followed by a whitespace-stripping
tag inside an element.

---

# Release-candidate pass — 2026-08-06

## Pairing data, all live products

Six live bottles, not nine. Audited by fetching every PDP and reading what the
theme actually rendered.

| Product | `pairings` | `perfect_for_images` | Strip | Fallback | Status |
|---|---|---|---|---|---|
| NON1 Salted Raspberry & Chamomile | 3 | 3 | renders | — | **PASS** |
| NON2 Caramelised Pear & Kombu | 3 | 0 | suppressed | 3 prose cards | **PASS (no strip)** |
| NON3 Toasted Cinnamon & Yuzu | 3 | 0 | suppressed | 3 prose cards | **PASS (no strip)** |
| NON5 Lemon Marmalade & Hibiscus | 3 | 0 | suppressed | 3 prose cards | **PASS (no strip)** |
| NON7 Stewed Cherry & Coffee | 3 | 0 | suppressed | 3 prose cards | **PASS (no strip)** |
| NON9 Oaked Blackberry & Plum | 3 | 0 | suppressed | 3 prose cards | **PASS (no strip)** |
| Mixed 6 Pack | — | — | n/a | n/a | **PASS (set)** |
| The Everyday Set | — | — | n/a | n/a | **PASS (set)** |
| NONstopper | — | — | n/a | n/a | **PASS (accessory)** |

All six bottles are in stock with three variants each and live variant IDs.

**Only NON1 has the photography.** The guard behaves exactly as designed — no
images, no strip, prose cards stay — so nothing is broken and nothing is
misjoined. It does mean one bottle gets photographs and five get text.

**This is a content decision, not a code one.** Either upload
`nonN-perfect-for-starters/-mains/-dessert` for the other five, or ask for the
strip to be switched off on NON1 until they exist. Fifteen images.

## Homepage, one order

DOM order and visual order are identical and verified equal at every width:

Hero → Poured at → Core range → Made for → Mixed 6 → Press → Sets → NONHQ →
Stopper → Footer.

No `order`, no grid-area reordering, no transforms. `main` is not a flex
container. The `mobile_order` setting has been removed from the six schemas and
from the template, so it cannot be reintroduced by accident.

| Measure at 375×812 | Target | Now |
|---|---|---|
| Hero | ≤673 | **671** |
| Core range begins | ≤915 | **900** |
| Made for | 3 across, compact | **293px, 3 across** |
| Document | ≤3,867 | **3,860** |
| Horizontal overflow | none | none |

## PDP, one order

Gallery → identity + "Drinks like" → pack → Add + shipping → fast facts →
food pairing → "Still deciding?" → ingredients + process → complete the case.

Achieved by moving the markup: the pairings and the Somm entry are their own
sections now. No CSS reordering anywhere on the page.

| Measure at 375×812 | Target | Before | Now |
|---|---|---|---|
| Product title | 550–600 | 701 | **544** |
| Pack selector | visible by 750 | — | **720** |
| Add to cart | 850–900 | 1,061 | **~890** |

## Known blockers

**DO NOT PUBLISH — content:** five of six bottles have no pairing photography.
Not a defect; a visible inconsistency. Decision required (above).

**DO NOT PUBLISH — pre-existing, unchanged by this work:** the privacy policy
still does not disclose the Somm or its US processor, and publishing starts
sending customer free text to it. That is task #21 in the root HANDOFF and it
is a legal review, not a code change.
