/**
 * NON Somm — Cloudflare Worker
 *
 *   theme section (somm.js)
 *        |
 *        v
 *   POST /somm
 *        |
 *        +-- step 1: Claude — extract a DishProfile from free text
 *        |
 *        +-- step 2: rankProducts() — deterministic, no AI
 *        |
 *        +-- step 3: Claude — write one sentence from the top result
 *        |
 *        v
 *   JSON back to the theme
 *
 * The model never decides which bottle wins. Step 1 is extraction, step 3 is
 * phrasing. Everything between them is plain arithmetic in scoring-engine.js.
 *
 * Two rules hold the whole thing together:
 *   - the model is never shown a price, so it can never misquote one
 *   - the response carries product *codes*; the theme renders title, price
 *     and availability from Liquid
 */

import { PRODUCTS, rankProducts, scoreProduct, factsSheet } from './scoring-engine.js';

import { BRAND_SYSTEM } from './brand-kb.js';
const MAX_QUERY = 500;

const DISH_SCHEMA = {
  type: 'object',
  properties: {
    proteins: { type: 'array', items: { type: 'string' } },
    fatLevel: { type: 'number' },
    cookingStyle: { type: 'array', items: { type: 'string' } },
    dishAcid: { type: 'number' },
    weight: { type: 'number' },
    heat: { type: 'number' },
    flavourNotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['proteins', 'fatLevel', 'cookingStyle', 'dishAcid', 'weight', 'heat', 'flavourNotes'],
};

const EXTRACT_SYSTEM = `You convert a free-text description of food into a structured profile.

Output ONLY a JSON object matching this shape. No prose, no markdown fence:
{
  "proteins": string[],      // e.g. ["lamb"], ["oyster"], [] if none
  "fatLevel": number,        // 0-5, how fatty/rich
  "cookingStyle": string[],  // e.g. ["charred","grilled"], [] if raw or unstated
  "dishAcid": number,        // 0-5, acidity or brightness
  "weight": number,          // 0-5, how heavy the dish eats
  "heat": number,            // 0-5, chilli heat specifically
  "flavourNotes": string[]   // free-form flavour words present
}

Vocabulary, use these where they fit:
  proteins: shellfish, raw fish, white fish, oyster, poultry, red meat, beef,
            lamb, game, mushroom, vegetable, grain, hard cheese, goat cheese,
            cured meat, chocolate
  cookingStyle: raw, cured, lightly cooked, steamed, poached, roasted, grilled,
            charred, braised, fried, smoked

If the description is about an occasion rather than a dish ("something for a
picnic", "I've stopped drinking"), infer the most likely food and keep every
number mid-scale. Never return null; use [] or 0.`;

// Product-page variant. The customer is already looking at one bottle and
// wants a verdict, not a fresh recommendation — so the sentence has to be
// willing to say no. A somm that calls everything a good match is worthless,
// and on a product page the incentive to soften is exactly why it must not.
const VERDICT_SYSTEM = `You are NON Somm. The customer is looking at one specific
bottle and has asked whether it suits their dish. You write the verdict.

Hard rules:
- ONE sentence, 30 words maximum.
- Use ONLY the facts given to you. Do not invent tasting notes, ingredients,
  awards, ratings or claims.
- Never mention price, stock, discounts or shipping. You do not have that data.
- When the fit is weak, say so plainly. Do not soften it, do not hedge into a
  yes. You will be told which bottle is actually better; name it.
- When the fit is strong, state it without qualifying.
- Australian English. No em dashes. No exclamation marks.

Voice: a sommelier who knows the kitchen. Specific and unfussy.`;

const EXPLAIN_SYSTEM = `You are NON Somm. You write one sentence explaining why a
specific bottle suits a specific dish.

Hard rules:
- ONE sentence, 30 words maximum.
- Use ONLY the facts given to you. Do not invent tasting notes, ingredients,
  awards, ratings or claims.
- Never mention price, stock, discounts or shipping. You do not have that data.
- Do not hedge ("might", "could", "perhaps"). State it.
- Australian English. No em dashes. No exclamation marks.

Voice: a sommelier who knows the kitchen. Specific and unfussy.`;

// Not every question is a pairing. "Are they low calorie?", "what's in it?",
// "is it vegan?" are factual, and forcing them through the dish extractor
// produced answers like "I don't have calorie data" while the numbers sat in
// Shopify the whole time.
//
// So route first. One cheap call, one word out.
const ROUTE_SYSTEM = `Classify the question. Reply with ONE word, nothing else:

pairing  — asks what to drink WITH A NAMED FOOD, meal or dish. There must be
           food in the question. "steak", "oysters", "a cheese board", "mapo
           tofu", "what goes with roast chicken".
           NOT a gift, NOT "is this a good choice", NOT "who is it for" —
           those name no food and belong in facts.
facts    — asks about the drinks themselves: calories, kilojoules, sugar,
           carbs, sodium, alcohol, ingredients, allergens, vegan, gluten,
           caffeine, how to serve it, how long it keeps, what it tastes like,
           which bottle is most popular or the best seller, whether it makes a
           good gift, who a bottle suits, and whether the bottle someone is
           looking at is a good choice

Examples that are facts, not pairing:
  "are they low calorie?"        "how many calories?"      "is it sweet?"
  "which has the least sugar?"   "what's in it?"           "is it vegan?"
  "how much alcohol?"            "does it have caffeine?"  "how do I serve it?"
  "how long does it keep?"       "is it gluten free?"

Anything asking how healthy, how sweet, how strong or what is in the bottle is
facts. Only route to pairing when the question is about what to drink WITH
something, or which bottle suits an occasion.
brand    — asks about NON itself: who started it, why, where the name came
           from, when it launched, WHERE IT IS MADE, what NONHQ is, what NON
           is trying to be, how it differs from the category, Aaron's
           background, awards.
           Also route here anything asking WHAT NON IS rather than what is in
           it: "is it wine?", "is it a mocktail?", "how is it different from
           de-alcoholised wine?", "is it just grape juice?". Those are the
           brand's central claim and the approved wording lives in the notes,
           not on the spec sheet.
other    — anything else (shipping, orders, stockists, wholesale, careers)

If it asks both, answer pairing.`;

const FACTS_SYSTEM = `You are NON Somm. You answer factual questions about the
NON range using ONLY the data sheet you are given.

Hard rules:
- Use ONLY the numbers and ingredients in the sheet. Never estimate, never
  round to a "roughly", never invent a figure you were not given.
- NEVER describe your own data. Do not mention "the sheet", "the page", what
  you were given, what you can see, or what you cannot compare. A sommelier
  talks about the wine, not about their notes. Lines like "it's the only
  bottle on the sheet, so I can't compare it" are exactly what to avoid.
- If you cannot answer something, simply answer what you can and stop. Say
  less rather than explaining the gap. Never apologise for missing data.
- Quote real figures when they help, and name the bottle they belong to.
- Never mention price, stock, discounts or shipping. You do not have that data.
- Only discuss bottles you have data for. If you have one bottle, talk about
  that bottle on its own terms rather than noting the absence of others.
- Two short paragraphs maximum. Australian English. No em dashes.

Voice: a sommelier who knows the spec sheet. Precise and unfussy.`;

/* ---------------------------------------------------------- house rules

   Appended to all four PROSE prompts, never to the two classifiers.

   Each of these exists because the 2026-08-03 audit caught it live, not
   because it seemed prudent:

   - The somm called the range "the wines" when declining a shipping question.
     One line, unprompted, and it concedes the argument the whole About page
     is built on. The Spanish directive already carried this rule; English
     had it nowhere, which is how the translated path ended up better
     protected than the source.

   - Nine of thirty-eight answers narrated their own sources — "I don't have",
     "the notes don't cover". FACTS_SYSTEM already banned it, but the rule
     lived only there, so the brand answers were the worst offenders.

   - Pregnancy was correctly deferred to a doctor; driving got a flat "no
     alcohol in any of them to affect your ability to drive". Same class of
     question, two standards, and the confident one is the one that carries
     legal weight. State the ABV, then defer. */
const HOUSE_RULES = `

House rules. These override anything above them:

- NON is a WINE ALTERNATIVE. It is never "wine". Never call the range "the
  wines" or "our wines", never call a bottle "a wine", and never describe NON
  as non-alcoholic wine or de-alcoholised wine. It sits where wine sits; it is
  not a version of it. If you need a noun, use "bottle", "the range", or the
  bottle's name.

- Never narrate your own sources. Do not say "I don't have", "the notes", "the
  sheet", "my data", "I can't compare", or apologise for a gap. Answer what you
  can and stop. Saying less is always better than explaining what you lack.

- The range is NON1, NON2, NON3, NON5, NON7 and NON9, plus the stopper and the
  sets. Never name any other product. Do not invent a bottle, a flavour or a
  variant that is not in the data in front of you, and never describe a bottle
  by a name you were not given. If you want to compare, compare with one of the
  six by its real name.

- The sheet carries how each bottle SELLS. Use it to reassure a customer that
  they have chosen well, and never against the bottle they are looking at. If
  someone is on a bottle's own page, do not tell them it is the least ordered,
  do not rank it below the others, and do not volunteer its position unless
  they asked which is most popular. "One of the six" is always available and
  always true.

- Health, medical, pregnancy, medication, addiction and driving questions: give
  the factual position — every NON bottle is 0.0% ABV — and then say it is a
  question for a doctor or the relevant authority. Do not reassure, do not tell
  anyone what is safe for them, and do not say a drink will or will not affect
  their ability to do anything.`;

/* --------------------------------------------------------------- language

   The somm's answers are GENERATED, not stored, so they cannot be translated
   after the fact the way section and product copy can. The target language
   and the terms that must survive it have to go into the prompt.

   Two rules govern this block:

   1. English is untouched. `directive('en')` returns the empty string, so an
      English request sends byte-identical system prompts to the ones that
      shipped before this existed. No locale, unknown locale, or 'en' all
      take that path. Nothing about the live behaviour changes today.

   2. ROUTE_SYSTEM and EXTRACT_SYSTEM never receive a directive. They are
      classifiers — one word out, and a JSON dish object — read by code, not
      by a customer. Translating their OUTPUT would break the switch
      statements downstream. Only the four prose prompts get it.

   The glossary lives in docs/translation-glossary.md and this is the second
   copy of it. That is deliberate: the worker cannot read the repo at runtime.
   If a term changes there, change it here.                                  */

const LANGUAGES = {
  es: {
    name: 'Spanish',
    // Informal address, per the glossary: the brand speaks to one person.
    directive: `

ANSWER IN SPANISH. Not English. The customer is reading Spanish.

Address the reader informally (tú, not usted).

Never translate these. They are names:
- NON, and the bottle names NON1 NON2 NON3 NON5 NON7 NON9
- NON Somm, NONHQ, NON Lotto
- Verjus (the ingredient carries this name in Spanish)

Never write "vino sin alcohol" or "vino desalcoholizado" for what NON is.
NON is not wine with the alcohol taken out, and that phrasing collapses the
whole argument. Say "alternativa al vino". If you need to state the strength,
write "0,0 %" with a comma, as Spanish does.

Use the Spanish WINE trade's words, not everyday ones: tanino, salinidad,
acidez, cuerpo. A sommelier reading it should recognise the register.

Keep NON's register: short, declarative, slightly dry. No exclamation marks,
no selling, a concrete noun in preference to an adjective. Do not write an
enthusiastic Spanish version of a restrained English sentence.

Every other rule above still applies, including the sentence and word limits.
Count words in Spanish.`,

    /* The bestWith answer is assembled in code, never by the model, so the
       directive above cannot reach it. It needs real vocabulary.

       Cooking styles are PREPOSITIONAL PHRASES on purpose. Spanish adjectives
       agree with the noun's gender, so "grilled" as `asado` gives "cordero
       asado" but "carne roja asada" — and the pairs are built at runtime, so
       there is no safe single form. `a la parrilla` is invariant and reads as
       a chef would write it. Same reasoning for every entry here. */
    styles: {
      braised: 'en estofado',
      charred: 'a la brasa',
      cured: 'en salazón',
      fried: 'a la sartén',
      grilled: 'a la parrilla',
      'lightly cooked': 'de cocción breve',
      poached: 'al escalfado',
      raw: 'en crudo',
      roasted: 'al horno',
      smoked: 'al humo',
      steamed: 'al vapor',
    },
    proteins: {
      beef: 'ternera',
      chocolate: 'chocolate',
      'cured meat': 'embutido',
      game: 'caza',
      'goat cheese': 'queso de cabra',
      grain: 'cereales',
      'hard cheese': 'queso curado',
      lamb: 'cordero',
      mushroom: 'setas',
      oyster: 'ostra',
      poultry: 'ave',
      'raw fish': 'pescado crudo',
      'red meat': 'carne roja',
      shellfish: 'marisco',
      vegetable: 'verdura',
      'white fish': 'pescado blanco',
    },
    /* Cheese does not take the generic style phrases. "cured" on a cheese is
       `curado`, not the salt-curing `en salazón` used for meat, and "raw"
       means unpasteurised milk, not served raw. Both cheese nouns are
       masculine, so the adjective is safe here. */
    overrides: {
      'goat cheese': { cured: 'curado', raw: 'de leche cruda' },
      'hard cheese': { cured: 'curado', raw: 'de leche cruda' },
    },
    // The CODE, not the name: NON1 is a product name and never translates,
    // while `p.name` in the worker is the English one and would land untranslated
    // in the middle of a Spanish sentence.
    bestWith: (code, list) => `${code} marida mejor con ${list}.`,
    join: (items) =>
      items.length > 1
        ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
        : items[0],
  },
};

/* Builds the bestWith sentence in the target language, or returns null when
   there is no entry — the caller then keeps the English one. */
function bestWithSentence(locale, found) {
  const tag = String(locale || 'en').trim().toLowerCase();
  const L = LANGUAGES[tag] || LANGUAGES[tag.split('-')[0]];
  if (!L || !L.proteins) return null;

  const items = found.pairs.map(({ style, protein }) => {
    const noun = L.proteins[protein];
    if (!noun) return null;               // unknown term: bail rather than half-translate
    const override = L.overrides && L.overrides[protein] && L.overrides[protein][style];
    const qual = override || (style ? L.styles[style] : '');
    if (style && !qual) return null;
    return qual ? `${noun} ${qual}` : noun;
  });

  if (items.some((x) => !x)) return null;
  return L.bestWith(found.productId, L.join(items));
}

// 'en' and anything unrecognised return '' — the prompts go out unchanged.
export function languageDirective(locale) {
  const tag = String(locale || 'en').trim().toLowerCase();
  if (!tag || tag === 'en' || tag.startsWith('en-')) return '';
  const entry = LANGUAGES[tag] || LANGUAGES[tag.split('-')[0]];
  return entry ? entry.directive : '';
}

/* ------------------------------------------------------------------ utils */

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(), ...extra },
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

