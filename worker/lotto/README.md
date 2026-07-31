# NON Lotto — reveal API

Cloudflare Worker. One endpoint: `POST /lotto/reveal`.

Email is required **before** a code is issued. The frontend also gates the
scratch interaction, but that's a courtesy — the check here is the one that
counts, because a client-side gate is a suggestion, not a control.

```
{ "sessionId": "…", "email": "you@example.com" }
  →
{ "code": "LOTTO15", "description": "15% off your first case",
  "terms": "Use it at checkout.", "alreadyRevealed": false, "emailed": true }
```

## Status

**Deployed:** `https://non-lotto.polished-snow-7889.workers.dev`
KV namespace `66c6668cea084a2ea4e1c5cbb8be57eb` is created and bound. The theme
setting already points here.

**Not yet live.** Two secrets are missing, so every reveal returns `503 closed`
by design — see the config gate below. Check what's outstanding at any time:

```bash
curl -s https://non-lotto.polished-snow-7889.workers.dev/health
```

Right now that returns:

```json
{"ok":false,"prizes":6,"missing":["SHOPIFY_ADMIN_TOKEN","KLAVIYO_API_KEY"]}
```

## Finishing it

Two commands. The value is pasted at the prompt, not typed on the command line
— it stays out of your shell history that way.

```bash
cd worker/lotto && npx wrangler secret put SHOPIFY_ADMIN_TOKEN
```

```bash
cd worker/lotto && npx wrangler secret put KLAVIYO_API_KEY
```

No redeploy is needed; secrets take effect immediately. Re-run the `/health`
curl and confirm `"ok":true` with an empty `missing`.

`SHOPIFY_ADMIN_TOKEN` needs `read_discounts` **only** — it never writes.

### The config gate

A deploy without secrets is a broken deploy, not a degraded one. Rather than
skipping the Shopify check and the email and handing over a code anyway — a 200
that hides two failures — the Worker refuses to draw and returns `503 closed`,
which the theme already renders honestly. `/health` names the missing piece.

## Design decisions worth knowing

**One reveal per email, not per session.** Session tracking is defeated by a
private window. The ledger is keyed on the lowercased email. A repeat caller
gets the *same* code back with `alreadyRevealed: true`, and it's re-sent — the
likeliest reason someone asks twice is that they lost the first one.

**Codes come from a fixed pool, never minted.** All six exist in Shopify. Before
returning one, the Worker asks Shopify whether it's still `ACTIVE`; a code
that's been deactivated or burned its own usage limit is skipped and another is
drawn. Handing out a code that fails at checkout turns a prize into a support
ticket.

**Weighted random, no caps.** Two customers can win the same prize. This keeps
the published odds true forever — capping would make real odds drift from the
printed table as codes ran out.

**Klaviyo does the sending.** The Worker fires a `Scratched NON Lotto` event
carrying the code, then subscribes the profile to list `WQLa3T` with
`lotto_entrant: true`. A Klaviyo **Flow** triggered on that metric sends the
email — Klaviyo's API can't send directly. The event is idempotent per email,
so a repeat reveal re-sends rather than firing a duplicate.

**Failures never block the reveal.** If Klaviyo fails, the customer still gets
the code on screen and `emailed: false` comes back so the UI can say "copy it
down". The failure is logged, not swallowed. If *Shopify* fails, the Worker
returns `503 closed` rather than an unverified code — the theme already has an
honest closed state for that.

## The pool

Edit `LOTTO_POOL` in `wrangler.toml`. Weights are normalised, so they don't
have to sum to 100.

| Prize | Code | Weight |
|---|---|---:|
| 15% off your first case | `LOTTO15` | 28 |
| A free NON stopper | `FREESTOPPER` | 24 |
| Complimentary shipping | `FREEPOUR` | 20 |
| A bottle of NON, on us | `ONEONUS` | 14 |
| 10% off | `LOTTO10` | 10 |
| 25% off plus free shipping | `THEHOUSE` | 4 |

## Tests

```bash
npm test
```

Offline: pool parsing, and 200,000 draws checked against the published odds
(every prize lands within 0.15pp). Also checks the draw still works with a code
removed, which is the dead-code path, and the email regex against six cases.

### Against the deployed Worker

Set `U` to your Worker URL first.

```bash
U=https://non-lotto.<subdomain>.workers.dev
```

**Malformed email is rejected**

```bash
curl -s -X POST $U/lotto/reveal -H 'Content-Type: application/json' -d '{"email":"nope"}'
```

**A fresh email gets a code**

```bash
curl -s -X POST $U/lotto/reveal -H 'Content-Type: application/json' -d '{"email":"test1@example.com","sessionId":"a"}'
```

**The same email gets the same code back, re-sent**

```bash
curl -s -X POST $U/lotto/reveal -H 'Content-Type: application/json' -d '{"email":"test1@example.com","sessionId":"b"}'
```

Expect an identical `code` and `alreadyRevealed: true`, even from a different
session id — that's the anti-farming behaviour.

**Rate limiting kicks in**

```bash
for i in $(seq 1 8); do
  curl -s -o /dev/null -w "%{http_code} " -X POST $U/lotto/reveal \
    -H 'Content-Type: application/json' -d "{\"email\":\"rl$i@example.com\"}"
done; echo
```

Expect `200` up to `RATE_LIMIT_PER_HOUR`, then `429`.

**A deactivated code is skipped.** Deactivate one in Shopify admin, then draw
repeatedly with fresh emails and confirm it never comes back:

```bash
for i in $(seq 1 25); do
  curl -s -X POST $U/lotto/reveal -H 'Content-Type: application/json' \
    -d "{\"email\":\"skip$i@example.com\"}" | grep -o '"code":"[^"]*"'
done | sort | uniq -c
```

**The email arrives, and lands in Klaviyo.** Use a real address, then check the
Flow fired and the profile is on list `WQLa3T` with `lotto_entrant: true`.

## What still needs a human

The Klaviyo **Flow** does not exist. The connector exposes read, update and
delete for flows but not create, so it can't be built from here. The pieces are
ready:

- Metric: **Scratched NON Lotto** (fires as soon as the Worker runs)
- Template: **NON Lotto — your code** (`SuKZzb`), already styled and using
  `{{ event.prize_title }}`, `{{ event.discount_code }}`, `{{ event.prize_terms }}`
- List: **NON Lotto — scratch card entries** (`WQLa3T`)

In Klaviyo: Flows → Create → trigger on the metric → add an Email action → pick
the existing template → set live. Trigger on the **metric**, not list
membership: only the metric carries the code.
