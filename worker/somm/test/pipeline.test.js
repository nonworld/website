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

const CASES = [
  {
    name: 'a dozen oysters',
    dish: { proteins: ['oyster', 'shellfish'], fatLevel: 0, cookingStyle: ['raw'], dishAcid: 4, weight: 1, heat: 0, flavourNotes: ['brine', 'lemon'] },
    expect: 'NON1',
  },
  {
    name: 'chargrilled steak',
    dish: { proteins: ['beef', 'red meat'], fatLevel: 5, cookingStyle: ['charred', 'grilled'], dishAcid: 1, weight: 5, heat: 0, flavourNotes: ['char', 'iron'] },
    expect: 'NON9',
  },
  {
    name: 'sichuan mapo tofu',
    dish: { proteins: ['vegetable'], fatLevel: 3, cookingStyle: ['braised'], dishAcid: 1, weight: 3, heat: 5, flavourNotes: ['chilli', 'numbing'] },
    expect: 'NON5',
  },
  {
    name: 'mushroom risotto',
    dish: { proteins: ['mushroom'], fatLevel: 3, cookingStyle: ['braised'], dishAcid: 1, weight: 4, heat: 0, flavourNotes: ['umami', 'parmesan'] },
    expect: 'NON2',
  },
  {
    name: 'dark chocolate dessert',
    dish: { proteins: ['chocolate'], fatLevel: 4, cookingStyle: [], dishAcid: 0, weight: 4, heat: 0, flavourNotes: ['cacao', 'bitter'] },
    expect: 'NON7',
  },
  {
    name: 'miso glazed vegetables',
    dish: { proteins: ['vegetable'], fatLevel: 2, cookingStyle: ['charred', 'roasted'], dishAcid: 2, weight: 3, heat: 0, flavourNotes: ['miso', 'caramelised'] },
    expect: 'NON3',
  },
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
    name: 'NON9 + delicate raw white fish',
    code: 'NON9',
    dish: { proteins: ['raw fish', 'white fish'], fatLevel: 0, cookingStyle: ['raw'], dishAcid: 4, weight: 1, heat: 0, flavourNotes: ['citrus'] },
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

console.log(failed ? `\n${failed} failing overall` : '\nall passing');
process.exit(failed ? 1 : 0);
