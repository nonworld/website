/* Does the sits answer survive rephrasing?
   The original bug was not a wrong answer, it was two answers: ask one way and
   the model denied any wine connection, ask another and it gave the metafield.
   So one phrasing proves nothing. Four per bottle, all six bottles. */
import { groundTruth, BOTTLES } from './groundtruth.mjs';
import { isMain } from './is-main.mjs';

const EP = 'https://non-somm.polished-snow-7889.workers.dev/somm';
const PHRASINGS = [
  'what wine does this replace',
  'what would I drink this instead of',
  'if I normally drink wine what is this closest to',
  'is this basically a substitute for wine',
];
const DENIAL = /doesn't replace|does not replace|isn't standing in|not standing in|replaces nothing|no fake|not a version of any wine|doesn't stand in/i;

const gt = await groundTruth();
let pass = 0; let fail = 0;
for (const code of Object.keys(BOTTLES)) {
  const g = gt[code];
  const want = g.sits.replace(/^An |^A /i, '').replace(/ sat$/i, '').toLowerCase();
  for (const q of PHRASINGS) {
    const r = await fetch(EP, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, context: 'product', code, page: `/products/${g.handle}`,
        locale: 'en', facts: { title: g.title, sits: g.sits, profile: g.profile, price: '$30.00', available: true } }),
    });
    const d = await r.json().catch(() => ({}));
    const a = (d.answer || '').toLowerCase();
    const gave = a.includes(want);
    // A bare denial with no sits value is the original contradiction.
    const bareDenial = DENIAL.test(a) && !gave;
    const ok = gave && !bareDenial;
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${code}  "${q}"`);
    if (!ok) console.log(`        want "${want}" | got: ${a.slice(0, 150).replace(/\s+/g, ' ')}`);
  }
}
console.log(`\n${pass} pass, ${fail} fail across ${Object.keys(BOTTLES).length} bottles x ${PHRASINGS.length} phrasings`);
if (isMain(import.meta.url) && fail) process.exitCode = 1;
