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
 *   - NON9 was profiled as a big red: body 5, tannin 5, red meat only. Per NON
 *     it sits where a pinot noir sat, and that changes the answers. A pinot is
 *     the classic salmon red; the old profile had NON9 "crushing delicate
 *     poached salmon", which is precisely backwards. Body and tannin come down,
 *     acid goes up, and the protein list widens to pinot's actual range rather
 *     than red meat alone.
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
    heatFit: 'cools', // acid and fruit cool chilli where alcohol stokes it
    core: true, // core range deck
    name: 'Salted Raspberry & Chamomile',
    handle: 'salted-raspberry-chamomile',
    acid: 4,
    tannin: 1, // chamomile only — soft
    sweetness: 2,
    salt: 3, // 122mg sodium
    body: 1,
    dominantFlavours: ['raspberry', 'chamomile', 'floral', 'red fruit', 'salt'],
    bestWith: {
      // Antipasti is NON1's plate per the core range deck: the raw and cured
      // end. Seafood — raw included — belongs to NON3.
      //
      // Oysters used to live here, on the argument that raw brine wants salt
      // against it. Aaron overruled it 2026-08-03: NON3 lists "fresh seafood"
      // as its food pairing in the catalogue and NON1 lists none at all, so the
      // engine was contradicting the product data. NON1 keeps cured meat and
      // cheese, and still scores on raw plates through cookingStyle.
      proteins: ['cured meat', 'goat cheese', 'hard cheese'],
      fatLevel: [0, 3],
      cookingStyle: ['raw', 'cured', 'lightly cooked'],
      dishAcid: [2, 5],
    },
    // Verified against the store's own custom.nutritional_panel and
    // custom.ingredients metafields. Per 150ml serve.
    facts: {
      style: 'sparkling',
      serve: '6°C, wine glass',
      calories: 37,
      sugarG: 7.1,
      addedSugarG: 2.0,
      sodiumMg: 122,
      carbsG: 8.3,
      abv: '0.0%',
      glutenG: 0.0,
      vegan: true,       // stated on every product page in the store
      glutenFree: true,  // gluten measured at 0.0g on every panel
      volume: '750ml',
      ingredients: 'Water, verjus, raspberries, sugar, chamomile, salt.',
      caffeine: 'none',
      storage: 'Cool, dry place. Sparkling stopper preserves the carbonation. Refrigerate after opening, drink within 5-7 days.',
    },
    positioning: 'Sits where a dry rosé sat',
  },
  {
    // Not in the core range deck (NON1/3/5/7/9). Still an active product, so it
    // stays scoreable, but it should not out-rank a core bottle on that
    // bottle's own headline pairing.
    id: 'NON2',
    heatFit: 'clashes', // NON scores it 0 for heat; nothing in it meets chilli
    core: false, // not in the core range deck
    name: 'Caramelised Pear & Kombu',
    handle: 'caramelised-pear-kombu',
    acid: 2,
    tannin: 2, // black tea
    sweetness: 3,
    salt: 4, // kombu glutamate + olive brine
    body: 4,
    dominantFlavours: ['pear', 'kombu', 'umami', 'caramel', 'butter'],
    bestWith: {
      // Roast meats and cheese, per NON. Beef stays with NON9 and duck with
      // NON7 — NON2 takes the roasting tray and the cheese board around them.
      proteins: ['red meat', 'lamb', 'poultry', 'mushroom', 'hard cheese'],
      fatLevel: [2, 5],
      cookingStyle: ['roasted', 'braised', 'grilled', 'steamed', 'poached'],
      dishAcid: [0, 3],
    },
    // Verified against the store's own custom.nutritional_panel and
    // custom.ingredients metafields. Per 150ml serve.
    facts: {
      style: 'sparkling',
      serve: 'Chilled, wine glass',
      calories: 27,
      sugarG: 5.1,
      addedSugarG: 0.0,
      sodiumMg: 53,
      carbsG: 6.0,
      abv: '0.0%',
      glutenG: 0.0,
      vegan: true,       // stated on every product page in the store
      glutenFree: true,  // gluten measured at 0.0g on every panel
      volume: '750ml',
      ingredients: 'Water, pears, verjus, black tea, kelp (kombu), olive brine, vanilla, agave, clove, cardamom, ginger root, star anise, peppercorn.',
      caffeine: '51.8mg per bottle, from the black tea',
      storage: 'Cool, dry place. Sparkling stopper preserves the carbonation. Refrigerate after opening, drink within 5-7 days.',
    },
    positioning: 'Sits where a rich white sat',
  },
  {
    id: 'NON3',
    heatFit: 'neutral', // no cooling claim, but nothing that fights heat either
    core: true, // core range deck
    name: 'Toasted Cinnamon & Yuzu',
    handle: 'toasted-cinnamon-yuzu',
    acid: 3,
    tannin: 3, // cinnamon and orange pith — grip without being a red
    sweetness: 2,
    salt: 2,
    body: 2,
    dominantFlavours: ['cinnamon', 'yuzu', 'orange', 'bitter pith', 'spice'],
    bestWith: {
      // Seafood is NON3's headline pairing per the core range deck — yuzu is
      // the squeeze of citrus, already in the glass. ALL seafood sits here now,
      // raw included: oysters and raw fish moved across 2026-08-03 so the
      // engine agrees with the catalogue, where NON3 lists "fresh seafood" and
      // NON1 lists none.
      proteins: ['white fish', 'shellfish', 'oyster', 'raw fish', 'poultry', 'mushroom', 'vegetable', 'hard cheese'],
      fatLevel: [0, 4],
      // 'raw' added with the seafood. Taking oysters without taking raw left
      // NON3 holding the protein but losing the cooking style, so it came
      // third on its own headline pairing.
      cookingStyle: ['raw', 'grilled', 'steamed', 'poached', 'roasted', 'charred'],
      dishAcid: [1, 5],
    },
    // Verified against the store's own custom.nutritional_panel and
    // custom.ingredients metafields. Per 150ml serve.
    facts: {
      style: 'still',
      serve: 'Chilled, wine glass',
      calories: 40,
      sugarG: 8.4,
      addedSugarG: 1.2,
      sodiumMg: 72,
      carbsG: 9.9,
      abv: '0.0%',
      glutenG: 0.0,
      vegan: true,       // stated on every product page in the store
      glutenFree: true,  // gluten measured at 0.0g on every panel
      volume: '750ml',
      ingredients: 'Water, verjus, oranges, yuzu, sugar, salt, cinnamon.',
      caffeine: 'none',
      storage: 'Cool, dry place. Refrigerate after opening, drink within 5-7 days.',
    },
    positioning: 'Sits where an aromatic white sat',
  },
  {
    id: 'NON5',
    heatFit: 'cools', // 140mg salt and the hardest verjus acid in the range
    core: true, // core range deck
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
      fatLevel: [0, 4], // cuts fat, but does not carry the heaviest plates
      cookingStyle: ['raw', 'fried', 'braised', 'steamed', 'lightly cooked'],
      dishAcid: [0, 5],
    },
    // Verified against the store's own custom.nutritional_panel and
    // custom.ingredients metafields. Per 150ml serve.
    facts: {
      style: 'sparkling',
      serve: 'Very cold, wine glass',
      calories: 18,
      sugarG: 3.6,
      addedSugarG: 1.5,
      sodiumMg: 140,
      carbsG: 4.4,
      abv: '0.0%',
      glutenG: 0.0,
      vegan: true,       // stated on every product page in the store
      glutenFree: true,  // gluten measured at 0.0g on every panel
      volume: '750ml',
      ingredients: 'Water, verjus, sugar, lemon verbena, lemongrass, hibiscus, lemon myrtle, liquorice root, peppermint, salt, hops.',
      caffeine: 'none',
      storage: 'Cool, dry place. Sparkling stopper preserves the carbonation. Refrigerate after opening, drink within 5-7 days.',
    },
    positioning: 'Sits where a dry sparkling sat',
    // The only bottle that actively cools chilli — see heatBonus below.
  },
  {
    id: 'NON7',
    heatFit: 'clashes', // coffee bitterness on top of tannin 4 sharpens capsaicin
    core: true, // core range deck
    name: 'Stewed Cherry & Coffee',
    handle: 'stewed-cherry-coffee',
    acid: 3,
    tannin: 4, // coffee
    sweetness: 3,
    salt: 3,
    body: 4,
    dominantFlavours: ['stewed cherry', 'coffee', 'bitter', 'whole spice', 'dark fruit'],
    bestWith: {
      // Duck is NON7's plate: stewed cherry against rich poultry is the
      // classic match, and the coffee bitterness handles the fat. Beef belongs
      // to NON9 — 'red meat' stays here so NON7 is not blind to it, but the
      // specific protein is what decides the winner.
      proteins: ['red meat', 'lamb', 'poultry', 'game', 'mushroom', 'hard cheese', 'chocolate'],
      fatLevel: [3, 5],
      cookingStyle: ['charred', 'grilled', 'roasted', 'braised', 'smoked'],
      dishAcid: [0, 3],
    },
    // Verified against the store's own custom.nutritional_panel and
    // custom.ingredients metafields. Per 150ml serve.
    facts: {
      style: 'sparkling',
      serve: 'Chilled, wine glass',
      calories: 30,
      sugarG: 6.2,
      addedSugarG: 0.0,
      sodiumMg: 71,
      carbsG: 9.5,
      abv: '0.0%',
      glutenG: 0.0,
      vegan: true,       // stated on every product page in the store
      glutenFree: true,  // gluten measured at 0.0g on every panel
      volume: '750ml',
      ingredients: 'Water, verjus, cherries, coffee arabica, salt, pink peppercorn, garam masala, allspice, nutmeg.',
      caffeine: '37mg per bottle, from the coffee',
      storage: 'Cool, dry place. Sparkling stopper preserves the carbonation. Refrigerate after opening, drink within 5-7 days.',
    },
    positioning: 'Sits where a big red sat',
  },
  {
    id: 'NON9',
    heatFit: 'neutral', // ancho warmth sits with spice rather than fighting it
    core: true, // core range deck
    name: 'Oaked Blackberry & Plum',
    handle: 'non9-oaked-blackberry-plum',
    acid: 4, // pinot-like lift, not a flat heavy red
    tannin: 4, // firm, per the core range deck — Shiraz skin plus french oak
    sweetness: 2,
    salt: 3, // tamari
    body: 4,
    dominantFlavours: ['blackberry', 'plum', 'forest floor', 'oak', 'beetroot', 'ancho'],
    bestWith: {
      // Pinot's range, which is wider than a big red's: salmon and duck at one
      // end, mushroom and beef at the other. Fat tolerance runs low-to-high
      // because the acid carries it, not the weight.
      proteins: [
        'red meat', 'beef', 'lamb', 'mushroom', 'hard cheese',
      ],
      fatLevel: [1, 5],
      cookingStyle: ['charred', 'grilled', 'roasted', 'braised', 'smoked'],
      dishAcid: [0, 4],
    },
    // Verified against the store's own custom.nutritional_panel and
    // custom.ingredients metafields. Per 150ml serve.
    facts: {
      style: 'still',
      serve: 'Chilled, wine glass',
      calories: 51,
      sugarG: 7.5,
      addedSugarG: 0.0,
      sodiumMg: 75,
      carbsG: 12.5,
      abv: '0.0%',
      glutenG: 0.0,
      vegan: true,       // stated on every product page in the store
      glutenFree: true,  // gluten measured at 0.0g on every panel
      volume: '750ml',
      ingredients: 'Water, verjus, Stanley plum, beetroot, Shiraz grape skin, blackberry, fir pine, sugar, tamari, ancho chilli, french oak.',
      caffeine: 'none',
      storage: 'Cool, dry place. Sparkling stopper preserves the carbonation. Refrigerate after opening, drink within 5-7 days.',
    },
    positioning: 'Sits where a pinot noir sat',
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

  // Weight/body match — closer is better, and a wide gap is actively wrong
  // rather than merely unrewarded. Without the penalty a light sparkling
  // scores ~38 against a charred rib eye, purely on wide fat and acid ranges,
  // which reads as "workable" when the honest answer is no.
  const bodyDelta = Math.abs(product.body - dish.weight);
  const bodyScore = Math.max(0, 1 - bodyDelta / 5);
  score += bodyScore * 15;
  if (bodyScore > 0.6) reasons.push('body weight matches dish weight');
  // A high-acid bottle carries across a wider weight range than its body
  // alone suggests — this is what lets a pinot do both salmon and beef. The
  // mismatch penalty is halved for them rather than waived, so it still bites
  // on a genuinely absurd pairing.
  if (bodyDelta >= 3) {
    score -= product.acid >= 4 ? 7 : 15;
    reasons.push(
      product.body < dish.weight
        ? 'too light for the weight of the dish'
        : 'too heavy for a delicate dish'
    );
  }

  // Heat. Alcohol dissolves capsaicin and amplifies burn; salt and acid cool
  // it. Without this axis a hot dish scores on protein alone and the engine
  // recommends a big tannic bottle, which is the worst possible answer.
  // heatFit is stated per bottle rather than inferred, because inference gave
  // a free pass: the old rule only REWARDED coolsHeat and only PENALISED
  // tannin >= 4, so a mid-tannin bottle with no cooling ability sailed through
  // a chilli dish having earned nothing and lost nothing. NON2 scored 67
  // against a plate NON itself rates it 0 for.
  //
  // 'neutral' is a real answer, not a default — it says "this is fine with
  // heat", which is why it also suppresses the blanket tannin penalty. NON9 is
  // the case that matters: tannin 4, but its ancho warmth sits with spice
  // rather than fighting it, and the old rule punished it for the tannin alone.
  const heat = dish.heat ?? 0;
  if (heat >= 3) {
    const fit = product.heatFit || 'neutral';
    if (fit === 'cools') {
      score += 18;
      reasons.push('salt and acid cool chilli heat');
    } else if (fit === 'neutral') {
      // Capped too, one band higher than a clash. 'Neutral' means no cooling
      // ability, and a bottle with no answer to chilli should not top the heat
      // chip on the strength of matching the poultry underneath it. It stays
      // available — workable, not the recommendation.
      score = Math.min(score, 55);
      reasons.push('no cooling ability — workable with heat, not the answer');
    } else if (fit === 'clashes') {
      // A cap, not a deduction. -18 was not enough: NON2 matched the protein,
      // the fat, the style, the acid and the body of a chilli plate and still
      // landed mid-table on the strength of all that, which is the same free
      // pass in a smaller size. If a bottle fights the chilli then how well it
      // suits the poultry underneath is not the question being asked.
      score = Math.min(score, 25);
      reasons.push('nothing here meets chilli — it sharpens rather than cools');
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
// Ties were previously broken by declaration order, which is arbitrary and
// produced real wrong answers: "roast duck" extracts as proteins ['poultry'],
// which NON2 and NON7 both claim, and NON2 won purely for being earlier in the
// array. Two deliberate tiebreaks instead:
//
//   1. body closest to the weight of the dish
//   2. a core-range bottle over a non-core one
//
// The second is the one that settles duck. NON2 is a fine answer, but it is not
// in the core range, and it should never displace a core bottle on equal merit.
function rankProducts(dish, catalogue = PRODUCTS) {
  return catalogue
    .map((p) => ({ product: p, ...scoreProduct(p, dish) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const aBody = Math.abs(a.product.body - dish.weight);
      const bBody = Math.abs(b.product.body - dish.weight);
      if (aBody !== bBody) return aBody - bBody;

      return (b.product.core ? 1 : 0) - (a.product.core ? 1 : 0);
    });
}

// A flat, printable facts sheet. This is what the factual branch of the API
// grounds on — the model is handed these numbers and told to use nothing else,
// which is why it can answer "which is lowest in sugar" without guessing.
function factsSheet(catalogue = PRODUCTS) {
  return catalogue
    .filter((p) => p.facts)
    .map(function (p) {
      var f = p.facts;
      return [
        `${p.id} ${p.name} — ${f.style}, ${f.abv} ABV, ${f.volume}`,
        `  per 150ml serve: ${f.calories} cal, ${f.sugarG}g sugar (${f.addedSugarG}g added), ${f.sodiumMg}mg sodium, ${f.carbsG}g carbs, ${f.glutenG}g gluten`,
        `  ${f.vegan ? 'vegan' : 'not vegan'}, ${f.glutenFree ? 'gluten free' : 'contains gluten'}`,
        `  serve: ${f.serve}`,
        `  caffeine: ${f.caffeine}`,
        `  storage: ${f.storage}`,
        `  ingredients: ${f.ingredients}`,
        `  ${p.positioning}. ${p.dominantFlavours.join(', ')}.`,
      ].join('\n');
    })
    .join('\n\n');
}

export { PRODUCTS, scoreProduct, rankProducts, factsSheet };
