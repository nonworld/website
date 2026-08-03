/**
 * Scoring checks — deterministic half of the pipeline only.
 *
 * Runs without an API key and without network. It feeds hand-written
 * DishProfiles (what step 1 should produce) straight into the engine, so a
 * failure here is a scoring bug rather than an extraction bug.
 *
 *   node test/pipeline.test.js
 */
import { rankProducts, PRODUCTS, scoreProduct } from '../src/scoring-engine.js';
import { languageDirective } from '../src/index.js';

// Ground truth is NON's core range deck, which names one headline pairing per
// bottle. These five are not opinions — if one fails, the profiles are wrong.
//
//   NON1 antipasti   NON3 seafood   NON5 spice   NON7 chocolate   NON9 steak
//
// The rest are pairings NON confirmed directly: duck to NON7, steak to NON9,
// roast meats and cheese to NON2, and salmon which must not be rejected by
// NON9 even though NON3 wins it outright.
const CASES = [
  { name: 'antipasti [deck]', expect: 'NON1',
    dish: { proteins: ['cured meat', 'hard cheese'], fatLevel: 3, cookingStyle: ['cured'], dishAcid: 2, weight: 3, heat: 0, flavourNotes: ['salt', 'olive'] } },

  { name: 'seafood [deck]', expect: 'NON3',
    dish: { proteins: ['white fish', 'shellfish'], fatLevel: 1, cookingStyle: ['grilled'], dishAcid: 3, weight: 2, heat: 0, flavourNotes: ['citrus'] } },

  { name: 'spice [deck]', expect: 'NON5',
    dish: { proteins: ['vegetable'], fatLevel: 2, cookingStyle: ['braised'], dishAcid: 2, weight: 3, heat: 5, flavourNotes: ['chilli'] } },

  { name: 'chocolate [deck]', expect: 'NON7',
    dish: { proteins: ['chocolate'], fatLevel: 4, cookingStyle: [], dishAcid: 0, weight: 4, heat: 0, flavourNotes: ['cacao', 'bitter'] } },

  { name: 'steak [deck]', expect: 'NON9',
    dish: { proteins: ['beef', 'red meat'], fatLevel: 5, cookingStyle: ['charred', 'grilled'], dishAcid: 1, weight: 5, heat: 0, flavourNotes: ['char', 'iron'] } },

  { name: 'roast duck', expect: 'NON7',
    dish: { proteins: ['poultry', 'game'], fatLevel: 4, cookingStyle: ['roasted'], dishAcid: 1, weight: 4, heat: 0, flavourNotes: ['rich'] } },

  { name: 'poached salmon', expect: 'NON3',
    dish: { proteins: ['white fish'], fatLevel: 2, cookingStyle: ['poached'], dishAcid: 2, weight: 2, heat: 0, flavourNotes: ['delicate'] } },

  // NON3, not NON1: Aaron's call 2026-08-03, and it matches the catalogue,
  // where NON3 lists fresh seafood as a pairing and NON1 lists none.
  { name: 'a dozen oysters', expect: 'NON3',
    dish: { proteins: ['oyster', 'shellfish'], fatLevel: 0, cookingStyle: ['raw'], dishAcid: 4, weight: 1, heat: 0, flavourNotes: ['brine'] } },
];

let failed = 0;

console.log(`${PRODUCTS.length} products in the catalogue\n`);

for (const c of CASES) {
  const ranked = rankProducts(c.dish);
  const top = ranked[0];
  const ok = top.productId === c.expect;
  if (!ok) failed++;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  console.log(`      winner ${top.productId} (${top.score})${ok ? '' : ` — expected ${c.expect}`}`);
  console.log(`      why: ${top.reasons.join('; ') || 'no positive signals'}`);
  console.log(`      field: ${ranked.slice(0, 4).map((r) => `${r.productId} ${r.score}`).join('  ')}\n`);
}

// The engine is useless if every query returns the same bottle.
const winners = new Set(CASES.map((c) => rankProducts(c.dish)[0].productId));
console.log(`distinct winners across ${CASES.length} cases: ${winners.size}`);
if (winners.size < 4) {
  console.log('FAIL  not enough spread — weights or profiles need work');
  failed++;
}

console.log(failed ? `\n${failed} failing so far` : '\nranking: all passing');

/* ---------------------------------------------------------------------------
   Product-page variant. Offline half only: fit buckets from real scores, and
   the suggestions route, which makes no model call at all.
   --------------------------------------------------------------------------- */


function fitBucket(score) {
  if (score >= 65) return 'strong';
  if (score >= 35) return 'workable';
  return 'weak';
}

