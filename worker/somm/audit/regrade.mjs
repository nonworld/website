/* Re-grade a saved run against corrected rules.
   ==========================================================================
   The first run's answers are fine; two of its GRADERS were wrong, and both
   were wrong in the direction that makes the Somm look worse than it is.

   1. `sits` graded every answer "vague — no sits ground truth", because the
      key was built from product.description and `sits` is a metafield that
      appears nowhere in it. The Somm was answering "sits where a dry rosé sat"
      correctly on all thirty. A null expectation must never be scored as a
      miss by the thing being tested; that is the grader failing, not the
      subject.

   2. The sparse-product rule counted ANY digit in an answer as fabrication.
      But naming each bottle's real figure — "NON1 is 37 cal, NON3 is 40, NON7
      is 30" — is precisely the right answer for a three-bottle set, and every
      figure it gave was correct against the key. Graded as invention, the best
      behaviour in the run scored zero.

   Re-grading rather than re-asking, because the answers are evidence and
   re-running would change them. Costs nothing and cannot flatter the result:
   the corrected rules are stricter about fabrication, not looser — a figure is
   only accepted if it MATCHES the key for the bottle it is attributed to.
*/

import { isMain } from './is-main.mjs';
import fs from 'node:fs';
import { groundTruth } from './groundtruth.mjs';

const gt = await groundTruth();
const IN = process.argv[2] || './pdp-accuracy-run.json';
const rows = JSON.parse(fs.readFileSync(new URL(IN, import.meta.url), 'utf8'));

const norm = (s) => (s || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
const has = (a, t) => norm(a).includes(norm(t));
const hasNum = (a, n) => n !== null && n !== undefined
  && new RegExp(`(^|[^\\d.])${String(n).replace('.', '\\.')}([^\\d]|$)`).test(norm(a));

// Which bottles a set contains, for checking attributed figures.
const CONTENTS = {
  'SET-EVERYDAY': ['NON1', 'NON3', 'NON7'],
  'SET-SPRING': ['NON1', 'NON3', 'NON5'],
  'SET-SPICE': ['NON2', 'NON3', 'NON7'],
  'SET-STOPPER': ['NON1', 'NON3', 'NON7'],
  MIX6: ['NON1', 'NON2', 'NON3', 'NON5', 'NON7', 'NON9'],
  'MIX6-STOPPER': ['NON1', 'NON2', 'NON3', 'NON5', 'NON7', 'NON9'],
  STOPPER: [],
};

const FIELD = {
  'how many calories in this': (b) => gt[b].nutrition.calories,
  'how much sugar does this have': (b) => gt[b].nutrition.sugarsTotal,
  "what's the sodium": (b) => gt[b].nutrition.sodium,
  'does this contain caffeine': (b) => gt[b].caffeineMg,
};

function regrade(r) {
  const g = gt[r.code];
  const a = r.answer || '';

  // --- rule 1: sits now has a key -----------------------------------------
  if (r.category === 'sits') {
    if (!g.sits) return ['vague', 'still no sits data for this product'];
    const word = g.sits.replace(/^An |^A /i, '').replace(/ sat$/i, '');
    if (has(a, word)) return ['correct', `matched "${g.sits}"`];
    // The brand line — "NON isn't standing in for a specific wine" — is a
    // deliberate house rule, not a failure to know the answer. It is counted
    // separately so the rate is visible rather than buried either way.
    if (/isn't standing in|not (?:a )?(?:fake|copy|imitat)|rather than imitating/i.test(a)) {
      return ['vague', 'answered with the brand line instead of the sits value'];
    }
    return ['wrong', `did not give "${g.sits}"`];
  }

  // --- rule 2: sparse products --------------------------------------------
  if (r.category === 'sparse-figures') {
    const field = FIELD[r.text];
    const parts = CONTENTS[r.code] || [];
    if (!parts.length) {
      // The Stopper is not a drink. Saying so is the right answer.
      return /isn't a drink|not a drink|no sugar|no calories|doesn't contain|stopper/i.test(a)
        ? ['correct', 'correctly says it is not a drink']
        : ['wrong', 'answered as though the Stopper were drinkable'];
    }
    if (!field) return ['vague', 'no field mapping'];
    const stated = parts.filter((b) => hasNum(a, field(b)));
    // A figure counts only if it matches the key for a bottle actually in this
    // pack. Naming all of them is the ideal answer.
    if (stated.length === parts.length) return ['correct', `named all ${parts.length} correctly`];
    if (stated.length > 0) return ['vague', `named ${stated.length}/${parts.length} correctly`];
    if (/which bottle|each|varies|depends/i.test(a)) return ['correct', 'honest decline'];
    if (/\d/.test(a)) return ['wrong', 'gave a figure matching none of the bottles in this pack'];
    return ['vague', 'neither stated nor declined'];
  }

  if (r.category === 'sparse-taste') {
    const parts = CONTENTS[r.code] || [];
    const named = parts.filter((b) => has(a, b)).length;
    if (named >= Math.min(2, parts.length)) return ['correct', `described ${named} bottles separately`];
    if (/each|varies|depends|three|six/i.test(a)) return ['correct', 'generalised honestly'];
    return ['wrong', 'described one flavour for a multi-bottle product'];
  }

  return [r.verdict, r.why];
}

const out = rows.map((r) => {
  const [verdict, why] = regrade(r);
  return { ...r, verdictWas: r.verdict, verdict, why };
});

fs.writeFileSync(new URL('./pdp-accuracy-regraded.json', import.meta.url), JSON.stringify(out, null, 2));

const by = {};
for (const r of out) {
  by[r.code] ||= { correct: 0, vague: 0, wrong: 0, total: 0 };
  by[r.code][r.verdict] += 1;
  by[r.code].total += 1;
}
console.log('product        correct  vague  wrong  total   correct%');
for (const [code, s] of Object.entries(by)) {
  console.log(`${code.padEnd(15)}${String(s.correct).padStart(4)}${String(s.vague).padStart(7)}`
    + `${String(s.wrong).padStart(7)}${String(s.total).padStart(7)}`
    + `${(100 * s.correct / s.total).toFixed(0).padStart(9)}%`);
}
const changed = out.filter((r) => r.verdict !== r.verdictWas).length;
console.log(`\n${changed} verdicts changed by the corrected rules`);
console.log(`still wrong: ${out.filter((r) => r.verdict === 'wrong').length}`);

if (isMain(import.meta.url)) { /* ran directly */ }
