# Placeholder copy for review — 2026-08-02

Everything here is a **placeholder drafted for Aaron's review**. Nothing in
section 1 or 2 has been written to the store. Section 3 has been applied to
`website/staging` only and is trivially reversible.

---

## 0. Two findings to read before the copy

### The small sets carry no saving. Do not write one.

The handoff proposed set copy covering "what it costs per bottle versus buying
them separately". Checked against live prices — that angle only works for the
six packs:

| Set | Price | Bottles | Per bottle | Bought separately | Saving |
|---|---|---|---|---|---|
| The Everyday Set | $90 | 3 | $30.00 | $90 | **$0** |
| The Light Set (`non-light-set`) | $90 | 3 | $30.00 | $90 | **$0** |
| The Light Set (`the-light-set`) | $60 | 2 | $30.00 | $60 | **$0** |
| The Blush Set | $60 | 2 | $30.00 | $60 | **$0** |
| The Dark Set | $60 | 2 | $30.00 | $60 | **$0** |
| Mixed 6 Pack | $150 | 6 | $25.00 | $180 | **$30** |
| Single-flavour 6 Packs | $150 | 6 | $25.00 | $180 | **$30** |
| NON4 / NON6 6 Pack (seasonal) | $180 | 6 | $30.00 | $180 | **$0** |

Bottle RRP is $30. The small sets are a *curation* proposition, not a value
one, so the copy below sells the pairing logic rather than the price. Writing
"better value" on those would be false.

### There are two different products both called "The Light Set"

- `the-light-set` — $60 — NON2 + NON3
- `non-light-set` — $90 — NON2 + NON3 + NON6

Same name, different contents, different price, both live. This is a
catalogue problem, not a copy one, and it needs deciding before either gets a
description.

---

## 1. Sets — `custom.spec_line` (fixes a live factual error)

The PDP prints the section-wide default `0.0% ABV · 750ml` on every product,
so a six-bottle pack currently claims to be a single 750ml bottle. Same class
of error as the Stopper printing an ABV. `custom.spec_line` overrides it
per-product.

These are facts derived from the product data, not copy:

| Product | `custom.spec_line` |
|---|---|
| Mixed 6 Pack | `0.0% ABV · 6 × 750ml` |
| The Everyday Set | `0.0% ABV · 3 × 750ml` |
| The Light Set (`non-light-set`) | `0.0% ABV · 3 × 750ml` |
| The Light Set (`the-light-set`) | `0.0% ABV · 2 × 750ml` |
| The Blush Set | `0.0% ABV · 2 × 750ml` |
| The Dark Set | `0.0% ABV · 2 × 750ml` |
| Single-flavour 6 Packs | `0.0% ABV · 6 × 750ml` |

**Not yet drafted — contents unverified:** The Spice Set, The Spring Set, The
Stopper Set, Mixed 6 Stopper Pack. The Stopper ones mix a bottle count with an
accessory, so the line needs deciding rather than deriving.

Say the word and I'll write these as metafields. I have not, because they are
store-wide product data rather than theme files.

### The serve line

`custom.serve` is null on every product and the Liquid supplies a hardcoded
`Chilled, wine glass`. On a set that is invented copy. Two options:

- **Set `custom.serve` per set** — e.g. `Chilled, 6–10°C, wine glass` (this is
  accurate, it is on the singles' own packaging).
- **Suppress it on sets**, as `custom.not_a_drink` already does for accessories.

I'd take the first: it is true, and a set of wine alternatives does have a
serve. Needs your call because it is a claim on a live page.

---

## 2. Sets — body copy (placeholder, needs your voice)

A set needs a different shape to a single: what is in it, and why those
bottles together. Drafted from each set's actual contents and the singles'
own profile copy — no invented tasting notes.

**The Everyday Set** — NON1, NON3, NON7
> Three bottles that cover a week rather than an occasion. NON1 for the light
> end, NON3 through the middle, NON7 when the food gets darker. Start here if
> you have not had NON before — it is the range in miniature, and it answers
> the question of which one to buy by not making you choose.

**The Blush Set** — NON1, NON5
> Both bright, both sparkling, both built on salt and acid rather than sugar.
> NON1 leans floral and red-fruited, NON5 tart and citrus. The pair for
> anything raw, cured or eaten outside.

**The Dark Set** — NON4, NON7
> The savoury end of the range. NON4 is roast beetroot and Japanese pepper,
> NON7 is stewed cherry and cold brew coffee. Both carry tannin and weight,
> which is what a plate with char or fat on it needs.

**The Light Set** — NON2, NON3 *(confirm which product this is first)*
> Buttery pear and kombu against bright orange and yuzu. One still, one
> sparkling, both with enough minerality to sit beside seafood and vegetables
> without disappearing.

**Mixed 6 Pack** — the full range
> Six bottles, $25 each rather than $30, and the only way to taste the whole
> range in one go. The cheapest way in, and the one to buy if you are cooking
> for people with different plates in front of them.

*(Mixed 6 Pack is the only one where a price claim is true.)*

---

## 3. Contact — APPLIED to staging

`sections/contact-main.liquid` renders `section.settings.lead`, but
`templates/page.contact.json` only ever set `intro`, which the section
consults as an `elsif` fallback. So the authored copy never displayed and the
page fell through to the schema default.

I have set `lead` to the copy that was already authored and stored, on the
basis that someone wrote it deliberately and it was only a wiring fault that
kept it off the page — and removed the dead `intro` key.

**Now showing:**
> Trade enquiries, press, stockist requests or something that has gone wrong.
> We answer everything.

**Was showing (the schema default):**
> Trade enquiries, press, stockists or a question about a bottle — this
> reaches a person.

Either is defensible. The first is more direct and admits things go wrong; the
second is warmer and reads more like the rest of the site. Tell me which you
want and I'll set it — this is a placeholder, not a decision.
