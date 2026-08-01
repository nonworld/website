# Deep editability audit — text, colour, fonts, structure

Run **2026-08-01** against the theme at commit `6eabb5a`. **Report only** —
nothing in here has been changed. Every item needs triage before it gets built.

The brief was to hunt the recurring "looks connected but isn't" pattern: the
`--non-card-max` card width, the hardcoded `$75`, `custom.serve`'s fake
fallback, the missing `EN.NON SOMM` key, sections silently sitting on Shopify's
16-block cap.

## Headline

**That pattern is essentially gone.** The searches that would have found more of
it came back empty:

| Check | Result |
|---|---|
| Settings declared in a schema but never rendered | **0** |
| Translation keys referenced but missing from `locales/en.default.json` | **0** |
| Select/dropdown options that resolve to nothing | **0** |
| Repeatable content built as fixed-count settings instead of blocks | **0** |
| Inline colour styles in `.liquid` | **0** |

So there is **no Broken tier**. Everything below is **Missing** — content that
is hardcoded and has no setting at all — or **Fine**. That is a different and
much cheaper class of problem: nothing currently lies to Aaron in the editor.

The one thing worth doing soon is `pairing-matrix.liquid`, because it is the
only remaining item that can fail *silently*, the way the earlier four did.

---

# MISSING

## 1. Structural — the one live risk

### `sections/pairing-matrix.liquid` — Pairing page

Three block types (`bottle`, `course`, `note`), **`max_blocks` UNSET**, so it
inherits Shopify's default of 16 across all three combined. A pairing matrix is
bottles × courses; 16 total is a ceiling this section can plausibly reach, and
when it does the editor simply stops offering "Add block" with no explanation.
This is exactly how About, Stockists, NONHQ and main-product failed.

Every other section with an unset cap has 1–2 block types and no realistic path
to 16:

| Section | Types | Cap | Risk |
|---|---|---|---|
| `pairing-matrix.liquid` | 3 | **UNSET** | **Real** |
| `hero-somm.liquid` | 2 (`slide`, `seed`) | UNSET | Low — a hero with 16 slides is not a thing |
| `contact-form.liquid` | 1 (`topic`) | UNSET | Low |
| `logo-marquee.liquid` | 1 (`venue`) | UNSET | Moderate — a logo wall could grow past 16 |
| `main-collection.liquid` | 1 (`occasion`) | UNSET | Low |
| `press-quotes.liquid` | 1 (`quote`) | UNSET | Moderate — press coverage accumulates |

Deliberate low caps, correct as they are: `editorial-triptych` 4,
`split-feature` 2, `product-perfect-for` 6, `announcement-bar` 8. These are
layout constraints, not oversights — a triptych with five cells is not a
triptych.

## 2. Text — 57 hardcoded user-visible strings

None of these are broken. They render correctly in English. They are simply not
editable and not translatable: to change "What's it about" someone has to edit
Liquid. Grouped by page so this can be triaged rather than done as one job.

### Contact (`contact-form.liquid`) — 4
Form labels: `Name`, `Email`, `What's it about`, `Message`.

### NONHQ (`nonhq-concierge.liquid`) — 12
The booking form, the largest single cluster: `Name`, `Email`, `How many`,
`Experience`, `Preferred date`, `Time of day`, the four time options
(`A morning`, `Around lunch`, `Afternoon`, `Early evening`),
`Anything we should know`, and the placeholder
`"Dietaries, occasion, whether anyone needs converting."`

That placeholder is brand copy sitting in a template. It is the one string here
that reads like something Aaron would want to change without asking.

### Stockists (`stockists.liquid`) — 13
Filter UI and states: `Loading…`, `Loading stockists…`, `Search stockists`,
`Search`, `Stockists`, and the filter options `Everything`, `Restaurants`,
`Bars & pubs`, `Retail`, `Worldwide`, `Australia`, plus two aria-labels.

The venue-type and region options are the interesting ones — they are the
taxonomy of the page expressed as hardcoded `<option>` text.

### Pairing (`pairing-recipes.liquid`, `pairing-matrix.liquid`) — 8
Section labels: `The bottle`, `Effort`, `Method`, `Why it works`,
`Shopping list`, `Course`, plus two aria-labels.

### Shop / collection (`main-collection.liquid`, `main-list-collections.liquid`) — 6
`Everything` (filter default), `Nothing in this collection yet.` (empty state),
`Next →` (pagination), `Collections`, two aria-labels.

