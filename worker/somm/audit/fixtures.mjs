/* Labelled log rows -> regression fixtures, and replaying them.
   ==========================================================================
   THE POINT. A verdict column tells you a rate. A CORRECTION tells you a
   target, and a target can be re-run. This turns the labelling in the sheet
   into the only artefact that stops a fixed bug coming back: a test that fails
   if it does.

   WHY IT ASSERTS PROPERTIES AND NOT THE SENTENCE.

   The obvious build — expect the answer to equal `better_answer` — cannot
   work. The Somm generates prose, so two correct answers to "is it dry?"
   differ in every word while agreeing on every fact. A string comparison would
   fail on all of them and the suite would be abandoned inside a week.

   So a fixture asserts the CHECKABLE part:

     - the FIGURES in the correction must appear. This is not a proxy for
       correctness, it is the actual house rule — FACTS_SYSTEM says "use ONLY
       the numbers in the sheet, never estimate". A missing or altered figure
       is the failure that rule exists to prevent, and regrade.mjs already
       grades the same way.

     - the DEFLECTION must not come back, on any row labelled `dodged`. That is
       what regressed on 2026-08-04: 48 of 52 pricing questions answered "the
       price and availability are on the bottle's own page" while the sheet
       carried the price. A phrase check catches it in one run.

     - it must not be a FALLBACK. Any fixture returning the canned "has not
       come through cleanly" line is a dead path, whatever else it says. That
       is how the 2026-08-06 `surface` ReferenceError went unnoticed for a day
       — 14 of 17 facts questions failing while /health stayed green.

   WHAT IT DELIBERATELY DOES NOT ASSERT. Tone, length, and whether the occasion
   line appears. Those are real and they are in the prompt, but they are
   judgement calls, and a suite that fails on judgement is a suite people learn
   to ignore. Read those in the sheet; test the facts here.

   Usage:
     node audit/fixtures.mjs build --labels labels.csv --log log.csv
     node audit/fixtures.mjs run [--endpoint <url>] [--only <id,id>]

   `run` defaults to the STAGING Worker, because the reason staging exists is
   to be the thing a prompt change is tried against before it ships.
*/

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';
import { readLabels, readLog, join, summarise } from './labels.mjs';
import { groundTruth } from './groundtruth.mjs';

const STAGING = 'https://non-somm-staging.polished-snow-7889.workers.dev/somm';
/* fileURLToPath, not `.pathname`. This repo lives under "Claude Code" and a
   URL percent-encodes that space, so `.pathname` prints a path that does not
   exist and cannot be pasted into a shell. Same encoding trap is-main.mjs
   exists for; it caught this file too, on its first run. */
const OUT = fileURLToPath(new URL('./fixtures.json', import.meta.url));

/* The deflections. Lower-cased substrings, matched loosely, because the model
   rephrases them: "the price is on the bottle's own page" and "price and
   availability are on the bottle's own page" are the same failure. */
const DEFLECTIONS = [
  "on the bottle's own page",
  'on its own page',
  'its own page covers',
  'availability are on',
  "you'll find the rest",
  "you'll find more about",
];

const FALLBACK = 'has not come through cleanly';

/* Figures worth asserting.

   Bare integers under 10 are skipped: they are almost always "5 servings" or a
   bottle number picked out of "NON5", not a claim under test, and asserting
   them produces failures that teach nobody anything. A decimal or a figure
   with a unit or currency is a real quantity. */
function figures(text) {
  const out = new Set();
  const re = /\$\s?\d[\d,]*(?:\.\d+)?|\d+\.\d+\s*(?:g|mg|kj|kcal|%)?|\d{2,}\s*(?:g|mg|kj|kcal|%|ml)?/gi;
  (text.match(re) || []).forEach((m) => {
    const t = m.trim().replace(/\s+/g, '');
    if (/^\d$/.test(t)) return;
    out.add(t);
  });
  return [...out];
}

/* Loose containment: "7.1g" must match "7.1 g" and "$150.00" must match
   "$150". Punctuation and spacing are the model's business, not the fixture's. */
function contains(answer, figure) {
  const norm = (s) => s.toLowerCase().replace(/[\s,]/g, '');
  const a = norm(answer);
  const f = norm(figure);
  if (a.includes(f)) return true;
  // $150.00 in the correction, "$150" in the answer.
  const trimmed = f.replace(/\.00$/, '');
  return trimmed !== f && a.includes(trimmed);
}

export function buildFixtures(rows) {
  const fixtures = [];
  const skipped = [];

  rows.forEach((r) => {
    const { label } = r;
    const isFailure = label.accuracy === 'wrong'
      || label.accuracy === 'unsupported'
      || (label.usefulness && label.usefulness !== 'answered');

    // A row labelled correct+answered is a pass, not a fixture. Keeping those
    // as tests would lock in today's phrasing and fail on any improvement.
    if (!isFailure) { skipped.push({ id: r.id, why: 'labelled as passing' }); return; }

    /* Explicit beats derived. A derived list is a hint about what a good answer
       mentions; an explicit one is a claim about what this question REQUIRES,
       and only a human can tell those apart. */
    const explicit = label.mustContain.length ? label.mustContain : null;
    const derived = label.better ? figures(label.better) : [];
    const mustNotContain = label.usefulness === 'dodged' ? DEFLECTIONS : [];

    // Nothing checkable. Real, and common on tone-only complaints — say so
    // rather than emitting a fixture that can only ever pass.
    if (!explicit && !derived.length && !mustNotContain.length) {
      skipped.push({ id: r.id, why: 'no figures in the correction and not a dodge — nothing machine-checkable' });
      return;
    }

    /* The bottle, or no fixture at all. A product-context question replayed
       without one sends no facts, so the Somm answers about the whole range
       and the fixture grades an answer to a different question. Skipping is
       the honest outcome; a green suite built on unfaithful replays is worse
       than a smaller one. */
    const code = label.code || (r.picks || '').split(/[,\s]+/)[0] || '';
    const productish = /product/.test(r.context || '');
    if (productish && !code) {
      skipped.push({
        id: r.id,
        why: 'product-context question with no recoverable bottle — add a `code` in the labels tab',
      });
      return;
    }

    fixtures.push({
      id: r.id,
      query: r.question,
      context: productish ? 'product' : (r.context || 'home'),
      code,
      locale: r.locale || 'en',
      expect: {
        mustContain: explicit || [],
        // Weak by design: catches a fallback or a wholly fabricated answer
        // without demanding the model volunteer everything the labeller did.
        anyOf: explicit ? [] : derived,
        mustNotContain,
        noFallback: true,
      },
      because: {
        accuracy: label.accuracy,
        usefulness: label.usefulness,
        wasAnswered: r.answer.slice(0, 160),
        shouldBe: label.better.slice(0, 300),
        labelledBy: label.by,
      },
    });
  });

  return { fixtures, skipped };
}