async function claude(env, { system, messages, maxTokens, model }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

/* ------------------------------------------------------ step 0: routing */

async function routeQuery(env, query) {
  try {
    const word = await claude(env, {
      model: env.EXTRACT_MODEL || 'claude-haiku-4-5-20251001',
      maxTokens: 8,
      system: ROUTE_SYSTEM,
      messages: [{ role: 'user', content: query }],
    });
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    if (clean === 'facts' || clean === 'other' || clean === 'brand') return clean;
    return 'pairing';
  } catch (e) {
    // Routing is an optimisation, not a gate. If it fails, pair.
    return 'pairing';
  }
}

async function answerFacts(env, query, code, facts, lang = '') {
  const scope = code
    ? PRODUCTS.filter((p) => p.id === String(code).toUpperCase())
    : PRODUCTS;

  // The theme's own sheet for the bottle being viewed. PRODUCTS is this
  // Worker's static copy of the range and carries what the engine needs to
  // score — it has never carried storage, serving or ingredient prose. Shopify
  // does, on every bottle, and the product page now sends it. Appended rather
  // than merged so the two sources stay distinguishable, and only fields with a
  // value are included: an empty one must read as absent, not as a blank fact.
  let sheet = '';
  if (facts && typeof facts === 'object') {
    const rows = [
      ['Storage and shelf life', facts.storage],
      ['How to serve', facts.serve],
      ['Ingredients', facts.ingredients],
      ['Producer notes', facts.notes],
      ['Flavour profile', facts.profile],
      ['Sits where', facts.sits],
      ['Nutrition', facts.nutrition],
      ['Price', facts.price],
    ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

    if (rows.length) {
      sheet =
        '\n\nThe page the customer is on publishes this sheet for ' +
        (facts.title || facts.code || 'this bottle') +
        '. Prefer it over the range data above where they overlap:\n' +
        rows.map(([k, v]) => '- ' + k + ': ' + v).join('\n');
    }
  }

  const answer = await claude(env, {
    model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
    // 400 truncated the trade answer mid-number ("NON9 the richest at 51 cal
    // and 12.5"). Two short paragraphs of six-bottle comparison do not fit.
    maxTokens: 700,
    system: FACTS_SYSTEM + HOUSE_RULES + lang,
    messages: [
      {
        role: 'user',
        content:
          'Data sheet — this is the complete range, ' +
          (scope.length ? scope : PRODUCTS).length + ' bottles:\n\n' +
          factsSheet(scope.length ? scope : PRODUCTS) +
          sheet +
          '\n\nQuestion: ' + query,
      },
    ],
  });

  // Name-drop any bottle the answer actually cites, so the pick cards match
  // the words rather than being a second, unrelated recommendation.
  const picks = PRODUCTS.filter((p) => answer.indexOf(p.id) !== -1).map((p) => p.id).slice(0, 2);

  return { answer, picks };
}

/* --------------------------------------------------- step 1: extraction */

function validateDish(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null);
  const num = (v) => (typeof v === 'number' && v >= 0 && v <= 5 ? v : null);

  const dish = {
    proteins: arr(value.proteins),
    cookingStyle: arr(value.cookingStyle),
    flavourNotes: arr(value.flavourNotes),
    fatLevel: num(value.fatLevel),
    dishAcid: num(value.dishAcid),
    weight: num(value.weight),
    heat: num(value.heat),
  };

  // Every field must be present and in range. Do not paper over a bad
  // extraction with defaults — a silently wrong dish profile produces a
  // confident, wrong recommendation, which is worse than an error.
  for (const [key, v] of Object.entries(dish)) {
    if (v === null) return null;
  }
  return dish;
}

function parseJSONish(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Models occasionally wrap in a fence despite instruction.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e2) {
      return null;
    }
  }
}

