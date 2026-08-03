# NON translation glossary

The thing that makes every later locale cheap and safe. Written before the
first translation, because the terms below are where machine translation does
the real damage — not in the grammar, in the meaning.

## Never translate

| Term | Why |
|---|---|
| **NON** | The brand. Not a negation, not "sin", not "no". |
| **NON1 … NON9** | Product names. |
| **NON Somm** | Product name. Not "sommelier de NON". |
| **NON Lotto** | Product name. |
| **NONHQ** | Place name. |
| **Verjus** | The ingredient has this name in most languages. Do not render as "unripe grape juice" or a local approximation. |

## Translate with care — these carry the proposition

| English | Rule |
|---|---|
| **wine alternative** | NEVER "non-alcoholic wine", "vino sin alcohol", "無酒精葡萄酒". NON is not wine with the alcohol removed, and the whole brand argument collapses if the translation says it is. Use the target language's phrasing for *an alternative to wine*. |
| **not de-alcoholised** | The distinction is the point. If the target language has no clean way to say it, say "built from zero" rather than losing it. |
| **0.0% ABV** | Keep the numeral. Localise only the abbreviation for alcohol by volume. |
| **tannin, salinity, acidity, body** | Wine-trade vocabulary. Use the target language's *wine* term, not the everyday one — a sommelier reading it should recognise the register. |
| **cold steep, dry-hopped, sous vide, verjus pressed** | Process terms. Use the culinary term a chef would use, not a literal description. |
| **the pick** | A recommendation, not a selection or a harvest. |
| **poured at** | Venue listing. The sense is "served at", not "poured into". |
| **wine knife / waiter's friend** | The tool, not a knife for cutting. Spanish uses "cuchillo de camarero". Note the product was renamed from "NON Waiter's Friend" to "NON Wine Knife" on 2026-08-03. |
| **set / pack** | "El Set de …" and "Pack Mixto de …" — kept as the product-range words they are, not translated to "conjunto" or "lote". |

## Register

NON's English is short, declarative and slightly dry. It does not use
exclamation marks, it does not oversell, and it prefers a concrete noun to an
adjective. Translations should read as though written in the target language
by someone with the same restraint — not as an enthusiastic version of the
English.

Where a language has a formal and informal address, use the **informal**. The
brand speaks to one person, not to a customer base.

## Where translations live

- **Theme UI strings** — `locales/{code}.json` in this repo. Version-controlled, deployed with the theme.
- **Section and block copy** — Shopify's translation layer, not the theme. Edited in Translate & Adapt or registered through the Admin API.
- **Product copy** — Shopify product translations.
- **Somm answers** — generated live by the Worker. These cannot be translated after the fact; the target language and this glossary have to go INTO the prompt. See task #11.

## Status

| Locale | Theme strings | Section copy | Product copy | Published |
|---|---|---|---|---|
| `en` | source | source | source | yes |
| `es` | done | done | partial | no |
| `ko` | not started | not started | not started | no |
| `zh-CN` | not started | not started | not started | no |
| `th` | not started | not started | not started | no |

Nothing is published until its row is complete. A locale that falls back to
English is worse than one that does not exist, because the customer cannot
tell it is a fallback.
