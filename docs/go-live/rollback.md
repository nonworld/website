# Release backup and rollback — RC 2026-08-06

Accepted commit `50ed56e`. Theme `website/staging`, id `198370820256`, unpublished.
Somm Worker `non-somm`, active version `45bb19a3`.

## 1. Theme backup — NOT DONE, BLOCKED

No backup theme exists. See the blocker at the end of this file. Everything
below that depends on a backup existing is therefore rehearsed on paper only
and must be re-run once the duplicate is made.

## 2. Git release tag — DONE

| | |
|---|---|
| Tag | `rc-2026-08-06` (annotated) |
| Commit | `50ed56e320e8079819f7e267c20284206fae70a6` |
| Annotation | NON website release candidate before final merchant and commerce checks |
| Remote | pushed, dereferences to the same commit |
| Branch | `staging` checked out, 0 unpushed commits |
| `origin/main` | `50e06da164b4b4542f50113bffcca4f32eadd36c`, untouched, not merged |
| Working tree | clean |

The tag was force-updated. An earlier tag of the same name from this session
pointed at `bf0616b5`, which predates the accepted commit. Recorded because a
moved tag is invisible to anyone who fetched the old one.

## 3. Worker rollback point

| | |
|---|---|
| Worker | `non-somm` (no named environments; one production Worker) |
| Active version | `45bb19a3-a740-462f-b824-a96c0cb5077b`, deployed 2026-08-05T23:45:30Z |
| Previous deployable | `9c8716a5-d4a7-44d7-97e1-1c63ac5d41c4`, deployed 2026-08-04T05:25:20Z |
| Cloudflare context | account authenticated through the local wrangler session; run from `worker/somm/` so `wrangler.toml` supplies name and bindings |
| D1 binding | `SOMM_LOG` -> database `non-somm-log` |
| Cron | hourly, `0 * * * *` |

Rollback:

    cd worker/somm
    npx wrangler rollback 9c8716a5-d4a7-44d7-97e1-1c63ac5d41c4

Confirm the active version:

    cd worker/somm
    npx wrangler deployments list

The topmost entry is the active deployment; check its version id reads
`9c8716a5` after rollback and `45bb19a3` after restore.

Restore forward:

    cd worker/somm
    npx wrangler rollback 45bb19a3-a740-462f-b824-a96c0cb5077b

### D1 compatibility after rollback: COMPATIBLE

One commit separates the two versions, `1460ac4`, which makes the Worker read
the `surface` field the theme was already sending. Its diff touches no
`CREATE TABLE`, no `ALTER TABLE`, and does not change the column list of the
single `INSERT INTO somm_log`. The one match on a schema keyword is a comment
stating it is deliberately not a migration.

So rows written by `45bb19a3` are readable by `9c8716a5` and vice versa. There
is no migration to reverse and no data written in a shape the older version
cannot parse.

### Secrets and vars: IDENTICAL

Three secrets on the Worker: `ANTHROPIC_API_KEY`, `EXPORT_TOKEN`,
`GOOGLE_SA_KEY`. Wrangler secrets are stored per Worker, not per version, so
they do not change with a rollback.

`[vars]` are per version, but `wrangler.toml` has no commit between the two
versions, so `EXTRACT_MODEL`, `EXPLAIN_MODEL`, `RATE_LIMIT_PER_MINUTE`,
`SHEET_ID`, `SHEET_GID` and `RETENTION_MONTHS` are identical in both.

Production remains on `45bb19a3`. Nothing was rolled back.

## 4. Theme rollback rehearsal — BLOCKED, not rehearsed

Cannot be performed: it requires the backup theme from step 1, which does not
exist. None of the following has been verified, and none should be recorded as
passed until the duplicate exists and it is re-run:

- the backup opens in preview
- the source staging theme is unchanged
- the backup renders the homepage
- the backup renders a representative bottle PDP
- the backup remains unpublished
- no live theme is altered

### Production rollback sequence — DOCUMENTED, STEP 2 NOT EXECUTED

1. Identify the last known-good theme. Online Store > Themes. The known-good
   theme is the one that was published immediately before the release, NOT the
   RC backup, which is a copy of the candidate and would republish the fault.
   Record its theme id before touching anything.
2. Publish that theme. NOT EXECUTED and not to be executed as a rehearsal:
   publishing is a live customer-facing change and is outside approved scope.
3. Confirm the homepage. Load `/`, expect the hero and the Somm entry point,
   and check the browser console is clean.
4. Confirm a PDP. Load a representative bottle, expect gallery, variants,
   price and Add to cart.
5. Confirm the cart. Add one item, expect the drawer to open with the correct
   line, quantity and total.
6. Confirm checkout. Reach the checkout's first step and confirm the total
   matches the cart. Do not complete payment.
7. Confirm NON Somm state. Open the sheet, send one prompt, expect a
   recommendation. If the Worker is implicated, apply the step 3 rollback
   above. The theme kill switch `somm_enabled` turns the whole feature off
   without a theme rollback.
8. Notify the release owner with the theme id published, the time, the trigger,
   and which of steps 3 to 7 passed.

## 5. Worker rollback rehearsal — PARTIAL, by design

| Check | Result |
|---|---|
| Previous version available | YES, `9c8716a5` listed as a deployable version |
| Previous version selectable | YES, appears in `wrangler deployments list` |
| Current version restorable | YES, `45bb19a3` remains listed and addressable |
| Worker endpoint known | YES, `non-somm`, consumed by the theme through `settings.somm_endpoint` |
| D1 binding intact | YES, `SOMM_LOG` -> `non-somm-log` |

No rollback was executed. Only the production Worker exists, with no staging
environment, and the instruction is not to change production merely to prove
the command. So availability and reversibility are confirmed from the
deployment list; the commands themselves are recorded above and remain
unexercised.

## BLOCKER — theme duplication

Step 1 could not be completed.

What was attempted: the Shopify MCP connector first, which returns
"the user's connection to this connector was invalidated". Then the
authenticated Chrome session, which does reach the store `non-world` and can
read it. The themes route renders an interstitial ("Go to Online Store:
Themes") rather than the theme list, and the admin builds its interface inside
roughly 950 shadow roots, so reaching the theme's overflow menu, choosing
Duplicate, and renaming the copy is a multi-step UI automation rather than one
API call.

This is a tooling blocker, not a permissions one. Nothing was refused and no
approval was requested by Shopify.

Exact action required to unblock, whichever is easier:

- Reconnect the Shopify connector in claude.ai connector settings, after which
  the duplicate is a single API call; or
- Duplicate it by hand: Online Store > Themes > the `website/staging` theme's
  "..." menu > Duplicate, then rename the copy to
  `RC backup - 2026-08-06 - 50ed56e`.

Either way, record and add to this file: source theme id (`198370820256`),
backup theme id, backup name, creation time, source commit (`50ed56e`), and
confirmation the backup is unpublished. Then re-run section 4.
