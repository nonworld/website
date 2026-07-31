/**
 * NON Somm — deterministic pairing engine
 *
 * Two jobs: define the data shape for products and dishes, and score every
 * product against a parsed dish.
 *
 * No AI runs in this file. It is plain, testable, auditable logic. The LLM's
 * only jobs (in index.js) are turning free text into a DishProfile, and
 * turning the top-ranked result into a sentence.
 *
 * Attributes are 0-5 throughout. Keep the scale consistent across every
 * product and dish or scores stop being comparable.
 *
 * ── Provenance ────────────────────────────────────────────────────────────
 * Profiles are derived from the live store: each bottle's custom.profile,
 * custom.ingredients and custom.nutritional_panel metafields, plus the
 * positioning copy on non.world. Where the original draft of this file
 * disagreed with the store, the store won:
 *
 *   - The range is six bottles, not three. NON5, NON7 and NON9 are missing
 *     from the draft and they cover the cases the other three handle worst
 *     (chilli, braise, and red meat respectively).
 *   - NON3 was profiled as body 5 / "sits where red sat". It is neither. Per
 *     NON, it sits where an *aromatic white* sat — still, bright, tart,
 *     yuzu and orange pith over cinnamon grip. The design copy called it a
 *     "chilled light red" throughout and that was wrong at source. Left at
 *     body 5 it also won charred-beef queries that belong to NON9, which is
 *     the actual big-red bottle (Shiraz skin tannin, french oak contact).
 *
 * If Somm gets a pairing wrong, fix it here first, not in a prompt.
 */

const PRODUCTS = [
  {
    id: 'NON1',
    name: 'Salted Raspberry & Chamomile',
    handle: 'salted-raspberry-chamomile',
    acid: 4,
    tannin: 1, // chamomile only — soft
    sweetness: 2,
    salt: 3, // 122mg sodium
    body: 1,
    dominantFlavours: ['raspberry', 'chamomile', 'floral', 'red fruit', 'salt'],
    bestWith: {
      proteins: ['shellfish', 'raw fish', 'white fish', 'oyster', 'goat cheese'],
      fatLevel: [0, 2],
      cookingStyle: ['raw', 'cured', 'lightly cooked', 'steamed'],
      dishAcid: [2, 5],
    },
    positioning: 'Sits where a dry rosé sat',
  },
  {
    id: 'NON2',
    name: 'Caramelised Pear & Kombu',
    handle: 'caramelised-pear-kombu',
    acid: 2,
    tannin: 2, // black tea
    sweetness: 3,
    salt: 4, // kombu glutamate + olive brine
    body: 4,
    dominantFlavours: ['pear', 'kombu', 'umami', 'caramel', 'butter'],
    bestWith: {
      proteins: ['white fish', 'poultry', 'mushroom', 'vegetable', 'hard cheese'],
      fatLevel: [2, 4],
      cookingStyle: ['roasted', 'steamed', 'poached', 'braised'],
      dishAcid: [0, 3],
    },
    positioning: 'Sits where a rich white sat',
  },
  {
    id: 'NON3',
    name: 'Toasted Cinnamon & Yuzu',
    handle: 'toasted-cinnamon-yuzu',
    acid: 3,
    tannin: 3, // cinnamon and orange pith — grip without being a red
    sweetness: 2,
    salt: 2,
    body: 2,
    dominantFlavours: ['cinnamon', 'yuzu', 'orange', 'bitter pith', 'spice'],
    bestWith: {
      proteins: ['white fish', 'poultry', 'mushroom', 'vegetable', 'cured meat', 'hard cheese'],
      fatLevel: [1, 4],
      cookingStyle: ['charred', 'grilled', 'roasted', 'cured', 'steamed'],
      dishAcid: [1, 5],
    },
    positioning: 'Sits where an aromatic white sat',
  },
  {
    id: 'NON5',
    name: 'Lemon Marmalade & Hibiscus',
    handle: 'lemon-marmalade-hibiscus',
    acid: 5, // hardest acid in the range
    tannin: 2, // dry-hopped
    sweetness: 1, // 3.6g — lowest sugar
    salt: 5, // 140mg — highest
    body: 1,
    dominantFlavours: ['citrus', 'hibiscus', 'menthol', 'hops', 'lemon myrtle'],
    bestWith: {
      proteins: ['white fish', 'vegetable', 'grain', 'shellfish', 'lamb'],
      fatLevel: [0, 5], // cuts fat at the top, refreshing at the bottom
      cookingStyle: ['raw', 'fried', 'braised', 'steamed', 'lightly cooked'],
      dishAcid: [0, 5],
    },
    positioning: 'Sits where a dry sparkling sat',
    // The only bottle that actively cools chilli — see heatBonus below.
    coolsHeat: true,
  },
  {
    id: 'NON7',
    name: 'Stewed Cherry & Coffee',
    handle: 'stewed-cherry-coffee',
    acid: 3,
    tannin: 4, // coffee
    sweetness: 3,
    salt: 3,
    body: 4,
    dominantFlavours: ['stewed cherry', 'coffee', 'bitter', 'whole spice', 'dark fruit'],
    bestWith: {
      proteins: ['red meat', 'beef', 'lamb', 'mushroom', 'hard cheese', 'chocolate'],
      fatLevel: [3, 5],
      cookingStyle: ['charred', 'grilled', 'roasted', 'braised', 'smoked'],
      dishAcid: [0, 3],
    },
    positioning: 'Sits where a big red sat',
  },
  {
    id: 'NON9',
    name: 'Oaked Blackberry & Plum',
    handle: 'non9-oaked-blackberry-plum',
    acid: 3,
    tannin: 5, // Shiraz grape skin + french oak — the most structural in the range
    sweetness: 2,
    salt: 3, // tamari
    body: 5,
    dominantFlavours: ['blackberry', 'plum', 'forest floor', 'oak', 'beetroot', 'ancho'],
    bestWith: {
      proteins: ['red meat', 'beef', 'lamb', 'game', 'mushroom', 'hard cheese'],
      fatLevel: [3, 5],
      cookingStyle: ['charred', 'grilled', 'roasted', 'braised', 'smoked'],
      dishAcid: [0, 3],
    },
    positioning: 'Sits where a big red sat',
  },
];