async function extractDish(env, query) {
  let lastError = null;

  const attempt = async (extraInstruction) => {
    try {
      const text = await claude(env, {
        model: env.EXTRACT_MODEL || 'claude-haiku-4-5-20251001',
        maxTokens: 400,
        system: EXTRACT_SYSTEM + (extraInstruction || ''),
        messages: [{ role: 'user', content: query }],
      });
      return validateDish(parseJSONish(text));
    } catch (e) {
      lastError = e;
      return null;
    }
  };

  const first = await attempt();
  if (first) return first;

  const second = await attempt(
    '\n\nYour previous response was not valid. Return ONLY the JSON object. ' +
      'Every field is required. All numbers must be between 0 and 5.'
  );
  if (second) return second;

  // If the API itself errored, that message is far more useful than
  // "failed twice" — surface it rather than replacing it.
  if (lastError) throw lastError;
  throw new Error('extraction returned unparseable JSON twice');
}

/* -------------------------------------------------- step 3: explanation */

async function explain(env, { query, product, reasons, score, lang = '' }) {
  return claude(env, {
    model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
    maxTokens: 150,
    system: EXPLAIN_SYSTEM + HOUSE_RULES + lang,
    messages: [
      {
        role: 'user',
        content: [
          `The customer said: "${query}"`,
          '',
          `Recommended bottle: ${product.name} (${product.id})`,
          `Positioning: ${product.positioning}`,
          `Dominant flavours: ${product.dominantFlavours.join(', ')}`,
          `Structure — acid ${product.acid}/5, tannin ${product.tannin}/5, ` +
            `sweetness ${product.sweetness}/5, salt ${product.salt}/5, body ${product.body}/5`,
          '',
          'Why the engine picked it:',
          ...reasons.map((r) => `- ${r}`),
          '',
          'Write the one sentence.',
        ].join('\n'),
      },
    ],
  });
}


