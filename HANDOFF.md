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

**`preflight.py` is the gate, and it grew two checks on 2026-08-04.** Check 6b:
`grid-template-columns` may be declared on `.non-somm` exactly once — two
blocks ninety lines apart both set it, the later won silently, and moving the
children into column 1 crammed the whole component into a 96px track on every
page. Check 7: no customer-facing string may be hardcoded; it runs
`scripts/editable_audit.py --check` so the report a human reads and the gate a
push passes cannot drift apart.

**A Worker cannot fetch another Worker's `*.workers.dev` hostname.** It returns
404 from inside Cloudflare's network while the same URL returns 200 from
anywhere else. Use service bindings. `non-watch` reported both Workers down on
its first sweep because of this.

**TOML keys belong to the last table header above them.** `SHEET_ID` appended
to the end of `wrangler.toml` landed inside `[[d1_databases]]`; wrangler
accepted the file, deployed it, and bound nothing. Read the binding list, never
the exit code.

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
6. a section-group JSON with more blocks than the section's `max_blocks`
   (2026-08-03: adding a third closer card rejected the whole `footer-group.json`;
   `themeFilesUpsert` named it as "Block count exceeds maximum of 2")
7. an unrecognised key in the schema JSON — a `"_comment"` note added beside
   `max_blocks` was enough to make `split-feature.liquid` stop deploying

**A `range` setting in a template can be silently refused.** `index.json` was
rejected four times until `rotate_seconds` was removed from it — the schema
defined it, the section had already deployed, and it should have been valid.
Removing it made the template land instantly. The rotation still works on the
schema default. `preflight.py` cannot catch this one; you can only recognise it.

**Keep API writes small and read back after a timeout.** A 26-string
`translationsRegister` timed out; the connector errored and NOTHING was
written. Verified by reading the stored translations back, then retried as two
batches of 13. A timeout tells you nothing about whether the write landed.

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
| Lotto worker | `worker/lotto/` → `non-lotto.polished-snow-7889.workers.dev`. `/health?deep=1&codes=1` audits every prize code against Shopify — and today reports it cannot, because `SHOPIFY_ADMIN_TOKEN` is unset |
| Watch worker | `worker/watch/` → `non-watch.polished-snow-7889.workers.dev`. Six checks every 15 min, DMs aaron@ and josh@ via Slack. `/status` is open. **Alerts on transitions, not state; sends a daily digest so silence is evidence** |
| Somm log | D1 `non-somm-log`, table `somm_log`. One row per answered question, both transports. No IP, no identity — the privacy policy commits to that. Purged at 24 months by the somm worker's hourly cron |
| Sheet export | Hourly, append-only, watermarked in D1. Sheet `1MaKIe_a7kgNVPqYQrfktUYzW6p5pt8KNgGMzGK_FnZo`, gid `183822213`. `POST /somm/export` with `X-Export-Token` triggers it by hand |
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

**Measured, not assumed**
- Speed: the theme is **3% of page weight**. 79% is Shopify platform bundles,
  12% apps. Do NOT optimise the theme for speed — see task #8.
- Mobile: sub-44px tap targets went 41 → 1 on Shop. The one left is the
  keyboard-only skip link.
- Dead CSS: 57 fully overridden rules removed, 16KB. Verified by diffing
  **6,490 computed properties** before and after — zero differences.
- Instrumentation: every feature now reports `_started` / `_answered` /
  `_failed` to `dataLayer`. The gap between started and answered is where dead
  ends live. GTM is already consuming them.

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

**Closed:** duplicated verdict points, dynamic pairing questions, chip
unification, placeholder copy, picks panel, market catalogs, page header images
(built then reverted), speed audit, forensic mobile, silent-failure audit, dead
CSS, instrumentation, process animation, currency suffix, oyster scoring.

| # | Status | |
|---|---|---|
| 11 | in progress | **es: 241 strings registered.** All section prose done except About process data. Next: `p_b1..p_b6` x titles/bodies/captions — NEWLINE-ALIGNED lists, assert identical line counts or steps desync from captions. Then product copy, then the somm worker prompt. See `docs/translations/README.md`. **es stays UNPUBLISHED** until product copy and the somm land |
| 14 | DONE | Somm queries logged to D1 and exported hourly to the sheet. Retention enforced at 24 months by cron, not by a comment |
| 18 | Aaron | Uninstall Instant — 261KB, and it monkey-patches `window.fetch`. I cannot: the API denies `scriptTags` and `appInstallations` |
| 19 | Aaron | **No reviews exist anywhere** — no app, no metafields, no markup. Use press quotes and venue logos on PDPs instead, or install a review app |

| 20 | Aaron | **Publish the theme.** Everything above is on the Draft. Anonymous visitors still get theme `197808783520` |
| 21 | Aaron | **Privacy policy.** The live one is stock Shopify boilerplate — no Somm, no Anthropic — and publishing the theme starts sending customer free text to a US processor undisclosed. Draft ready in `docs/privacy-policy-draft.md`: check the ACN against ASIC, then a lawyer |
| 22 | Aaron | `/pages/visit-us` 404s and is linked from the homepage. Only broken link in 25 |
| 23 | Aaron | Paste `docs/pdp-benefits-draft.md` into `custom.benefits` on the six bottles. Needs the Shopify connector, which was invalidated all session |
| 24 | Aaron | Lotto: set `SHOPIFY_ADMIN_TOKEN`, flip `CODE_CHECK` to `live`, and decide the discount **combinations** so codes can stack |
| 25 | Aaron | Confirm one real scratch-to-email end to end. None has been seen to succeed |
| 26 | queued | Site speed check — run against the PUBLISHED theme. Preview injects the admin bar and distorts every number |
| 27 | queued | Thumbs up/down and pick click-through on Somm answers. The two fields that turn the log into something you can improve the model with; both need theme work |
| 28 | queued | Languages. No second language is published, so the picker correctly hides and Shopify's preview selector appears to do nothing. Theme ships `en` + `es` only. Section copy translates via Translate & Adapt — which today's editability work is what makes possible. **Test Thai and CJK: the mono face has no coverage** |
| 29 | queued | A real Nori liveness check. Socket Mode reports `presence: away` while running, so that signal is useless; needs a Fly API token |

Also outstanding: Microsoft Clarity install, week-on-week feature alerting, the
app-friendliness half of #12, and the press-quote translation decision. Plus a
stale secret named `e3381329f26ad6d0e5f245927be80f089e220c4b` on `non-somm`
holding a revoked Google key — nothing reads it; the delete needs an
interactive confirm.

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
