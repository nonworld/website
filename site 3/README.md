# NON — AI-first site

Static site, no build step. Every page is a plain HTML file that loads
`support.js` beside it.

## Pages

| File | Page |
|---|---|
| `index.html` | Homepage — ask-first front door, NON Lotto pop-up on first visit |
| `shop.html` | Shop — the somm is the filter |
| `product.html` | Product page — somm inside the buy box |
| `pairing.html` | Pairing — food→bottle, and bottle→recipe on silver |
| `nonhq.html` | NONHQ cellar door — concierge takes a time request |
| `stockists.html` | Stockists — live Leaflet map, hands off to find.non.world |
| `about.html` | About — the 0.0% argument |
| `scratchie/` | NON Lotto, standalone |
| `stockists-map.html` | Leaflet map, embedded by stockists.html |

## Netlify

Build command: none. Publish directory: this folder.

## Known gaps

- Desktop layouts only.
- Somm answers are canned; the live-model path is in the Shopify theme's `app-proxy/`.
- Product photography loads from the live non.world CDN.
- Missing from the shop grid pending verified pack shots: NON4, NON6, NON8.
- NON7, NON9 and the Everyday Set lead with food photography — they need cut-out
  pack shots on white.