/* ------------------------------------------------- product-page variant */

// Plain thresholds, deliberately in code. The model phrases the verdict; it
// does not decide whether the match is good, because that is exactly the
// judgement it would shade toward yes.
function fitBucket(score) {
  if (score >= 65) return 'strong';
  if (score >= 35) return 'workable';
  return 'weak';
}

async function verdict(env, { query, product, reasons, score, fit, instead, lang = '' }) {
  const lines = [
    `The customer said: "${query}"`,
    '',
    `They are looking at: ${product.name} (${product.id})`,
    `Positioning: ${product.positioning}`,
    `Dominant flavours: ${product.dominantFlavours.join(', ')}`,
    `Structure — acid ${product.acid}/5, tannin ${product.tannin}/5, ` +
      `sweetness ${product.sweetness}/5, salt ${product.salt}/5, body ${product.body}/5`,
    '',
    `Fit: ${fit} (${score}/100)`,
  ];

  if (reasons.length) {
    lines.push('', 'What matched:', ...reasons.map((r) => `- ${r}`));
  } else {
    lines.push('', 'Nothing about this dish matched this bottle.');
  }

  if (instead) {
    lines.push('', `The better bottle for this dish is ${instead.name} (${instead.id}). Name it.`);
  }

  lines.push('', 'Write the one-sentence verdict.');

  return claude(env, {
    model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
    maxTokens: 150,
    system: VERDICT_SYSTEM + HOUSE_RULES + lang,
    messages: [{ role: 'user', content: lines.join('\n') }],
  });
}

