# Cart & checkout CRO audit

Status: **reported, awaiting Aaron's sign-off.** Nothing in here has been changed.

Provenance: measured in a browser session against the staging theme. File-and-line
references below were re-verified against `staging` @ c014511 and are exact.

---

## Would likely cost sales

### 1. The prize button outweighs Checkout — High

| Element | Area |
|---|---|
| Lotto "Apply to this order" | 7,796px² |
| Checkout | 1,398px² |

The prize CTA is **5.6×** the area of Checkout. The highest-stakes button on the
site is not the dominant element in the drawer, and a won prize actively competes
with the purchase.

Fix: shrink the prize CTA to a text link, or make Checkout full-width and taller.

### 2. Free-shipping threshold is hardcoded across all markets — High

There is **one** global threshold, applied to **five** enabled markets
(AU, CA, NZ, UK, International).

Real configured thresholds:

| Market | Configured | Theme says | Correct? |
|---|---|---|---|
| AU | $75 | 75 | ✓ |
| US | $75 | 75 | ✓ |
| UK | £50 | 75 | ✗ |
| CA | no free rate found | 75 | ✗ unverified |
| NZ | no free rate found | 75 | ✗ unverified |

A UK customer at £55 is told "£20 away from free shipping" when they **already
qualify**. That is a message actively discouraging checkout at the moment of
decision.

Where it lives — there are **two independent** hardcodings, not one:

| File | Line | What |
|---|---|---|
| `config/settings_data.json` | 22 | `"free_shipping_threshold": "75"` — the single global value |
| `layout/theme.liquid` | 65 | injects it as `freeShippingThreshold` |
| `assets/cart.js` | 115 | `parseFloat(settings.freeShippingThreshold) * 100` |
| `sections/announcement-bar.liquid` | 64 | literal default text `"free shipping over $75"` |
| `sections/header-group.json` | 23 | literal text `"free shipping over $75"` |

The announcement-bar strings are a **separate bug from the cart drawer one**: they
hardcode the numeral *and* a `$` sign, so a UK visitor is shown "free shipping over
$75" in the wrong currency symbol as well as the wrong amount. Fixing `cart.js`
alone does not fix the announcement bar.

Fix options:
- Read the threshold per market, or
- Suppress the line outside AU/US until per-market values are configured.

### 3. CA / NZ may promise a rate that doesn't exist — High

The same line renders for Canada and New Zealand, and no free-shipping rate was
found configured for those zones. Verify against Shopify Shipping before launch —
if there is no free rate, the line is promising something undeliverable.

---

## Working well — do not "fix" these

| Step | State |
|---|---|
| Add to cart | AJAX, no page reload, drawer opens immediately (`pageReloaded: false`) |
| Variant clarity | 3 named options ("1 bottle / 6 pack / 12 case"), each priced, one preselected |
| ATC button | Solid, 73px, price in the label: "Add — $30.00" |
| Qty / remove | Both present, no reload |
| Subtotal | Clear, updates live |
| Guest checkout | `loginRequiredAtCheckout: false` — guest is the default path |
| PDP cross-sell | "Goes well in a case with" renders |

---

## Built but not switched on

Cart add-ons (Stopper / Waiter's Friend) are built into the drawer, but
`cartUpsellMarkup: false` — no products are selected in **Theme settings → Cart →
Add-ons**, so it never renders. Two picks in the theme editor and it is live.
No code change needed.

---

## Opportunity — design decision, not built

Add-to-cart is a wasted moment. Adding NON1 opens the drawer with no "complete the
mixed six" or "add a stopper" prompt. The mixed six is the stated cheapest-way-in,
and the drawer is where that argument lands hardest.

Flagged only. Not building without sign-off.

---

## Not verifiable from the theme repo

These are Shopify-hosted; anything stated about them would be a guess.

- Abandoned-checkout emails — whether enabled, and whether routed to Klaviyo
  rather than Shopify's default
- Checkout step count, trust badges, payment icons — Plus-plan dependent
- Mobile checkout field attributes — Shopify controls these
- Post-purchase page — needs a real order

The Klaviyo flow query was not run.