/**
 * @typedef {Object} DishProfile
 * @property {string[]} proteins      e.g. ["lamb"], ["oyster"], []
 * @property {number}   fatLevel      0-5
 * @property {string[]} cookingStyle  e.g. ["charred", "grilled"]
 * @property {number}   dishAcid      0-5, acidity/brightness of the dish
 * @property {number}   weight        0-5, how heavy/rich the dish is
 * @property {number}   heat          0-5, chilli heat
 * @property {string[]} flavourNotes  free-form extracted flavour words
 */

function overlaps(range, value) {
  return value >= range[0] && value <= range[1];
}

function arrayOverlapScore(a, b) {
  if (!a?.length || !b?.length) return 0;
  const setB = new Set(b.map((x) => x.toLowerCase()));
  const hits = a.filter((x) => setB.has(x.toLowerCase())).length;
  return hits / Math.max(a.length, 1);
}

/**
 * Scores one product against one dish. Returns 0-100 plus a breakdown, so the
 * explanation step references real reasons rather than invented ones.
 *
 * Weights: protein 30, fat 20, style 20, acid 15, body 15. Heat is a separate
 * bonus rather than part of the 100, because it is the one axis where 0.0% has
 * a genuine advantage over wine and it should be decisive when it applies.
 */
function scoreProduct(product, dish) {
  const reasons = [];
  let score = 0;

  // Protein match — strongest single signal
  const proteinScore = arrayOverlapScore(dish.proteins, product.bestWith.proteins);
  score += proteinScore * 30;
  if (proteinScore > 0) reasons.push(`matches protein (${dish.proteins.join(', ')})`);

  // Fat level fit
  if (overlaps(product.bestWith.fatLevel, dish.fatLevel)) {
    score += 20;
    reasons.push('fat level in range');
  }

  // Cooking style match
  const styleScore = arrayOverlapScore(dish.cookingStyle, product.bestWith.cookingStyle);
  score += styleScore * 20;
  if (styleScore > 0) reasons.push(`cooking style matches (${dish.cookingStyle.join(', ')})`);

  // Acid balance
  if (overlaps(product.bestWith.dishAcid, dish.dishAcid)) {
    score += 15;
    reasons.push('acid balance appropriate');
  }

  // Weight/body match — closer is better
  const bodyDelta = Math.abs(product.body - dish.weight);
  const bodyScore = Math.max(0, 1 - bodyDelta / 5);
  score += bodyScore * 15;
  if (bodyScore > 0.6) reasons.push('body weight matches dish weight');

  // Heat. Alcohol dissolves capsaicin and amplifies burn; salt and acid cool
  // it. Without this axis a hot dish scores on protein alone and the engine
  // recommends a big tannic bottle, which is the worst possible answer.
  const heat = dish.heat ?? 0;
  if (heat >= 3) {
    if (product.coolsHeat) {
      score += 18;
      reasons.push('salt and acid cool chilli heat');
    } else if (product.tannin >= 4) {
      score -= 12;
      reasons.push('tannin would sharpen the heat');
    }
  }

  return {
    productId: product.id,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

/**
 * Ranks all products against a dish, best first. The API layer surfaces only
 * the top result plus an optional runner-up — the point is confidence, not a
 * menu.
 */
function rankProducts(dish, catalogue = PRODUCTS) {
  return catalogue
    .map((p) => ({ product: p, ...scoreProduct(p, dish) }))
    .sort((a, b) => b.score - a.score);
}

export { PRODUCTS, scoreProduct, rankProducts };