const FIT_CASES = [
  {
    name: 'NON9 + chargrilled lamb',
    code: 'NON9',
    dish: { proteins: ['lamb', 'red meat'], fatLevel: 5, cookingStyle: ['charred', 'grilled'], dishAcid: 1, weight: 5, heat: 0, flavourNotes: ['char'] },
    expect: 'strong',
  },
  {
    // This assertion used to read `expect: 'strong'`, on the reasoning that
    // pinot is the classic salmon red. Aaron has overruled that twice — "NON9
    // with salmon no good, it's like a pinot" — and it stands: NON9 is the
    // oaked blackberry and plum, firm tannin from Shiraz skin and french oak,
    // and it runs straight over a poached fillet.
    //
    // It is kept as a test rather than deleted, because this is the assumption
    // that already crept back in once. 'white fish' and 'raw fish' were still
    // sitting in NON9.bestWith.proteins long after the copy was corrected, and
    // it was this test that justified them. Salmon belongs to NON3, which the
    // 'poached salmon -> NON3' case above asserts.
    name: 'NON9 + poached salmon (deliberately not a strong match)',
    code: 'NON9',
    dish: { proteins: ['white fish'], fatLevel: 2, cookingStyle: ['poached'], dishAcid: 2, weight: 2, heat: 0, flavourNotes: ['delicate'] },
    expect: 'workable',
  },
  {
    // A genuinely weak pairing, so the honest-no path is still covered.
    name: 'NON5 + chargrilled rib eye',
    code: 'NON5',
    dish: { proteins: ['beef', 'red meat'], fatLevel: 5, cookingStyle: ['charred', 'grilled'], dishAcid: 1, weight: 5, heat: 0, flavourNotes: ['char'] },
    expect: 'weak',
  },
  {
    name: 'NON1 + oysters',
    code: 'NON1',
    dish: { proteins: ['oyster', 'shellfish'], fatLevel: 0, cookingStyle: ['raw'], dishAcid: 4, weight: 1, heat: 0, flavourNotes: ['brine'] },
    expect: 'strong',
  },
];

console.log('\n--- product page: fit verdicts ---\n');

for (const c of FIT_CASES) {
  const product = PRODUCTS.find((p) => p.id === c.code);
  const scored = scoreProduct(product, c.dish);
  const fit = fitBucket(scored.score);
  const ok = fit === c.expect;
  if (!ok) failed++;

  let instead = '';
  if (fit === 'weak') {
    const best = rankProducts(c.dish).find((r) => r.productId !== c.code);
    instead = best ? `  -> instead ${best.productId} (${best.score})` : '  -> NO ALTERNATIVE';
    if (!best) failed++;
  }

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  console.log(`      ${fit} (${scored.score})${ok ? '' : ` — expected ${c.expect}`}${instead}\n`);
}

/* suggestions — same logic as the Worker route, no model call */
function suggestionsFor(code) {
  const p = PRODUCTS.find((x) => x.id === String(code || '').toUpperCase());
  if (!p) return null;
  const styles = p.bestWith.cookingStyle.filter((s) => s !== 'lightly cooked');
  const proteins = p.bestWith.proteins;
  const out = [];
  for (let i = 0; i < 3 && i < proteins.length; i++) {
    const style = styles[i % styles.length];
    out.push(style ? `${style} ${proteins[i]}` : proteins[i]);
  }
  return { productId: p.id, suggestions: out };
}

console.log('--- product page: passive suggestions ---\n');

for (const p of PRODUCTS) {
  const s = suggestionsFor(p.id);
  const ok = s && s.suggestions.length === 3 && s.suggestions.every((x) => x && x.length > 3);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${p.id}: ${s.suggestions.join(', ')}`);
}

if (suggestionsFor('NOPE') !== null) {
  console.log('FAIL  unknown product should return null');
  failed++;
}

/* -------------------------------------------------------------- language

   The invariant worth guarding is not that Spanish works — it is that
   English is untouched. languageDirective must return the EMPTY STRING for
   every English path, because the four prose prompts are built by
   concatenation: the moment it returns anything for 'en', every English
   answer on the live site is served a different system prompt.            */

console.log('\n--- language directive ---');

const LANG_CASES = [
  [undefined, '', 'no locale sent at all'],
  [null, '', 'null locale'],
  ['', '', 'empty string'],
  ['en', '', 'plain en'],
  ['EN', '', 'uppercase en'],
  ['en-AU', '', 'en-AU'],
  ['en-us', '', 'en-us'],
  ['de', '', 'a locale with no entry falls back to English'],
  ['zz-ZZ', '', 'nonsense locale'],
];

for (const [input, expected, label] of LANG_CASES) {
  const got = languageDirective(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: returns ${got === '' ? 'empty' : JSON.stringify(got.slice(0, 30))}`);
}

for (const [tag, label] of [['es', 'es'], ['es-ES', 'es-ES falls back to es'], ['ES', 'uppercase ES']]) {
  const got = languageDirective(tag);
  const ok = got.length > 0 && got.includes('SPANISH') && got.includes('alternativa al vino');
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: Spanish directive carries the glossary rule`);
}

// The rule that protects the brand argument in every language.
const esDirective = languageDirective('es');
const bansIt = esDirective.includes('Never write "vino sin alcohol"');
if (!bansIt) failed++;
console.log(`${bansIt ? 'PASS' : 'FAIL'}  es directive forbids "vino sin alcohol"`);

console.log(failed ? `\n${failed} failing overall` : '\nall passing');
process.exit(failed ? 1 : 0);
