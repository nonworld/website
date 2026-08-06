# Catalogue extract — store `non-world`, products page 1 of >1

Source: Shopify Admin, read-only, via authenticated Chrome session, 2026-08-06.
Columns as rendered: Title / Status / Inventory / Category / Channels / Catalogs / Product type / Vendor.

INCOMPLETE. This is the first 50 by default sort. `limit=250` is ignored by
the admin index, so at least one more page exists — the 750ml NON1, NON2,
NON3, NON5, NON7 and NON8 bottles are NOT in this extract, which is how we
know it is partial. Do not treat this as the full matrix.

| Title | Status | Product type |
|---|---|---|
| The Everyday Set | Active | Wine Alternative |
| NON 3-Pack Box | Active | (none) |
| Mixed 6 Stopper Pack | Active | (none) |
| The Stopper Set | Active | Wine Alternative |
| The Everyday Set | Archived | Wine Alternative |
| The Spring Set | Active | Wine Alternative |
| Mixed 6 Pack | Active | Wine Alternative |
| The Harvest Set | Archived | Wine Alternative |
| ml Mixed 12 Pack + NON Bottle Opener | Archived | Wine Alternative |
| NON Wine Knife | Active | (none) |
| The Spice Set | Active | Wine Alternative |
| NON5 Lemon Marmalade & Hibiscus 6-Pack + Stopper | Archived | (none) |
| NON1 Salted Raspberry & Chamomile 6-Pack + Stopper | Archived | Wine Alternative |
| NON Stopper (POS $30) | Active | Bottle Stoppers & Savers |
| NON9 (POS) | Active | Wine Alternative |
| NON8 (POS) | Archived | Wine Alternative |
| NON7 (POS) | Active | Wine Alternative |
| NON5 (POS) | Active | Wine Alternative |
| NON3 (POS) | Active | Wine Alternative |
| NON2 (POS) | Active | Wine Alternative |
| NON Glass (POS) | Active | Wine Alternative |
| NON1 (POS) | Active | Wine Alternative |
| Mixed 6 Stopper Pack | Archived | Wine Alternative |
| The Stopper Set (NON9) | Archived | Wine Alternative |
| Mixed 6 Pack (NON9) | Archived | Wine Alternative |
| NON9 Oaked Blackberry & Plum 3 Pack | Archived | Wine Alternative |
| The Everyday Set (NON9) | Archived | Wine Alternative |
| NON9 Oaked Blackberry & Plum | Active | Wine Alternative |
| NON Stopper (POS Free) | Active | Bottle Stoppers & Savers |
| NON POS - 3 Bottles | Archived | Wine Alternative |
| NON POS - 2 Bottles | Archived | Wine Alternative |
| NON POS - 1 Bottle | Archived | Wine Alternative |
| The Spring Set | Archived | Wine Alternative |
| The Harvest Set (OLD) | Archived | Wine Alternative |
| NON1 Salted Raspberry & Chamomile 3 Pack | Archived | Wine Alternative |
| Mixed 6 Pack (NON8) | Archived | Wine Alternative |
| Mixed 6 Stopper Pack (NON8) | Archived | Wine Alternative |
| NON3 Toasted Cinnamon & Yuzu 375ml 12 Pack | Archived | Wine Alternative |
| NON1 Salted Raspberry & Chamomile 375ml 12 Pack | Archived | Wine Alternative |
| NON3 Toasted Cinnamon & Yuzu 375ml | Active | Wine Alternative |
| NON1 Salted Raspberry & Chamomile 375ml | Active | Wine Alternative |
| NON PROGRESS1 Poached Plum & Finger Lime 6 Pack | Archived | Wine Alternative |
| NON PROGRESS1 Poached Plum & Finger Lime | Archived | Wine Alternative |
| NON8 Torched Apple & Oolong Glass 150ml | Archived | Wine Alternative |
| NON7 Stewed Cherry & Coffee Glass 150ml | Archived | Wine Alternative |
| NON5 Lemon Marmalade & Hibiscus Glass 150ml | Archived | Wine Alternative |
| NON3 Toasted Cinnamon & Yuzu Glass 150ml | Archived | Wine Alternative |
| NON2 Caramelised Pear & Kombu Glass 150ml | Archived | Wine Alternative |
| NON1 Salted Raspberry & Chamomile Glass 150ml | Archived | Wine Alternative |
| The NON Stopper | Active | Bottle Stoppers & Savers |

## What this already shows

1. Two live products share the title "The Everyday Set" (one Active, one
   Archived) and "The Spring Set" likewise. Titles are not unique, so any
   matrix keyed on title is unsafe. Key on product id.

2. Product type is not standardised. Three values in use where the theme
   expects a clean split: "Wine Alternative", "Bottle Stoppers & Savers",
   and empty. NON 3-Pack Box, Mixed 6 Stopper Pack and NON Wine Knife have
   NO product type at all. A `product.bottle` / `product.set` /
   `product.accessory` template split cannot be driven off product type in
   its current state.

3. Sets and accessories carry the same product type as bottles, so type
   alone cannot distinguish a Mixed 6 Pack from a NON9.

4. Roughly half the catalogue is Archived, including several near-duplicates
   of live products distinguished only by a "(NON8)" / "(NON9)" / "(OLD)"
   suffix. Archived products do not render, but they do pollute search,
   reporting and any tag- or type-based automation.

5. A parallel POS product set exists (NON1..NON9 (POS), NON Stopper (POS $30),
   NON Stopper (POS Free), NON Glass (POS)). These are Active. Whether they
   are published to the Online Store channel is NOT in this extract and must
   be checked before publish — an Active POS duplicate visible online would
   put a second, differently-priced NON1 in the storefront.

## Not yet captured

- Page 2+ (includes the 750ml core range).
- Tags.
- Template suffix per product — the single most important field for the
  product-template work, and not shown in the index at all.
- Collection membership.
- Online Store channel publication state per product.
