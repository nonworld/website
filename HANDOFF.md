# HANDOFF — NON website

Written 2026-08-03. Paste sections 1–3 into a new session before doing anything.

The previous handoff is archived at `docs/HANDOFF-2026-08-02-superseded.md`.
It is long but still holds useful background — the Lotto worker, the Klaviyo
gap, and page-by-page notes. **Two things from it still apply:**
`design-reference/*.html` in this repo is the source of truth for every page's
design, and `./scripts/sync.sh` is the existing deploy helper — but see the
warning about it in section 1.

---

## 1. READ THIS FIRST — the traps that cost the most time

**Shopify silently rejects files. Git reports success either way.** Five
deploys were rejected without a word during this work. Every one was caught
only by byte-comparing local against deployed. A clean push means nothing, and
neither does `sync.sh` reporting success.

```bash
python3 preflight.py     # BEFORE every push. Exits non-zero on the known modes.
```

After pushing, compare against the theme:

```graphql
query { theme(id: "gid://shopify/OnlineStoreTheme/198370820256") {
  files(filenames: ["path/to/file"], first: 1) { nodes { filename size updatedAt } } } }
```

Local `wc -c` and the API's `size` must match exactly. If they don't, it was rejected.

**When a file silently refuses to deploy, upsert it through the Admin API.**
`themeFilesUpsert` returns the real `userErrors`; the GitHub sync swallows
them. This solved a two-session mystery in one call — the answer was
`Invalid schema: setting with id="heading" default can't be blank`. A text
setting with `"default": ""` invalidates the entire section file.

**The known silent-rejection modes**, all now in `preflight.py`:
1. `{{ }}` nested inside a filter argument — a hard Liquid syntax error
2. a trailing comma before `}}`
3. a template setting whose id is absent from the section schema
4. an empty `"default": ""` on a free-text setting
5. unbalanced CSS braces or comments

**Wrangler IS authenticated** as `hello@non.world` on the NON World account.
Worker deploys work from this machine.

**Browser-pane measurement traps.** The pane runs as a hidden tab:
- `setInterval` clamps to ≥1000ms, so the somm's typewriter crawls and anything
  gated behind it (the picks panel) looks broken when it isn't
- `requestAnimationFrame` pauses, so canvas animations read as static
- screenshots come back blank or stale — **trust DOM measurements over images**
- `clientWidth` sometimes reports 0; call `resize_window` with explicit
  dimensions before measuring layout

---

## 2. WHERE THINGS LIVE

| | |
|---|---|
| Repo | `/Users/aarontrotman/Claude Code/non-theme`, branch `staging` |
| Remote | `github.com/nonworld/website` |
| Theme being edited | `website/staging` — `gid://shopify/OnlineStoreTheme/198370820256`, **UNPUBLISHED** |
| Live theme | `Ven Shopify Theme cache refresh 2026-07-08 fresh` (MAIN) — **a different theme. None of this work is live.** |
| Preview | `https://www.non.world/<path>?preview_theme_id=198370820256` |
| Somm worker | `worker/somm/` → `non-somm.polished-snow-7889.workers.dev` |
| Design source of truth | `design-reference/*.html` |
| Animation source | `scratchpad/procanim/`, from `~/Desktop/Process animation sequence.zip` |

**Shopify writes back to git.** After any `themeFilesUpsert` the integration
commits the theme's copy back, which can overwrite your local file. Expect
`git pull --rebase`. Never blind-push.

---

## 3. OPEN DECISIONS — need Aaron, not code

1. **US market is DISABLED** (`enabled: false`). `/en-us` serves nothing
   regardless of what is published to it.
2. **NON Gift Card 404s on `/en-gb`** — gift cards are currency-denominated;
   the UK likely needs a GBP card, not a publication change.
3. **Privacy policy line** before somm queries can be logged. Task #14 is
   blocked on it; the Drive folder stays empty until then.
4. **Publishing locales.** ko, zh-CN, es and th are enabled but UNPUBLISHED,
   with `alternateLocales` already set on every market. Publishing one is a
   single `shopLocaleUpdate` and it appears in the picker immediately. Do not
   publish until that locale's row in `docs/translation-glossary.md` is
   complete — a locale that falls back to English is worse than one that does
   not exist, because the customer cannot tell.

---