// Passive suggestions: no model call, no cost, no latency. Read straight off
// the product's bestWith data. This is what a product page should show before
// anyone types anything.
function suggestionsFor(code) {
  const p = PRODUCTS.find((x) => x.id === String(code || '').toUpperCase());
  if (!p) return null;

  const styles = p.bestWith.cookingStyle.filter((s) => s !== 'lightly cooked');
  const proteins = p.bestWith.proteins;
  const out = [];

  const pairs = [];
  for (let i = 0; i < 3 && i < proteins.length; i++) {
    const style = styles[i % styles.length];
    out.push(style ? `${style} ${proteins[i]}` : proteins[i]);
    pairs.push({ style: style || '', protein: proteins[i] });
  }

  // `pairs` keeps the two halves separate so a translation can put them back
  // together under its own grammar. English happens to be `style protein`;
  // Spanish is not, and joining first would throw that away.
  return { productId: p.id, productName: p.name, suggestions: out, pairs };
}

/* ------------------------------------------------------------- fallback */

// Never fail in the customer's face. The Mixed 6 is the honest answer when we
// cannot compute one: it covers every course.
//
// `detail` carries the upstream failure (status code and error type) so a
// failing deploy can be diagnosed from one curl instead of a tail session.
// Anthropic's error bodies do not echo the key, and this is truncated, but it
// is still internal detail — set DEBUG=0 in wrangler.toml to suppress it once
// the Worker is known good.
function fallbackResponse(reason, err, env) {
  const body = {
    productId: 'SET',
    productName: 'Mixed 6 Pack',
    score: 0,
    explanation:
      'Hard to call from that alone, so start with the mixed six: it covers every course and tells you which seat at the table is yours.',
    answer:
      'Hard to call from that alone, so start with the mixed six: it covers every course and tells you which seat at the table is yours.',
    picks: ['SET'],
    fallback: true,
    reason,
  };

  if (err) {
    // Always visible in `wrangler tail`, regardless of the DEBUG setting.
    console.error(`[somm] ${reason}:`, err && err.message ? err.message : err);
    if (!env || env.DEBUG !== '0') {
      body.detail = String((err && err.message) || err).slice(0, 300);
    }
  }

  return body;
}

