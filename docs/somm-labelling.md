# Labelling the Somm log

How a logged answer becomes a regression test.

The Worker writes every exchange to D1 and exports it hourly to
**NON Somm — query feedback**. That sheet tells you what customers asked. It
does not tell you whether the answers were any good, and nothing in the loop
closes until someone says so.

```
label the log  ->  build fixtures  ->  run against staging  ->  ship
```

---

## 1. Set the sheet up (once)

**Fix the id column first.** The log tab renders ids as dates — `0` shows as
`1899-12-31`, `1` as `1900-01-01` — because a date number-format is applied to
the column. The stored values are integers; only the display is wrong. Select
the column and set Format → Number → Number, 0 decimals. `id` is the only
stable join key you have, and a date is not a usable one.

**Add a `labels` tab.** Its own tab, not extra columns on the log tab. The log
tab is machine-owned: the cron appends to it with `A1:append` and
`insertDataOption=INSERT_ROWS`. Human edits and machine appends in one table is
how labelling work gets quietly destroyed on a schema change — and the log tab
already carries the ghost of an abandoned attempt at this, a review header
(`Date | Surface | Question | ... | Verdict | ...`) sitting above a completely
different set of log columns.

Header row, exactly these names:

```
id  accuracy  usefulness  better_answer  must_contain  code  note  labelled_by  labelled_at
```

Set Data → Data validation on `accuracy` and `usefulness` as dropdowns, with
the values in §2. Typing a value the code does not know is not a small problem:
the row is skipped, so a bad answer stops being counted and the accuracy rate
*improves*. `labels.mjs` rejects unknown values loudly for that reason, but a
dropdown stops it happening at all.

**To read the log beside your labels**, in a cell on the labels tab:

```
=QUERY({'Log'!A:R}, "select Col1, Col3, Col4, Col5 where Col1 is not null", 1)
```

Columns are `id`, `question`, `answer`, `route`. Adjust `'Log'` to the tab's
real name. Read through the query; write only in the labels tab.

---

## 2. The two axes

One verdict column is not enough, and this is the part worth arguing about.

The 2026-08-07 review found two failures a single good/bad column would have
merged, and they needed opposite fixes:

- 48 of 52 pricing questions answered *"the price and availability are on the
  bottle's own page"* — on a page printing the price two inches away. Every
  word **true**. Completely **useless**. Cause: a stale prompt rule
  contradicting a newer one.
- *"is it dry?"* came back as a confident pairing recommendation for cured meat
  and hard cheese. Not false — it answered a **different question**. Cause: a
  dead code path falling through to the pairing engine.

So: **accuracy** asks *is what it said true?* **Usefulness** asks *did it
answer what was asked?*

### accuracy

| value | means |
|---|---|
| `correct` | Every claim is true and supported by the bottle's sheet. |
| `wrong` | A claim is false — a wrong figure, a wrong ingredient, the wrong bottle. |
| `unsupported` | True-sounding but not in the sheet it was given. |
| `n/a` | It made no factual claim (a refusal, a fallback, a pure pairing). |

`unsupported` is deliberately not `correct`. The Somm is told to use **only**
the sheet, so a claim that happens to be true in the world is still a breach —
and it is the breach that precedes a fabricated figure. Grading it `correct`
because it is not false trains exactly what the prompt forbids.

### usefulness

| value | means |
|---|---|
| `answered` | Answered the question asked. |
| `partial` | Answered some of it and stopped. |
| `dodged` | Answered none of it and pointed elsewhere. |
| `wrong-question` | Answered a different question, often confidently. |

`dodged` is separated from `partial` because it reads as evasion — a conversion
problem, not a knowledge problem.

**Worked examples**

| question | answer | accuracy | usefulness |
|---|---|---|---|
| how much is one bottle | "The price and availability are on the bottle's own page." | `correct` | `dodged` |
| is it dry? | *(pairing recommendation for cured meat)* | `n/a` | `wrong-question` |
| how much sugar | "7.1g per 150ml serve, 2g of it added." | `correct` | `answered` |
| how much sugar | "Around 7g." | `wrong` | `partial` |
| is it vegan | "Yes, and it pairs beautifully with oysters." | `correct` | `answered` |

---

## 3. Writing a correction

`better_answer` is **the minimal answer you would have accepted** — not the
best answer you can think of. This matters more than it sounds.

The builder derives required figures from what you write. The first run of this
harness failed three fixtures and **not one was the Somm's fault**: asked *"how
much is one bottle"*, it answered *"$30, and it's in stock"* — right — and the
fixture failed it for omitting `$150.00`, a six-pack price the correction had
helpfully volunteered. The test was demanding the opposite of the house rule
that says answer the question asked and stop.

So corrections are now a **weak** signal (at least one figure must appear,
which still catches a fallback or a fabrication), and:

- **`must_contain`** — semicolon-separated figures this question *requires*.
  Authoritative when set. Use it when a specific number is the point.
- **`code`** — which bottle, e.g. `NON1`. **Required for anything asked on a
  product page.** The log cannot supply it: `product` is empty on all 524 rows
  and `picks` is empty on precisely the fallback rows most worth testing. A
  replay without a bottle sends no facts, so the Somm answers about the whole
  range and the fixture grades a different question. The builder skips those
  rather than emit an unfaithful test.

---

## 4. Sample, don't label everything

524 rows and growing hourly. Exhaustive labelling stops after a week.

- **100% of fallbacks.** Rare and the highest signal per row.
- **10 per route per week** — facts, pairing, brand, other.

Stratified beats exhaustive. A consistent small sample shows a trend; an
enthusiastic first week followed by nothing shows noise.

---

## 5. Build and run

Export both tabs as CSV (File → Download → CSV, one per tab), then:

```bash
node worker/somm/audit/fixtures.mjs build --labels labels.csv --log log.csv
```

It reports rejected rows, ids that arrived as dates, labels whose id is not in
the log, and a summary by axis and route. Then:

```bash
node worker/somm/audit/fixtures.mjs run
```

Defaults to **`non-somm-staging`**, which is the whole reason that Worker
exists. Exits non-zero on failure, so it can gate a deploy rather than merely
inform one. `--endpoint` points it at production, `--only 55,110` at specific
ids.

`fixtures.json` is generated, and should be **committed**. It is the regression
suite: the record of every failure someone bothered to correct.

---

## 6. What this deliberately does not test

Tone, length, and whether the occasion line appears. All three are real, all
three are in the prompt, and all three are judgement calls. A suite that fails
on judgement is a suite people learn to ignore.

Read those in the sheet. Test the facts in the harness.