## 4. SHIPPED AND VERIFIED

Byte-verified against the deployed theme and behaviour-tested in the browser.

**Pairing**
- `somm.js` was never loaded on the page — the dish chips rendered, focused and
  did nothing. Both earlier diagnoses were wrong: `data-answer` was already
  gone and the handler does bind. The script simply wasn't there.
- Questions load as you answer. An option can retire later questions via a 4th
  pipe field (`data-skip`). "Dessert & cheese" retires cooking and heat;
  "Just a glass" retires all three.
- Dessert gets its own question — chocolate/coffee, fruit/citrus,
  creamy/custard, cheese board — scored from each bottle's stated Shopify
  pairings, not invented.
- Verdict panel: photograph replaced with Contact's living dash field
  (density 12, gain 260% — same spacing over a smaller area gives a fraction of
  the dashes, so it had to be matched by texture, not by number). The somm's
  answer and picks both land here now.
- Matrix table **disabled, not deleted** — duplicated the tool, covered three
  of six bottles.

**Somm worker** — oysters return NON3 (97) over NON5 (85) and NON1 (70).
Moving the protein alone wasn't enough: NON3 had no `raw` cooking style so it
lost that component on its own headline pairing. Verified against the live worker.

**About**
- Process animation live, mid-page, replacing the static rail it duplicated.
  **Zero third-party requests** — React/ReactDOM vendored, `dc-support`'s
  loader short-circuits on `window.React`. Babel never loads (no JSX).
- Four sanctioned changes only: drink-matched accents sampled from product
  photography, colour on the drawings only, house fonts, React vendored.
- Split across four ~7KB snippets, each independently raw-wrapped — the
  artifact's templating uses `{{ }}` and unwrapped Shopify eats all 87
  placeholders.
- `zoom`-scaled on mobile; it was clipped at 375px, losing the drawings.
- Kitchen band is now three squares, one column on mobile.

**Site-wide**
- One canonical chip across `.non-filter`, `.non-pair__opt`, `.non-somm__seed`.
- Type scale raised ~+1px at every floor.
- Language picker in header + drawer, native `/localization` form.
- Closers pair renders from the **footer group on every page**; three per-page
  copies removed.
- Section background settings work — `section-style` only cleared
  `.non-section`/`.non-shell`, but most sections paint their own root.
- Logo marquee area ratio 4.9 → **1.60**, scales derived from aspect ratios.
- Market catalogs: Waiter's Friend, Gift Card, Stopper published to
  International, CA, NZ, UK, US.

**Reverted deliberately** — page header images. A full-size placeholder in the
prime position on six pages was far louder than the reminder Aaron asked for.
Read task #7 before rebuilding.

---

## 5. THE QUEUE

Working agreement: **one step at a time, deployed and verified before the
next.** New requests go on the queue rather than interrupting.

| # | Status | |
|---|---|---|
| 8 | not started | Speed audit. `theme.css` ~228KB with known duplication — five superseded `.non-poured__set img` blocks, many overridden `.non-somm__seed` blocks |
| 9 | not started | Forensic mobile audit. The animation clipping was found by measuring at 375px; expect more |
| 10 | half done | `preflight.py` built and catching real faults. **Runtime half remains**: empty catches in `somm.js`, `renderPicks` returning silently on an unknown code, `product-picks` dropping a product with no editor warning |
| 11 | step 1 done | Translation. Glossary + `locales/es.json` shipped. Per locale still: section copy, product copy, somm worker prompt |
| 12 | not started | Strip dead code, keep the theme app-friendly |
| 13 | not started | Instrumentation — Microsoft Clarity plus feature events. Standard analytics never caught the dead chips |
| 14 | blocked | Log somm queries to D1 → Drive. **Nothing is logged today**; the worker binds only an API key, two model names and a rate-limit counter |

---

## 6. TWO CORRECTIONS WORTH CARRYING

I reported something done when it wasn't, twice:

- **Languages** — publishing shop-wide wasn't enough. Every market web presence
  had `alternateLocales: []`, so the picker rendered nothing.
- **Cloudflare** — I said I couldn't deploy the worker. I could, all along.

Byte-verification catches theme lies. It caught neither of those, because
neither was a theme file. **For Shopify-admin and worker changes, verify the
end state through the API or the live endpoint — never the mutation's return
value.**
