/**
 * The nine shop occasions, expressed as dishes.
 *
 * The Shop filter and NON Somm were two brains. Somm ranked from the axes in
 * scoring-engine.js; the Shop filter ranked from a custom.food_tags metafield
 * typed by hand. They agreed only because the same person wrote both, and
 * nothing kept them in sync — retune an axis and the shelf would not move.
 *
 * This makes the engine authoritative. Each occasion is a canonical DishProfile
 * — the most representative plate for that chip — and its score is whatever
 * the engine's OWN scoreProduct() says about that plate. There is no second
 * scoring implementation to drift: the occasion scores are a projection of the
 * engine, not a parallel opinion about it.
 *
 * What this deliberately does NOT derive is the prose. scoreProduct returns
 * mechanical reasons ("matches protein (oyster)") which are fine as a signal
 * and poor as copy. The hand-written custom.food_why stays; the engine is only
 * used to say which pairs still need a sentence.
 */

import { PRODUCTS, scoreProduct } from './scoring-engine.js';

/**
 * Each occasion is the plate a customer means when they tap that chip.
 * Chosen to be representative rather than extreme — "seafood" is a plate of
 * steamed white fish, not a lobster thermidor, because the chip has to answer
 * for the whole category.
 */
const OCCASIONS = [
  {
    key: 'raw',
    label: 'Raw or cured',
    dish: {
      proteins: ['oyster', 'raw fish', 'cured meat'],
      fatLevel: 1,
      cookingStyle: ['raw', 'cured'],
      dishAcid: 4,
      weight: 1,
      heat: 0,
      flavourNotes: ['brine', 'citrus'],
    },
  },
  {
    key: 'seafood',
    label: 'Seafood',
    dish: {
      proteins: ['white fish', 'shellfish'],
      fatLevel: 2,
      cookingStyle: ['steamed', 'poached', 'lightly cooked'],
      dishAcid: 3,
      weight: 2,
      heat: 0,
      flavourNotes: ['lemon', 'sea'],
    },
  },
  {
    key: 'veg',
    label: 'Vegetables',
    dish: {
      proteins: ['vegetable', 'grain', 'mushroom'],
      fatLevel: 2,
      cookingStyle: ['roasted', 'steamed', 'grilled'],
      dishAcid: 3,
      weight: 2,
      heat: 0,
      flavourNotes: ['miso', 'herb', 'root'],
    },
  },
  {
    key: 'charred',
    label: 'Charred or roasted',
    dish: {
      proteins: ['red meat', 'lamb', 'mushroom'],
      fatLevel: 4,
      cookingStyle: ['charred', 'grilled', 'roasted'],
      dishAcid: 2,
      weight: 4,
      heat: 0,
      flavourNotes: ['smoke', 'char'],
    },
  },
  {
    key: 'braise',
    label: 'Braised',
    dish: {
      proteins: ['red meat', 'lamb', 'poultry'],
      fatLevel: 4,
      cookingStyle: ['braised', 'smoked'],
      dishAcid: 2,
      weight: 5,
      heat: 0,
      flavourNotes: ['stew', 'stock'],
    },
  },
  {
    key: 'spice',
    label: 'Spice and heat',
    dish: {
      proteins: ['poultry', 'vegetable', 'shellfish'],
      fatLevel: 3,
      cookingStyle: ['fried', 'grilled'],
      dishAcid: 3,
      weight: 3,
      // The whole point of the chip. heat >= 3 is what triggers the engine's
      // coolsHeat bonus and its tannin penalty.
      heat: 4,
      flavourNotes: ['chilli', 'ginger'],
    },
  },
  {
    key: 'cheese',
    label: 'Cheese',
    dish: {
      proteins: ['hard cheese', 'goat cheese'],
      // A cheese board is not cooked and not especially heavy on the palate.
      // Style is empty rather than ['raw','cured']: a cheese chip should not
      // quietly reward the bottles that happen to list raw preparations.
      fatLevel: 4,
      cookingStyle: [],
      dishAcid: 2,
      weight: 3,
      heat: 0,
      flavourNotes: ['rind', 'cream'],
    },
  },
  {
    key: 'sweet',
    label: 'Dessert',
    dish: {
      proteins: ['chocolate'],
      fatLevel: 4,
      cookingStyle: ['roasted', 'raw'],
      dishAcid: 1,
      weight: 3,
      heat: 0,
      flavourNotes: ['stone fruit', 'chocolate', 'caramel'],
    },
  },
  {
    key: 'aperitif',
    label: 'No food, just a glass',
    dish: {
      // No plate at all — proteins and cooking style are empty on purpose, so
      // the score falls to acid, body and the bottle's own balance, which is
      // what decides whether something drinks well alone.
      //
      // fatLevel and weight sit MID rather than at zero. The engine has no way
      // to say "this axis does not apply", and fatLevel 0 was outside the
      // stated range of three bottles, so a chip meaning "no food" was
      // excluding them for the fat content of food that is not there. It
      // greyed four of six bottles; a shelf that dark is not a filter.
      proteins: [],
      fatLevel: 2,
      cookingStyle: [],
      dishAcid: 3,
      weight: 2,
      heat: 0,
      flavourNotes: [],
    },
  },
];

/**
 * The engine returns 0-100. The shelf wants 0-3, because a chip is a coarse
 * "would I pour this" and pretending to two significant figures would be
 * false precision.
 *
 * Thresholds are deliberately generous at the bottom: 0 means "actively the
 * wrong bottle", not merely "not the best one". A shelf that greys out seven
 * of nine bottles for every question is not a filter, it is a dead end.
 */
function band(score) {
  if (score >= 62) return 3;
  if (score >= 45) return 2;
  if (score >= 30) return 1;
  return 0;
}

/**
 * Derives the full food_tags map for one product straight from the engine.
 * @returns {{tags: Object<string,number>, detail: Object<string,{score:number,reasons:string[]}>}}
 */
function deriveFoodTags(product) {
  const tags = {};
  const detail = {};
  for (const occ of OCCASIONS) {
    const r = scoreProduct(product, occ.dish);
    tags[occ.key] = band(r.score);
    detail[occ.key] = { score: r.score, reasons: r.reasons };
  }
  return { tags, detail };
}

/** Every product in the engine, derived. */
function deriveAll(catalogue = PRODUCTS) {
  return catalogue.map((p) => ({
    id: p.id,
    handle: p.handle,
    ...deriveFoodTags(p),
  }));
}

export { OCCASIONS, band, deriveFoodTags, deriveAll };
