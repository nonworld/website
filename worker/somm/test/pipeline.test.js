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
import { languageDirective, fallbackCopy, catalogueFor } from '../src/index.js';

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

/* The fallback lines, which are written in code and so are NOT covered by the
   ANSWER IN SPANISH directive. The mega-test caught a Spanish pairing question
   failing extraction and being answered with the English fallback. */
const FALLBACK_CASES = [
  ['es', 'pairing', true, 'es pairing fallback is Spanish'],
  ['es', 'neutral', true, 'es neutral fallback is Spanish'],
  ['es-ES', 'pairing', true, 'es-ES falls back to es'],
  ['en', 'pairing', false, 'en has no override, uses the English line'],
  ['zz', 'pairing', false, 'unknown locale uses the English line'],
  [undefined, 'neutral', false, 'no locale uses the English line'],
];
for (const [tag, kind, wantSpanish, label] of FALLBACK_CASES) {
  const got = fallbackCopy(tag, kind);
  const ok = wantSpanish ? typeof got === 'string' && got.length > 0 : got === null;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

// The Mixed 6 is a product name and must survive translation.
const esPair = fallbackCopy('es', 'pairing') || '';
const keepsName = esPair.includes('Mixed 6');
if (!keepsName) failed++;
console.log(`${keepsName ? 'PASS' : 'FAIL'}  es pairing fallback keeps the Mixed 6 name untranslated`);

// And the neutral line must not recommend anything at all.
const esNeutral = fallbackCopy('es', 'neutral') || '';
const noProduct = !/Mixed 6|NON[1235790]/.test(esNeutral);
if (!noProduct) failed++;
console.log(`${noProduct ? 'PASS' : 'FAIL'}  es neutral fallback recommends no product`);

/* ------------------------------------------------ store catalogue ------- */

/* The Somm answers in codes and the theme renders a card per code from the
   catalogue block on the page. A code the store does not publish renders as
   nothing, so recommending outside the store's catalogue is a customer being
   told what to drink and shown an empty panel.

   These cases pin the SOFTNESS as much as the narrowing. Every fallback below
   exists so that a broken page, an older theme or a product missing its
   `custom.non_code` degrades to the full range rather than to a Somm that
   recommends one bottle or none. */
const CATALOGUE_CASES = [
  ['no list at all (older theme, or the Worker deployed first)',
    undefined, PRODUCTS.length],
  ['null',
    null, PRODUCTS.length],
  ['empty list (catalogue block failed to parse)',
    [], PRODUCTS.length],
  ['a genuine three-bottle store',
    ['NON1', 'NON3', 'NON7'], 3],
  ['lower case and padded, as Liquid emits it',
    [' non1 ', 'non3', 'NON7'], 3],
  ['empty-string keys from products with no non_code are dropped',
    ['', 'NON1', 'NON3', '  '], 2],
  ['codes this Worker does not know are ignored',
    ['NON1', 'NON3', 'NONSTOPPER', 'GIFTCARD'], 2],
  ['ONE recognised bottle falls back to the range, never to a one-note somm',
    ['NON1'], PRODUCTS.length],
  ['no recognised bottles at all falls back to the range',
    ['STOPPER', 'GLASSES'], PRODUCTS.length],
  ['the whole range is the whole range',
    PRODUCTS.map((p) => p.id), PRODUCTS.length],
  ['non-strings do not throw',
    ['NON1', 3, null, undefined, {}, 'NON3'], 2],
];
for (const [label, input, wantLength] of CATALOGUE_CASES) {
  const got = catalogueFor(input);
  const ok = Array.isArray(got) && got.length === wantLength;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  catalogue: ${label}`
    + (ok ? '' : ` — wanted ${wantLength}, got ${got && got.length}`));
}

/* A subset must be a real subset of the range, in range order, and must never
   invent an entry — the objects are handed straight to the scoring engine. */
const three = catalogueFor(['NON7', 'NON1', 'NON3']);
const isSubset = three.every((p) => PRODUCTS.includes(p));
if (!isSubset) failed++;
console.log(`${isSubset ? 'PASS' : 'FAIL'}  catalogue: entries are the real product objects`);

const ordered = three.map((p) => p.id).join(',')
  === PRODUCTS.filter((p) => three.includes(p)).map((p) => p.id).join(',');
if (!ordered) failed++;
console.log(`${ordered ? 'PASS' : 'FAIL'}  catalogue: keeps range order, not request order`);

/* The point of the whole change: ranking cannot return a bottle the store
   does not sell. Ranked against a dish NON9 wins outright, on a store that
   does not carry NON9. */
const steak = { proteins: ['beef'], fatLevel: 4, cookingStyle: ['grilled'], dishAcid: 1, weight: 5, heat: 0, flavourNotes: ['char'] };
const withoutNon9 = catalogueFor(['NON1', 'NON3', 'NON5']);
const rankedNames = rankProducts(steak, withoutNon9).map((r) => r.productId);
const noPhantom = !rankedNames.includes('NON9') && rankedNames.length === 3;
if (!noPhantom) failed++;
console.log(`${noPhantom ? 'PASS' : 'FAIL'}  catalogue: ranking never returns an unstocked bottle`);

/* And the range as a whole still wins that dish, so the restriction above is
   demonstrably doing the work rather than the dish being ambiguous. */
const non9WinsUnrestricted = rankProducts(steak)[0].productId === 'NON9';
if (!non9WinsUnrestricted) failed++;
console.log(`${non9WinsUnrestricted ? 'PASS' : 'FAIL'}  catalogue: NON9 would have won unrestricted (control)`);

console.log(failed ? `\n${failed} failing overall` : '\nall passing');
process.exit(failed ? 1 : 0);