The empty state is customer-facing copy in a failure path — the kind of string
that is easy to forget exists until someone sees it.

### Lotto (`non-lotto.liquid`) — 3
`NON Lotto`, `Email`, `aria-label="Scratch to reveal"`.

### Product card (`snippets/product-card.liquid`) — 1
`The pick` — the badge on the recommended product.

### Chrome — 5
`footer.liquid`: `Instagram`, `NON Lotto`.
`header.liquid`, `featured-collection.liquid`, `main-cart.liquid`,
`main-product.liquid`, `hero-somm.liquid`: aria-labels only
(`Primary`, `Previous`, `Next`, `Decrease`, `Increase`, `Pack size`,
`Choose a slide`, `NON`).

**Suggested triage.** Three tiers, in value order:
1. **Brand copy** — the NONHQ placeholder, `The pick`, `Nothing in this
   collection yet.`, `Loading…`. Text a person would actually want to rewrite.
2. **Taxonomy** — the Stockists filter options and the NONHQ time-of-day
   options. These change when the business changes.
3. **aria-labels** — 14 of the 57. Zero editorial value; they matter only if
   the store is ever translated. Lowest priority by a distance.

## 3. Colour — 109 literals outside `:root`, 65 distinct

Zero inline colour styles in Liquid, so this is entirely `theme.css`.

The ones that matter are the **duplicates of colours that already have a
token** — the same failure shape as `$75` living in two files:

| Literal | Uses outside `:root` | Already a token? |
|---|---|---|
| `#0c0c0c` | 9 | Yes — brand ink |
| `#6b6862` | 8 | Yes — muted |
| `#f2f0ea` | 7 | Yes — paper |
| `#fff` | 7 | Partly |
| `#e8e8e6` | 5 | Yes — line |
| `#f4f2ec` | 4 | Yes |
| `#3a3a38` | 3 | Yes |

Roughly 40 of the 109 are re-statements of a token that exists three lines
above them in the same file. Changing the brand ink today means changing
`:root` *and* finding nine strays. Nothing is broken — they happen to hold the
same value — but they will drift the first time a colour is retuned.

The remaining ~65 are one-offs: shadows, hairlines, and gradient stops that
were never intended to be tokens.

---

# FINE — checked, not a bug

**Fonts — 69 of 71 `font-family` declarations use a token.** The two that do
not: the `@font-face` block for NONHelvetica (which *must* name the family
literally, that is what `@font-face` is), and one `inherit`. There is no
hardcoded font stack anywhere and no section using a face outside the two the
brand allows. This is clean and needs nothing.

**No theme font-picker settings, deliberately.** "Two fonts only: NONHelvetica
and JetBrains Mono" is an architecture decision, not an omission. A font picker
here would be a setting whose only correct value is the current one.

**Functional colours, correctly fixed:** `rgba(74,222,128,…)` — the live-dot
green on the Lotto/Somm status indicators. A status colour that follows a brand
palette stops signalling status. Same for the form-validation red.

**Deliberate low block caps:** `editorial-triptych` (4), `split-feature` (2),
`product-perfect-for` (6), `announcement-bar` (8) — see the table above.

**Unreferenced locale keys — 30 of 63.** Informational, not a fault. These are
keys with no current caller, the opposite of the `EN.NON SOMM` failure (a
caller with no key). They cost nothing and removing them risks breaking a
caller the grep missed.

**Two apparent missing translation keys are not missing.**
`cart.general.item_count` and `general.search.results_with_count` are
pluralised keys called with `count:`, so they resolve through the `one`/`other`
sub-objects rather than as a flat string. Flagged here because they will look
like bugs to the next person who greps.

**Select options — every option in every dropdown resolves.** Checked the same
way the `fill` media_ratio question was: read the Liquid branch and the CSS
each value lands in. No dead options. (`fill` remains correct — keeping the
420px min-height *is* what filling the band means.)

---

## What this audit cannot see

Byte-size verification proves a file arrived, not that it renders correctly,
and this audit reads source, not rendered pages. The `.non-process` class
collision — a section that deployed perfectly every time and rendered as a
crushed two-column mess — would not appear anywhere in this report. Neither
would a setting that is wired correctly but produces an ugly result.

Those need eyes on staging.