/* ------------------------------------------------------------------- run */

async function ask(endpoint, f, gt) {
  const facts = f.code && gt[f.code] ? gt[f.code] : undefined;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: f.query,
      context: f.context,
      code: f.code,
      page: facts?.handle ? `/products/${facts.handle}` : '/',
      locale: f.locale,
      facts,
      history: [],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function grade(f, body) {
  const answer = body.answer || body.explanation || '';
  const fails = [];
  if (f.expect.noFallback && answer.toLowerCase().includes(FALLBACK)) fails.push('returned the fallback');
  (f.expect.mustContain || []).forEach((n) => {
    if (!contains(answer, n)) fails.push(`missing required figure ${n}`);
  });
  const anyOf = f.expect.anyOf || [];
  if (anyOf.length && !anyOf.some((n) => contains(answer, n))) {
    fails.push(`none of the correction's figures appeared (${anyOf.join(', ')})`);
  }
  f.expect.mustNotContain.forEach((p) => {
    if (answer.toLowerCase().includes(p)) fails.push(`deflected: "${p}"`);
  });
  return { pass: fails.length === 0, fails, answer };
}

export async function runFixtures(fixtures, endpoint) {
  const gt = await groundTruth();
  const results = [];
  for (const f of fixtures) {
    try {
      const body = await ask(endpoint, f, gt);
      results.push({ f, ...grade(f, body) });
    } catch (e) {
      results.push({ f, pass: false, fails: [`request failed: ${e.message}`], answer: '' });
    }
    // The Worker rate-limits at 20/min. A 429 would read as a regression.
    await new Promise((r) => setTimeout(r, 3200));
  }
  return results;
}

/* ------------------------------------------------------------------ main */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

if (isMain(import.meta.url)) {
  const cmd = process.argv[2];

  if (cmd === 'build') {
    const labelsPath = arg('labels');
    const logPath = arg('log');
    if (!labelsPath || !logPath) {
      console.error('usage: fixtures.mjs build --labels <csv> --log <csv>');
      process.exit(2);
    }

    const { labels, problems, dateFormatted } = readLabels(fs.readFileSync(labelsPath, 'utf8'));
    const log = readLog(fs.readFileSync(logPath, 'utf8'));
    const { rows, orphans } = join(labels, log);

    if (problems.length) {
      console.error('REJECTED ROWS — fix these in the sheet, they are not counted:');
      problems.forEach((p) => console.error('  ' + p));
    }
    if (dateFormatted) {
      console.error(`\n${dateFormatted} id(s) arrived as dates. The log tab's id column has a date`);
      console.error('number-format applied; the values are integers. Format it as plain number.');
    }
    if (orphans.length) {
      console.error(`\n${orphans.length} labelled id(s) not present in the log export: ${orphans.slice(0, 8).join(', ')}`);
      console.error('The two exports are probably from different times. Re-export both.');
    }

    console.log('\n' + JSON.stringify(summarise(rows), null, 1));

    const { fixtures, skipped } = buildFixtures(rows);
    fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 1));
    console.log(`\n${fixtures.length} fixtures -> ${OUT}`);
    if (skipped.length) {
      const tone = skipped.filter((s) => s.why.startsWith('no figures')).length;
      console.log(`${skipped.length} labelled rows produced none (${tone} had nothing machine-checkable).`);
    }
    process.exit(problems.length ? 1 : 0);
  }

  if (cmd === 'run') {
    const endpoint = arg('endpoint', STAGING);
    let fixtures = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const only = arg('only');
    if (only) {
      const want = new Set(only.split(',').map((s) => Number(s.trim())));
      fixtures = fixtures.filter((f) => want.has(f.id));
    }
    if (!fixtures.length) { console.error('no fixtures — run `build` first'); process.exit(2); }

    console.log(`${fixtures.length} fixtures against ${endpoint}\n`);
    const results = await runFixtures(fixtures, endpoint);

    results.forEach((r) => {
      const mark = r.pass ? 'PASS' : 'FAIL';
      console.log(`${mark}  #${r.f.id}  ${r.f.query.slice(0, 56)}`);
      if (!r.pass) {
        r.fails.forEach((x) => console.log(`        ${x}`));
        console.log(`        got: ${r.answer.slice(0, 130)}`);
      }
    });

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} pass`);
    // Non-zero so this can gate a deploy rather than merely inform one.
    process.exit(failed.length ? 1 : 0);
  }

  console.error('usage: fixtures.mjs build --labels <csv> --log <csv>');
  console.error('       fixtures.mjs run [--endpoint <url>] [--only <id,id>]');
  process.exit(2);
}
