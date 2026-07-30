# NON — AI-first site prototype

Static prototype of an AI-first non.world. No build step: every page is a plain
HTML file that loads `support.js` beside it. Open `index.html` locally or serve
the folder.

## Pages

| File | Page |
|---|---|
| `index.html` | Homepage — ask-first front door |
| `shop.html` | Shop — the somm is the filter |
| `product.html` | Product page — somm inside the buy box |
| `pairing.html` | Pairing — food→bottle, bottle→recipe |
| `nonhq.html` | NONHQ cellar door — concierge time request |
| `stockists.html` | Stockists — hands off to find.non.world |
| `about.html` | About — the 0.0% argument |
| `scratchie/` | NON Lotto scratch & reveal |

## Deploy

**GitHub Pages** — Settings → Pages → Source: `main`, folder `/site`.

**Netlify** — new site from this repo, publish directory `site`, no build command.
Add a password under Site settings → Access control if it shouldn't be public.

## Notes

- Somm answers are canned. The live-model path is in the Shopify theme's
  `app-proxy/` (separate delivery).
- Product photography is loaded from the live non.world CDN.
- NON4, NON6 and NON8 are missing from the shop grid pending verified pack shots.
- Desktop layouts only so far.