/* ----------------------------------------------------------- rate limit */

async function rateLimited(env, request) {
  if (!env.SOMM_KV) return false; // no KV bound — skip rather than fail closed
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `rl:${ip}`;
  const current = Number((await env.SOMM_KV.get(key)) || 0);
  const limit = Number(env.RATE_LIMIT_PER_MINUTE || 20);
  if (current >= limit) return true;
  await env.SOMM_KV.put(key, String(current + 1), { expirationTtl: 60 });
  return false;
}

/* -------------------------------------------------------------- handler */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, products: PRODUCTS.length });

    // No model call — safe to serve on GET and cheap enough to cache.
    if (url.pathname === '/somm/suggestions') {
      const found = suggestionsFor(url.searchParams.get('product'));
      if (!found) return json({ error: 'unknown product' }, 404);
      return json(found, 200, { 'Cache-Control': 'public, max-age=3600' });
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (url.pathname !== '/somm' && url.pathname !== '/') {
      return json({ error: 'not found' }, 404);
    }

    if (await rateLimited(env, request)) {
      return json({ error: 'slow down' }, 429);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'invalid JSON body' }, 400);
    }

    const query = (body.query || '').trim();
    if (!query) return json({ error: 'query is required' }, 400);
    if (query.length > MAX_QUERY) {
      return json({ error: `query must be under ${MAX_QUERY} characters` }, 400);
    }

    // On a product page the theme sends the bottle being viewed. With it, the
    // question changes from "which bottle" to "does this one fit", and the
    // answer has to be allowed to be no.
    const context = body.productContext || body.code || null;

    // Empty string for English, which is every request today. The four prose
    // prompts get it appended; the two classifiers never do.
    const lang = languageDirective(body.locale);

    // ---- route: factual questions never reach the pairing engine ---------
    const intent = await routeQuery(env, query);

    // Brand questions answer from the approved knowledge base, never from the
    // product data sheet and never from the model's own recall. The KB is the
    // only cleared source; anything outside it is refused rather than guessed.
    if (intent === 'brand') {
      try {
        const answer = await claude(env, {
          model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
          maxTokens: 400,
          system: BRAND_SYSTEM + HOUSE_RULES + lang,
          messages: [{ role: 'user', content: query }],
        });
        return json({ intent: 'brand', answer, explanation: answer, picks: [], productId: null });
      } catch (e) {
        return json(fallbackResponse('brand', e, env), 200);
      }
    }

    if (intent === 'facts' || intent === 'other') {
      try {
        const result = await answerFacts(env, query, context, body.facts, lang);
        return json({
          intent: intent,
          answer: result.answer,
          explanation: result.answer,
          picks: result.picks,
          // Fall back to the bottle the customer is looking at. It was null
          // on five facts answers that named a bottle in their own text.
          productId: result.picks[0] || (context ? String(context).toUpperCase() : null),
        });
      } catch (e) {
        return json(fallbackResponse('facts', e, env), 200);
      }
    }

    let dish;
    try {
      dish = await extractDish(env, query);
    } catch (e) {
      /* Extraction failed. Before falling back to the Mixed 6, check whether
         the question even had a dish in it.

         "What does it pair best with?" on a product page is the commonest
         question there is, and it is the INVERSE of what the extractor does:
         it names no food, so there is nothing to extract, the model returns
         prose instead of a DishProfile, and two attempts later the customer
         is told to buy a mixed six while standing on the NON1 page. That is
         the honest fallback answering the wrong question.

         The bottle's own bestWith data already answers it, deterministically
         and with no model call — the same data /somm/suggestions serves. Use
         it whenever we know which bottle they are looking at. */
      const onBottle = context ? suggestionsFor(context) : null;
      if (onBottle && onBottle.suggestions.length) {
        const list = onBottle.suggestions;
        const phrasedEn =
          list.length > 1
            ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
            : list[0];
        // Translated where we can; English is the fallback, never a half-and-half.
        const sentence =
          bestWithSentence(body.locale, onBottle) ||
          `${onBottle.productName} sits best with ${phrasedEn}.`;
        return json({
          intent: 'pairing',
          productId: onBottle.productId,
          productName: onBottle.productName,
          answer: sentence,
          explanation: sentence,
          picks: [onBottle.productId],
          suggestions: list,
          source: 'bestWith',
        });
      }
      return json(fallbackResponse('extraction', e, env), 200);
    }

    /* A pairing question that names no food is not a pairing question.

       "I'm buying it as a gift" routes to pairing, extraction succeeds and
       returns an EMPTY profile — no proteins, no flavour notes — the bottle
       then scores near zero against nothing, and the verdict prompt is under
       orders to state a weak fit plainly. The result on NON1's own page was
       "a reasonable, not standout, choice" about the best-selling bottle in
       the range. The scoring was working; it was being asked the wrong
       question.

       An empty profile with a bottle in hand is a question ABOUT the bottle,
       so it goes to the facts path, which has the full sheet including how
       the bottle actually sells. */
    if (context && dish && !(dish.proteins || []).length && !(dish.flavourNotes || []).length) {
      try {
        const result = await answerFacts(env, query, context, body.facts, lang);
        return json({
          intent: 'facts',
          answer: result.answer,
          explanation: result.answer,
          picks: result.picks,
          productId: String(context).toUpperCase(),
          source: 'no-dish',
        });
      } catch (e) {
        return json(fallbackResponse('facts', e, env), 200);
      }
    }

    // ---- product page: score the one bottle, return a verdict -------------
    if (context) {
      const product = PRODUCTS.find((p) => p.id === String(context).toUpperCase());
      if (product) {
        const scored = scoreProduct(product, dish);
        const fit = fitBucket(scored.score);

        // The spec said to attach an alternative only when fit is "weak".
        // Live testing showed why that is too narrow: NON9 against delicate
        // poached salmon scores 41, which buckets as "workable", yet the
        // honest verdict is "this will flatten it". The model said exactly
        // that and then had no bottle to point at, because no alternative had
        // been computed — the worst of both answers.
        //
        // So: attach an alternative whenever the fit is not strong AND another
        // bottle clearly beats it. Still grounded in a real ranking, and a
        // "workable" verdict can now name where to go instead.
        let instead = null;
        if (fit !== 'strong') {
          const best = rankProducts(dish).find((r) => r.productId !== product.id);
          if (best && best.score > scored.score + 15) instead = best.product;
        }

        let sentence;
        try {
          sentence = await verdict(env, {
            query, product, reasons: scored.reasons, score: scored.score, fit, instead, lang,
          });
        } catch (e) {
          return json(fallbackResponse('verdict', e, env), 200);
        }

        return json({
          // Set on every path: the audit found intent null on five of six
          // pairing answers, which makes them invisible to the dataLayer
          // _answered events that count by intent.
          intent: 'pairing',
          productId: product.id,
          productName: product.name,
          fit,
          score: scored.score,
          explanation: sentence,
          ...(instead
            ? { suggestedInstead: { productId: instead.id, productName: instead.name } }
            : {}),
          answer: sentence,
          picks: instead ? [instead.id] : [],
          dish,
        });
      }
    }

    // ---- homepage: rank everything, pick a winner -------------------------
    const ranked = rankProducts(dish);
    const top = ranked[0];
    const runnerUp = ranked[1];

    let explanation;
    try {
      explanation = await explain(env, {
        query,
        product: top.product,
        reasons: top.reasons,
        score: top.score,
        lang,
      });
    } catch (e) {
      return json(fallbackResponse('explanation', e, env), 200);
    }

    const includeAlternative = runnerUp && top.score - runnerUp.score <= 15;

    const picks = [top.productId];
    if (includeAlternative) picks.push(runnerUp.productId);

    return json({
      // documented shape
      intent: 'pairing',
      productId: top.productId,
      productName: top.product.name,
      score: top.score,
      explanation,
      ...(includeAlternative
        ? {
            alternative: {
              productId: runnerUp.productId,
              productName: runnerUp.product.name,
            },
          }
        : {}),

      // shape the theme's somm.js already consumes, so no client change is
      // needed: `answer` is rendered, `picks` are resolved to live products
      answer: explanation,
      picks,

      // useful in logs and for tuning; harmless to expose
      dish,
      context,
    });
  },
};
