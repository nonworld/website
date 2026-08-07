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

/* The roster: every bottle's code and name, nothing else.
   ==========================================================================
   Asked "this is the coffee one yes" on NON2's page, the brand route answered
   "NON does not have a coffee-based bottle". NON7 is Stewed Cherry & Coffee,
   and the same log had described its coffee and its caffeine four times within
   the hour. The route knew NON2 was not coffee and had no way to know which
   bottle was, so it denied the range instead of redirecting to it. Denying a
   product that exists is worse than any spec answer.

   The same question on NON1's page was answered correctly, because it routed
   to facts and facts carries the whole sheet. So this was never a knowledge
   gap — it was one route being blind to the other five bottles.

   Names only, deliberately. The separation the routing exists to create is
   that brand answers come from the knowledge base rather than the product
   sheet, and a list of six names cannot turn a brand question into a spec
   answer — it can only stop the somm denying its own range. */
const ROSTER = PRODUCTS.map((p) => `${p.id} ${p.name}`).join(', ');

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
  proteins: shellfish, raw fish, white fish, oyster, poultry, duck, red meat,
            beef, lamb, game, mushroom, vegetable, grain, hard cheese,
            goat cheese, cured meat, chocolate
  cookingStyle: raw, cured, lightly cooked, steamed, poached, roasted, grilled,
            charred, braised, fried, smoked

Use "duck" for duck specifically and "poultry" for chicken, turkey and guinea
fowl. They are not interchangeable: duck is fatty and rich and takes a big
tannic pour, chicken is lean and savoury and does not.

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
           NOT A DRINK. "a pint of Guinness", "a glass of shiraz", "an espresso
           martini", "a negroni" name something to DRINK, not something to eat.
           Nobody pairs a drink with a drink: the question behind it is which
           NON sits where that drink sat, which is facts.
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
           And route here anything about VISITING: "can I visit?", "do you do
           tastings?", "can I book a tasting?", "is there a cellar door?",
           "where can I try it?", "are you open to the public?". NONHQ is in
           the brand notes and nowhere else, so "what is NONHQ?" answered
           correctly while "can I visit you?" was told there is no cellar door
           — the same question, two answers, one of them wrong.
other    — anything else (shipping, orders, stockists, wholesale, careers)

If it asks both, answer pairing.

If the question asks what a bottle REPLACES, what it is CLOSEST TO, what to
drink INSTEAD OF wine, or whether it is a SUBSTITUTE for wine, answer: brand.
Those are positioning questions about where a bottle sits at the table, not
requests for a food match, and routing them to pairing returns a list of dishes
to someone who asked about wine.
`;

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

- "SITS WHERE X SAT" IS THE OCCASION, NOT THE FLAVOUR. Every bottle's sheet
  carries one — "a dry rose sat", "a big red sat". It means this is what you
  reach for in the moment that wine would have been opened. Use it whenever
  someone asks what a bottle replaces, what it is closest to, or what to drink
  instead of their usual glass, and say plainly that it is about the moment
  rather than a taste-alike. Never answer that question by denying any wine
  connection at all: that contradicts the sheet on the same page, and the
  answer a customer gets must not depend on how they phrased the question.

- NON is a WINE ALTERNATIVE. It is never "wine". Never call the range "the
  wines" or "our wines", never call a bottle "a wine", and never describe NON
  as non-alcoholic wine or de-alcoholised wine. It sits where wine sits; it is
  not a version of it. If you need a noun, use "bottle", "the range", or the
  bottle's name.

- Never narrate your own sources. Do not say "I don't have", "the notes", "the
  sheet", "my data", "I can't compare", or apologise for a gap. Answer what you
  can and stop. Saying less is always better than explaining what you lack.

- When you must decline, POINT SOMEWHERE. Do not confess a gap first. This rule
  and the price/stock/shipping rule used to collide: told to refuse price and
  told not to say "I don't have", the only phrasing left was "I don't have
  pricing to share", which is the confession the first rule bans. So:
    a discount code, an
    active promotion, or
    how many units are
    left in the warehouse  -> "The price and availability are on the bottle's
                              own page."
                              This does NOT cover "is it in stock" when the
                              sheet answers it. See the out-of-stock rule.
    shipping or delivery   -> "Shipping and delivery are on the shipping page."
    orders, returns, an
    existing order         -> "Customer service will sort that out faster than
                              I can."
    a quote, review or
    award you were not
    given                  -> name what NON HAS been awarded, and say nothing
                              about the one you were asked about.
  Then carry on with something you do know. Redirect, never confess.

- PRICE IS ARITHMETIC, NOT A LOOKUP. When the sheet carries a price and a
  packs list, ANSWER price questions from it: the single bottle, a pack, the
  per-bottle rate, and whether a pack saves anything. Do the sum and give the
  figure.

  On these bottles a six-pack at $150 is six times $30 exactly, so the honest
  answer to "do I save buying six" is NO — say so plainly rather than implying
  a discount that is not there. If a pack IS cheaper per bottle, give the
  saving as a number.

  Keep the redirect only for what could go stale between the question and the
  checkout: a discount code, an active promotion, a live stock count. A figure
  already in the sheet is not one of those, and deflecting it reads as evasion
  on a page that prints the price two inches away.

- OUT OF STOCK IS SAID PLAINLY, NEVER SOFTENED. THIS RULE BEATS THE PRICE AND
  AVAILABILITY REDIRECT ABOVE. If the sheet's Stock line says SOLD OUT, say so
  in your first sentence — "this one is sold out" — and never answer "is this
  in stock" with the redirect when the sheet has already told you the answer.
  The redirect exists for a number you do not have; a sold-out flag is a fact
  you do have. Do not redirect to "availability
  is on the page" — the sheet already told you — and never recommend, praise
  or steer a customer toward a product you have been told is unavailable.
  Point at something they CAN buy instead. Nothing costs more trust than being
  talked into an item that cannot be added to a cart.

- ASK A HUMAN, when the question deserves one. Some questions are genuinely
  beyond a drinks assistant: a medical or pregnancy question, an allergy or
  intolerance you cannot clear from the ingredient list, a trade, wholesale,
  press or event enquiry, a complaint, or anything where being wrong would
  cost the person something real.

  For those, answer whatever part you legitimately can, then end your reply
  with this on its own final line, exactly:

    [[ASK-A-HUMAN: <five to ten words saying what a person needs to answer>]]

  It is stripped before the customer sees it. It is a signal, not speech, so
  do not mention it, do not announce that you are escalating, and do not
  apologise — the no-confession rule still holds.

  ALWAYS use it for trade, wholesale, stockist, distribution, press, events,
  partnership or sponsorship enquiries. These are not customer service. The
  "customer service will sort that out" redirect is for an EXISTING order — a
  restaurant group asking about wholesale is the most valuable message this
  site can receive, and sending them to a returns desk loses it.

  DO NOT use it for price, availability, shipping, delivery, or an existing
  order or return. Those have their own redirects above and a human is not
  needed. Do not use it merely because a detail is missing from the sheet; use
  it when a PERSON is genuinely required.

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

    /* The fallback lines.
     *
     * These are written in code, not by the model, so the ANSWER IN SPANISH
     * directive above cannot reach them — exactly like bestWith. The mega-test
     * caught it: "¿Con qué comida va bien NON3?" failed extraction and the
     * customer got the English "Hard to call from that alone…". A Spanish
     * reader hitting a stumble was answered in the wrong language.
     *
     * `pairing` keeps the Mixed 6, because on a pairing question it is the
     * honest answer. `neutral` recommends nothing, for the same reason the
     * English one does not: a storage question should not come back holding a
     * six-pack.
     *
     * "Mixed 6" is left in English. It is the product's name on the store, and
     * the glossary rule is that names do not translate. */
    fallback: {
      pairing:
        'Difícil de decidir solo con eso, así que empieza por el Mixed 6: cubre todos los platos y te dice cuál es tu sitio en la mesa.',
      neutral:
        'Esa no me ha llegado del todo bien. Pregúntamelo otra vez, o dilo de otra forma y lo retomo.',
    },
  },
};

/* The fallback copy in the customer's language, English when we have none.
   Never a half-and-half: if a language has no fallback block it gets the
   English line whole, rather than an English sentence with a Spanish clause. */
export function fallbackCopy(locale, kind) {
  const tag = String(locale || 'en').trim().toLowerCase();
  const L = LANGUAGES[tag] || LANGUAGES[tag.split('-')[0]];
  return (L && L.fallback && L.fallback[kind]) || null;
}

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

/* ------------------------------------------------------------- streaming

   Median response was 4.9s and p90 8.1s, measured over 204 questions. The
   model is not the slow part in a way we can fix; what we can fix is making
   the customer wait for the WHOLE paragraph before seeing any of it.

   somm.js has been able to read a stream since it was written — it switches on
   the response content-type and has a `readStream` that understands
   `data: {"token": "..."}` frames. The Worker simply never sent any. This is
   the missing half.

   Gated on the Accept header rather than switched on for everyone. The JSON
   contract is what the audit harnesses, `/somm/suggestions` and any other
   consumer rely on; a Worker that silently started streaming at every caller
   would break them all to save a second on one surface.

   Only the two single-call prose paths stream (facts/other and brand). The
   pairing path is extract -> score -> phrase, so its first token cannot appear
   until two of the three are already done, and streaming the last step alone
   would buy almost nothing. */

function wantsStream(request) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/event-stream');
}

function sse(frame) {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

/* Streams the model's text out as it arrives, then a final frame carrying the
   structured fields the JSON path would have returned. On an upstream failure
   BEFORE any token has been sent we can still fall back cleanly; once tokens
   are on the wire the status line is long gone, so the failure is reported in
   the stream and the client keeps what it has. */
async function claudeStreamResponse(env, { system, messages, maxTokens, model, tail, onFail, escalationMeta }) {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, stream: true }),
  });

  if (!upstream.ok) {
    // Nothing has been written yet, so this can still be an ordinary JSON
    // fallback with the right status and shape.
    throw new Error(`anthropic ${upstream.status}: ${await upstream.text()}`);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  (async () => {
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    let text = '';
    let held = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop();
        for (const frame of frames) {
          // Anthropic's SSE carries `event:` and `data:` lines; only the data
          // matters, and only content_block_delta carries text.
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let evt;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
            text += evt.delta.text;
            /* HOLD BACK EVERYTHING FROM THE FIRST '[['.

               The ask-a-human sentinel is metadata the model writes on the
               last line, and a stream emits it character by character — so
               without this the customer watches "[[ASK-A-HUM" type itself
               across the screen before anything strips it. Stripping the
               finished string is too late when the string is being watched.

               '[[' appears nowhere in normal answer prose, so suppressing
               from it costs nothing, and the tail below carries the cleaned
               answer that the client repaints from. If the model never
               finishes the sentinel, the fragment is dropped anyway. */
            if (!held && text.includes('[[')) held = true;
            if (!held) await writer.write(enc.encode(sse({ token: evt.delta.text })));
          }
        }
      }
      /* Escalation is resolved HERE rather than in each route's tail lambda,
         so a route added later inherits it instead of quietly dropping it.
         The tail receives the cleaned answer and the payload carries the
         drafted email alongside it. */
      const cleaned = extractEscalation(text.trim(), escalationMeta || {});
      await writer.write(enc.encode(sse({
        ...tail(cleaned.answer),
        ...(cleaned.escalate ? { escalate: cleaned.escalate } : {}),
      })));
      await writer.write(enc.encode('data: [DONE]\n\n'));
    } catch (e) {
      console.error('[somm] stream:', e && e.message ? e.message : e);
      if (!text && typeof onFail === 'function') {
        await writer.write(enc.encode(sse(onFail(e))));
      }
      await writer.write(enc.encode('data: [DONE]\n\n'));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      ...cors(),
    },
  });
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

/* Split from answerFacts so the streaming path and the JSON path send the
   IDENTICAL prompt. Two copies of a prompt this long is how the streamed
   answer and the tested answer quietly stop being the same answer. */
/* `surface` IS A PARAMETER. It was not, and the omission killed this whole path.
 *
 * The body below builds its system prompt as `FACTS_SYSTEM + HOUSE_RULES +
 * surface + lang`, but the signature took four arguments and `surface` was not
 * one of them. There is no module-scope `surface` either — the only two in this
 * file are a parameter of surfaceDirective() and a const inside the request
 * handler, both out of scope here. This is an ES module, so it is strict mode,
 * so that free identifier is a ReferenceError rather than `undefined`.
 *
 * Every call therefore threw before reaching the model, was caught by the
 * caller's fallback, and returned "That one has not come through cleanly." The
 * Somm could not answer a single question about a bottle — including "Is it
 * sweet?" and "What to serve it with?", which are two of the PDP's own preset
 * chips. Pairing and brand questions were unaffected, which is why it read as a
 * flaky model rather than a dead code path.
 *
 * Both call sites now pass it: answerFacts() forwards the surface it already
 * accepts, and the streaming branch passes the one the handler already built. */
function factsPrompt(query, code, facts, lang = '', surface = '') {
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
      /* PACKS AND STOCK WERE MISSING FROM THIS LIST, WHICH IS WHY THE RULES
         ABOUT THEM DID NOTHING.

         Adding "answer pricing arithmetic" to the house rules while the pack
         prices were never put in front of the model produced the worst of both
         outcomes: it stopped deflecting and started calculating, so "price per
         bottle if I buy twelve" came back $360 — twelve times the single price
         — when the twelve-pack is $300 and was sitting unused in the payload.
         A rule that tells the model to use data it cannot see does not make it
         cautious, it makes it confident and wrong.

         Same for availability: the sold-out rule could not fire because
         `available` never reached the prompt. */
      ['Pack prices', Array.isArray(facts.packs) && facts.packs.length
        ? facts.packs.map((p) => `${p.units} bottle${p.units === 1 ? '' : 's'} for ${p.price}`
            + (p.available === false ? ' (unavailable)' : '')).join('; ')
        : ''],
      // Phrased so the false case cannot be skim-read as the true one.
      ['Stock', facts.available === false
        ? 'SOLD OUT — this product cannot be bought right now'
        : (facts.available === true ? 'In stock' : '')],
    ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

    if (rows.length) {
      sheet =
        '\n\nThe page the customer is on publishes this sheet for ' +
        (facts.title || facts.code || 'this bottle') +
        '. Prefer it over the range data above where they overlap:\n' +
        rows.map(([k, v]) => '- ' + k + ': ' + v).join('\n');
    }
  }

  return {
    // 400 truncated the trade answer mid-number ("NON9 the richest at 51 cal
    // and 12.5"). Two short paragraphs of six-bottle comparison do not fit.
    maxTokens: 700,
    system: FACTS_SYSTEM + HOUSE_RULES + surface + lang,
    messages: [
      {
        role: 'user',
        content:
          // "this is the complete range, 1 bottles" is what this said on every
          // product page, because scope narrows to the bottle being viewed. The
          // model was not merely missing the other five, it was told they did
          // not exist — so "this is the coffee one yes", asked on NON2, could
          // only come back as a denial that NON sells a coffee bottle. NON7 is
          // Stewed Cherry & Coffee.
          //
          // The narrowing itself is right: a PDP question wants that bottle's
          // sheet, not six. Only the claim around it was wrong. The roster
          // costs one line and lets the somm name a bottle it cannot describe,
          // which is the difference between redirecting a customer and denying
          // the product to them.
          (scope.length && scope.length < PRODUCTS.length
            ? 'Data sheet for the bottle the customer is looking at.\n'
              + 'The full range is six bottles: ' + ROSTER + '. You have the '
              + 'sheet for one of them. If the question is about a different '
              + 'bottle, name it from that list and send them to its page — '
              + 'never say a bottle does not exist.\n\n'
            : 'Data sheet — this is the complete range, ' + PRODUCTS.length + ' bottles:\n\n') +
          factsSheet(scope.length ? scope : PRODUCTS) +
          sheet +
          '\n\nQuestion: ' + query,
      },
    ],
  };
}

// Name-drop any bottle the answer actually cites, so the pick cards match
// the words rather than being a second, unrelated recommendation.
function picksFrom(answer) {
  return PRODUCTS.filter((p) => answer.indexOf(p.id) !== -1).map((p) => p.id).slice(0, 2);
}

async function answerFacts(env, query, code, facts, lang = '', surface = '') {
  const prompt = factsPrompt(query, code, facts, lang, surface);
  const answer = await claude(env, {
    model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
    ...prompt,
  });
  // An empty string is not an answer. "Pint of guiness" — misspelt — returned
  // a zero-length body with no error and no fallback flag, so the panel opened
  // and stayed blank. Treat it as the failure it is and let the caller's
  // fallback handle it.
  if (!answer || !answer.trim()) throw new Error('empty answer');
  return { answer, picks: picksFrom(answer) };
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

/* claude(), but an empty body is an error rather than an answer. The prose
   paths all render their result directly into the panel, so a zero-length
   string is indistinguishable from a broken deploy to the person reading it. */

/* ==========================================================================
   WHERE THE QUESTION CAME FROM

   The theme has been sending a `surface` object for a while and this Worker
   ignored it, so a customer who tapped "Mains" on the homepage triptych and
   then answered "Roast chicken" was asked, in effect, to say "a main course"
   twice — once with their thumb and once in words. The first answer was
   general because the model was never told the first half.

   This turns it into two short lines of prompt. Deliberately two: it is
   context, not instruction, and the pairing engine's own scoring is still what
   picks the bottle.

   IT MUST NOT OVER-CONSTRAIN. Arriving from a product page means the customer
   is LOOKING at that bottle, not that they have agreed to buy it — so the
   directive says the bottle is on screen and explicitly permits naming a
   different one. A Somm that can only ever recommend the page you are already
   on is a mirror, not a sommelier.
   ========================================================================== */

const SURFACE_LABELS = {
  homepage_hero: 'the homepage, from the Somm field',
  homepage_triptych: 'the homepage, by tapping a meal category',
  product_page: 'a product page, from the "still deciding" entry',
  product_pairing: 'a product page, by tapping one of its food pairings',
  floating_orb: 'the floating Somm button',
  collection: 'a collection page',
  cart: 'the cart',
};

function surfaceDirective(surface) {
  if (!surface || typeof surface !== 'object') return '';

  const known = [];

  const where = SURFACE_LABELS[surface.surface];
  if (where) known.push(`The customer opened the Somm from ${where}.`);

  /* Already supplied — so do not ask for it again. This is the line that stops
     the conversation restarting from zero after a tap that already said a lot. */
  if (surface.meal_category) {
    known.push(
      `They have ALREADY told us the course: ${surface.meal_category}. ` +
      'Do not ask what kind of meal it is.'
    );
  }
  if (surface.intent) {
    const intents = {
      dinner: 'they are choosing something for dinner',
      gift: 'they are buying it as a gift, so who it is for matters more than what they are eating',
      night_off: 'they are taking a night off the drink, not giving it up — keep the occasion intact',
    };
    if (intents[surface.intent]) known.push(`Context: ${intents[surface.intent]}.`);
  }

  if (surface.product_title) {
    known.push(
      `${surface.product_title} is on screen in front of them` +
      (surface.product_price ? ` at ${surface.product_price}` : '') + '. ' +
      'Answer about that bottle first. If a different one genuinely suits them ' +
      'better, say so and name it — do not recommend this one just because it ' +
      'is the page they are on.'
    );
  }

  if (!known.length) return '';
  return '\n\nWHAT THEY HAVE ALREADY TOLD US\n' + known.join('\n');
}

async function claudeNonEmpty(env, opts) {
  const text = await claude(env, opts);
  if (!text || !text.trim()) throw new Error('empty answer');
  return text;
}

async function explain(env, { query, product, reasons, score, lang = '', surface = '' }) {
  // Same guard as answerFacts. This is the path that actually produced the
  // blank panel: "Pint of guiness" routed to pairing, scored a bottle, and the
  // sentence came back empty — so the customer got a pick card with no words
  // above it and nothing to say why.
  return claudeNonEmpty(env, {
    model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
    maxTokens: 150,
    system: EXPLAIN_SYSTEM + HOUSE_RULES + surface + lang,
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

async function verdict(env, { query, product, reasons, score, fit, instead, lang = '', surface = '' }) {
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

  return claudeNonEmpty(env, {
    model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
    maxTokens: 150,
    system: VERDICT_SYSTEM + HOUSE_RULES + surface + lang,
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
/* `intent` is passed in rather than left off.
 *
 * This function is the ONLY response path that omitted it, which is why the
 * mega-test found intent null on every fallback: the instrumentation counting
 * answers by intent was blind to exactly the responses worth counting.
 *
 * `reason` says which path failed; `intent` says what the customer asked. They
 * are not the same thing and both matter. */
function fallbackResponse(reason, err, env, intent, locale) {
  /* The copy is neutral, and no longer a pairing answer.
   *
   * It used to be "Hard to call from that alone, so start with the mixed six".
   * That is a fine answer to "what goes with lamb" and a non-sequitur to
   * everything else — the mega-test caught it firing on "how should I store it
   * before opening?", which recommended a six-pack to someone asking about a
   * fridge. A generic failure has to degrade sensibly whatever provoked it, so
   * it now admits the miss and invites the question again, with no product
   * recommendation attached at all.
   *
   * The pairing paths keep the Mixed 6 as an honest answer, because there it
   * IS the answer — see the pairing fallback below. */
  const NEUTRAL =
    'That one has not come through cleanly. Ask me again, or put it another way and I will pick it up.';
  const PAIRING =
    'Hard to call from that alone, so start with the mixed six: it covers every course and tells you which seat at the table is yours.';

  const isPairing = intent === 'pairing' || reason === 'extraction' || reason === 'score';
  // Translated where we have it, English whole where we do not.
  const line =
    fallbackCopy(locale, isPairing ? 'pairing' : 'neutral') || (isPairing ? PAIRING : NEUTRAL);

  const body = {
    // No product is recommended on a non-pairing failure. Returning SET meant
    // a storage question came back holding a six-pack.
    productId: isPairing ? 'SET' : null,
    productName: isPairing ? 'Mixed 6 Pack' : null,
    score: 0,
    explanation: line,
    answer: line,
    picks: isPairing ? ['SET'] : [],
    fallback: true,
    intent: intent || reason || null,
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



/* The bottle the customer is standing on, for the BRAND route.
   ==========================================================================
   The brand route answers from the knowledge base and was given no product
   context at all — so "what wine does this replace", asked on NON3's page,
   came back "which bottle are you asking about?" while the code for NON3 was
   in the request. The route knew the answer's SHAPE and not its subject.

   Only the sits line and the title. The brand route must keep answering from
   the knowledge base rather than from the product sheet — handing it the full
   sheet would turn every brand question into a spec answer, which is the
   separation the routing exists to create. */
function brandContext(code, facts) {
  const roster = `\n\nThe range is six bottles: ${ROSTER}. That list is complete and it is the ONLY range fact you may state. If someone describes a bottle by a flavour — the coffee one, the seaweed one, the citrus one — find it in that list and name it, even when they are standing on a different bottle's page. NEVER say NON has no bottle of some description without checking this list first. For anything beyond the name, say which bottle it is and point them at its page.`;
  if (!facts || typeof facts !== 'object') return roster;
  const bits = [];
  if (facts.title) bits.push(`The customer is on the page for ${facts.title}.`);
  if (facts.sits) bits.push(`That bottle's own sheet says it sits where ${facts.sits.replace(/^An |^A /i, '').replace(/ sat$/i, '')} sat.`);
  if (!bits.length) return roster;
  return `${roster}\n\n${bits.join(' ')} If the question is what this bottle replaces, what it is closest to, or what to drink instead of a usual glass, answer with THAT line and explain it is the moment rather than the flavour. Do not ask which bottle they mean — you have been told.`;
}

/* --------------------------------------------------------------- escalate */

/* The model marks a question as needing a person by ending its reply with
   [[ASK-A-HUMAN: reason]]. This pulls that line off and turns it into a
   drafted email.

   STRIPPING IS UNCONDITIONAL AND DELIBERATELY LOOSE. A streamed answer can be
   cut mid-sentinel, and a half-written "[[ASK-A-HUM" reaching a customer is
   worse than losing the signal — so the trailing-fragment pattern is removed
   whether or not it parsed. Metadata leaking into prose is the failure mode
   that matters here.

   The draft is composed here rather than by a second model call. It costs
   nothing, it cannot hallucinate, and the only free text in it is the
   customer's own question. A drafted email that invents a detail would be
   worse than no feature. */
const ESCALATE_RE = /\[\[ASK-A-HUMAN:\s*([^\]]*)\]\]/i;
const ESCALATE_FRAGMENT = /\[\[ASK-?A?-?H?U?M?A?N?:?[^\]]*$/i;

function extractEscalation(text, { query, code, title, page }) {
  const raw = String(text || '');
  const m = raw.match(ESCALATE_RE);
  const answer = raw.replace(ESCALATE_RE, '').replace(ESCALATE_FRAGMENT, '').trim();
  if (!m) return { answer, escalate: null };

  const reason = (m[1] || '').trim() || 'a question that needs a person';
  const about = title || code || 'the range';
  const subject = code && code !== 'SET'
    ? `Question about ${about}`
    : 'Question from the NON site';

  const body = [
    'Hi NON,',
    '',
    `I asked this on ${page || 'your site'}${code && code !== 'SET' ? ` (${about})` : ''}:`,
    '',
    `  "${String(query || '').trim()}"`,
    '',
    'Could someone come back to me on it?',
    '',
    'Thanks',
  ].join('\n');

  return { answer, escalate: { reason, subject, body, about } };
}

/* -------------------------------------------------------------- handler */

const handler = {
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

    // The entry point, as prompt context. Empty for a request that sends no
    // surface, which is every older caller — nothing here is required.
    const surface = surfaceDirective(body.surface);

    // ---- route: factual questions never reach the pairing engine ---------
    const intent = await routeQuery(env, query);

    // Brand questions answer from the approved knowledge base, never from the
    // product data sheet and never from the model's own recall. The KB is the
    // only cleared source; anything outside it is refused rather than guessed.
    if (intent === 'brand') {
      if (wantsStream(request)) {
        try {
          return await claudeStreamResponse(env, {
            model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
            maxTokens: 700,
            system: BRAND_SYSTEM + HOUSE_RULES + brandContext(context, body.facts) + surface + lang,
            messages: [{ role: 'user', content: query }],
            escalationMeta: { query, code: context, page: body.page, title: body.facts && body.facts.title },
            tail: (answer) => ({
              intent: 'brand',
              answer,
              explanation: answer,
              picks: [],
              productId: context ? String(context).toUpperCase() : null,
            }),
            onFail: () => fallbackResponse('brand', null, env, 'brand', body.locale),
          });
        } catch (e) {
          return json(fallbackResponse('brand', e, env, 'brand', body.locale), 200);
        }
      }
      try {
        const answer = await claude(env, {
          model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
          // 700, matching the facts path. Both are "two short paragraphs"
          // prompts and 400 is what cut the trade answer off mid-number there;
          // there is no reason the brand path should be one bad question away
          // from the same failure.
          maxTokens: 700,
          system: BRAND_SYSTEM + HOUSE_RULES + brandContext(context, body.facts) + surface + lang,
          messages: [{ role: 'user', content: query }],
        });
        // The bottle the customer is standing on, not null. "What wine does
        // this replace?" is a brand question asked ON a product page, and
        // returning null there meant the analytics could not tell which
        // bottle prompted it — the last seven null productIds in the
        // mega-test were all this shape.
        return json({
          intent: 'brand',
          answer,
          explanation: answer,
          picks: [],
          productId: context ? String(context).toUpperCase() : null,
        });
      } catch (e) {
        return json(fallbackResponse('brand', e, env, 'brand', body.locale), 200);
      }
    }

    if (intent === 'facts' || intent === 'other') {
      if (wantsStream(request)) {
        try {
          return await claudeStreamResponse(env, {
            model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
            escalationMeta: { query, code: context, page: body.page, title: body.facts && body.facts.title },
            ...factsPrompt(query, context, body.facts, lang, surface),
            tail: (answer) => ({
              intent,
              answer,
              explanation: answer,
              picks: picksFrom(answer),
              productId: picksFrom(answer)[0] || (context ? String(context).toUpperCase() : null),
            }),
            onFail: () => fallbackResponse('facts', null, env, intent, body.locale),
          });
        } catch (e) {
          return json(fallbackResponse('facts', e, env, intent, body.locale), 200);
        }
      }
      try {
        const result = await answerFacts(env, query, context, body.facts, lang, surface);
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
        return json(fallbackResponse('facts', e, env, intent, body.locale), 200);
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
      return json(fallbackResponse('extraction', e, env, 'pairing', body.locale), 200);
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
        const result = await answerFacts(env, query, context, body.facts, lang, surface);
        return json({
          intent: 'facts',
          answer: result.answer,
          explanation: result.answer,
          picks: result.picks,
          productId: String(context).toUpperCase(),
          source: 'no-dish',
        });
      } catch (e) {
        return json(fallbackResponse('facts', e, env, 'facts', body.locale), 200);
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
            surface,
          });
        } catch (e) {
          return json(fallbackResponse('verdict', e, env, 'pairing', body.locale), 200);
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
            surface,
      });
    } catch (e) {
      return json(fallbackResponse('explanation', e, env, 'pairing', body.locale), 200);
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


import { exportToSheet } from './export-sheet.js';

/* ---------------------------------------------------------------- capture

   Until 2026-08-04 this Worker answered, streamed, and forgot. The stated
   purpose of the Somm log — see where it is wrong, unhelpful, or missing
   information — was unservable, because the only record of what anyone had
   ever asked was whatever happened to be in a `wrangler tail` window at the
   time. Reports of heavy testing could not be checked against anything.

   Logging is a WRAPPER around the handler rather than a call at each return.
   The handler has fourteen exit points across four routes plus a fallback per
   route, and instrumenting each one means the fifteenth, added later by
   someone in a hurry, is silently unlogged. Wrapping means a new return is
   logged by construction. It also means the log records what the customer was
   actually sent, not what we believed we were sending — which is the only
   version worth reviewing.

   NOTHING IDENTIFYING IS WRITTEN. No IP, no headers, no cookie, no session.
   The privacy policy commits to not linking Somm queries to a person, and the
   cheapest way to keep that promise is to never hold the means to break it.
*/

// Reading the answer must never cost the customer their answer. Every failure
// path here degrades to logging less, never to breaking the response.
/* THE ENTRY POINT, in a column that already exists.

   `context` has always held the surface TYPE — 'home' or 'product' — and the
   entry point is a refinement of exactly that, so it rides along as
   "home:homepage_triptych" rather than needing a column of its own.

   Deliberately not a migration. somm_log is a live table on a live Worker, and
   adding a column to it is a schema change on production data in exchange for
   a value that is a short enum. Anything already reading `context` keeps
   working: the old value is the prefix, so `context LIKE 'home%'` is unchanged
   and `context = 'home'` matches every row written before today.

   NEVER free text. The surface name is one of a fixed set the theme writes,
   and anything not matching that shape is dropped rather than stored. */
function logContext(body) {
  const base = body.context || null;
  const entry = body.surface && body.surface.surface;
  if (!entry || typeof entry !== 'string') return base;
  if (!/^[a-z_]{1,32}$/.test(entry)) return base;
  return base ? `${base}:${entry}` : entry;
}

async function logExchange(env, row) {
  if (!env.SOMM_LOG) return; // unbound in dev; capture is optional, answers are not
  try {
    await env.SOMM_LOG.prepare(
      `INSERT INTO somm_log
         (at, question, answer, context, product, route, intent, picks, locale,
          ms, fallback, error, store, country, region, page, device, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.at, row.question, row.answer ?? null, row.context ?? null,
      row.product ?? null, row.route ?? null, row.intent ?? null,
      row.picks ?? null, row.locale ?? null, row.ms ?? null,
      row.fallback ? 1 : 0, row.error ?? null,
      row.store ?? null, row.country ?? null, row.region ?? null,
      row.page ?? null, row.device ?? null, row.model ?? null,
    ).run();
  } catch (e) {
    console.error('[somm] log:', e && e.message ? e.message : e);
  }
}

// Our own SSE, not Anthropic's: `data: {"token":"..."}` frames followed by one
// tail frame carrying the finished payload. Reassembles both.
function readOurStream(stream, onDone) {
  const dec = new TextDecoder();
  let buffer = '';
  let text = '';
  let tail = null;
  const reader = stream.getReader();
  return (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop();
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let evt;
          try { evt = JSON.parse(payload); } catch { continue; }
          if (typeof evt.token === 'string') text += evt.token;
          // Any non-token frame is the tail. Last one wins.
          else tail = evt;
        }
      }
    } catch (e) {
      console.error('[somm] capture read:', e && e.message ? e.message : e);
    }
    /* AWAITED. onDone writes to D1, and the promise this function returns is
       what waitUntil is holding the isolate open for. Calling onDone without
       awaiting it resolves the drain the moment the INSERT is *started*, and
       Cloudflare is then free to tear the isolate down mid-write. Nothing
       errors, nothing logs, and the row simply never appears. */
    await onDone(text.trim(), tail);
  })();
}

/* The two paths disagree about what a pick is, so this accepts both rather
   than making either one change shape for the benefit of a log. The streaming
   tail sends `picks: ["NON7"]` — bare strings. The JSON pairing response has
   no picks array at all; it names one bottle at the top level as productId /
   productName and optionally a runner-up under `alternative`. Handling only
   the object form, as the first version did, logged null for every row on
   both paths, which looks exactly like "the Somm recommended nothing". */
function picksOf(payload) {
  if (!payload) return null;
  const out = [];
  if (Array.isArray(payload.picks)) {
    for (const x of payload.picks) {
      if (typeof x === 'string') out.push(x);
      else if (x) out.push(x.productId || x.productName || x.name);
    }
  }
  if (!out.length && payload.productId) out.push(payload.productId);
  if (payload.alternative && payload.alternative.productId) out.push(payload.alternative.productId);
  /* De-duplicated: the runner-up appended above is often already in the picks
     array, and "NON7, NON9, NON9" in a column meant for counting which bottles
     get recommended would quietly inflate one of them. */
  const names = [...new Set(out.filter(Boolean))];
  return names.length ? names.join(', ') : null;
}

export default {
  /* The cron. Runs whether or not anyone asks, which is the point — an export
     that only happens when someone remembers to trigger it is a manual process
     with extra steps. Failures throw so they land in the Worker's error rate
     rather than being swallowed into a silent no-op. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const r = await exportToSheet(env);
        console.log('[somm] export', JSON.stringify(r));
      } catch (e) {
        console.error('[somm] export failed:', e && e.message ? e.message : e);
        throw e;
      }
    })());

    /* RETENTION, ENFORCED RATHER THAN PROMISED.
       -------------------------------------------------------------------
       The published privacy policy says Somm records are kept for 24 months
       and then deleted. Until now the only thing implementing that sentence
       was a DELETE statement written in a comment in schema.sql, to be run by
       hand by someone who remembered — which is not a retention policy, it is
       an intention. A commitment in a legal document with no mechanism behind
       it is worse than no commitment, because it is the one a regulator reads
       back to you.

       Runs on the same hourly tick as the export. Deleting nothing is the
       normal case and costs one indexed query. */
    ctx.waitUntil((async () => {
      if (!env.SOMM_LOG) return;
      const months = Number(env.RETENTION_MONTHS || 24);
      // Derived from the policy's own number rather than a magic constant, so
      // changing the policy and changing the code is one edit, not two that
      // can disagree.
      const cutoff = Date.now() - months * 30.44 * 24 * 60 * 60 * 1000;
      try {
        const r = await env.SOMM_LOG.prepare('DELETE FROM somm_log WHERE at < ?')
          .bind(Math.floor(cutoff)).run();
        const n = r.meta && r.meta.changes ? r.meta.changes : 0;
        if (n) console.log(`[somm] retention: deleted ${n} rows older than ${months} months`);
      } catch (e) {
        console.error('[somm] retention failed:', e && e.message ? e.message : e);
      }
    })());
  },

  async fetch(request, env, ctx) {
    const started = Date.now();

    // Only the ask path is worth logging. Health, CORS preflight and the
    // cached suggestions lookup would be pure noise in a table whose value is
    // that every row is a real question from a real person.
    const url = new URL(request.url);
    const isAsk = request.method === 'POST'
      && (url.pathname === '/somm' || url.pathname === '/');

    /* Manual trigger for the export, so the first run can be watched instead
       of waited for, and so a failure can be read as a response rather than
       dug out of a tail. POST-only and admin-gated: it is not destructive, but
       it does move customer questions to a Google Sheet and that is not a
       thing any passer-by should be able to set off. */
    if (url.pathname === '/somm/export') {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      if (!env.EXPORT_TOKEN) return json({ error: 'export not configured' }, 503);
      if (request.headers.get('X-Export-Token') !== env.EXPORT_TOKEN) {
        return json({ error: 'unauthorised' }, 401);
      }
      try {
        return json(await exportToSheet(env));
      } catch (e) {
        return json({ error: e && e.message ? e.message : String(e) }, 500);
      }
    }

    if (!isAsk) return handler.fetch(request, env);

    // Read the body here, before the handler consumes it, and hand the
    // handler an untouched clone. Parsing failures are the handler's business
    // to report — this only wants the fields, and shrugs if they are absent.
    let body = {};
    let forward = request;
    try {
      const copy = request.clone();
      body = await copy.json();
    } catch { /* handler will return its own 400 */ }

    let res;
    try {
      res = await handler.fetch(forward, env);
    } catch (e) {
      // A throw that escapes the handler is the single most important thing
      // this table can hold: a question that produced nothing at all.
      await logExchange(env, {
        at: started, question: String(body.query || ''), context: logContext(body),
        product: body.product || null, locale: body.locale || null,
        page: body.page || null,
        ms: Date.now() - started, error: `handler: ${e && e.message ? e.message : e}`,
      });
      throw e;
    }

    /* WHERE AND ON WHAT, which is most of what makes the log analysable.

       Country and region come from Cloudflare's edge, which already knows
       them — no lookup, no IP stored. Deliberately no city: country answers
       "which market asks this", and city plus a distinctive question starts
       to describe a person, which is the thing the privacy policy promises
       not to do. The line is drawn in code rather than left to whoever writes
       the next SELECT.

       `store` is the storefront host the ask came from, so AU, US and UK
       traffic can be told apart without inferring it from locale — locale is
       the language, and a UK visitor reading English is not a UK store.

       `page` is the exact path; `context` is only the surface type. The
       client has been sending it all along and nothing was reading it. */
    const cf = request.cf || {};
    const ua = request.headers.get('User-Agent') || '';
    let store = null;
    try {
      const origin = request.headers.get('Origin') || request.headers.get('Referer');
      if (origin) store = new URL(origin).host;
    } catch { /* malformed Origin is not worth failing a log over */ }

    const base = {
      at: started,
      question: String(body.query || ''),
      context: logContext(body),
      product: body.product || null,
      locale: body.locale || null,
      page: body.page || null,
      store,
      country: cf.country || null,
      region: cf.region || cf.regionCode || null,
      // Coarse on purpose. The useful question is whether answers should be
      // shorter on a phone, and that needs two buckets, not a UA string.
      device: /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
      // Every customer-facing sentence is written by EXPLAIN_MODEL. Recorded
      // so a change in answer quality can be attributed to a model change
      // rather than argued about.
      model: env.EXPLAIN_MODEL || null,
    };

    const type = res.headers.get('Content-Type') || '';

    if (type.includes('text/event-stream')) {
      // Tee rather than clone: the customer's copy must keep flowing while the
      // second branch is drained. Draining happens after the response is
      // returned, so nothing here delays a token reaching the screen.
      const [toClient, toLog] = res.body.tee();
      const drain = readOurStream(toLog, (text, tailPayload) => logExchange(env, {
        ...base,
        answer: text || (tailPayload && tailPayload.answer) || null,
        route: (tailPayload && tailPayload.route) || 'stream',
        intent: tailPayload && tailPayload.intent ? JSON.stringify(tailPayload.intent) : null,
        picks: picksOf(tailPayload),
        ms: Date.now() - started,
        fallback: tailPayload && tailPayload.fallback ? 1 : 0,
      }));
      if (ctx && ctx.waitUntil) ctx.waitUntil(drain);
      return new Response(toClient, { status: res.status, headers: res.headers });
    }

    /* JSON path. The escalation sentinel is resolved here, in the one place
       that already sees every JSON response, so no route has to remember to
       do it and a route added later cannot forget. The body is rebuilt rather
       than mutated, because a Response's body has already been serialised. */
    let payloadForLog = null;
    try {
      const cloned = await res.clone().json();
      if (cloned && typeof cloned.answer === 'string' && ESCALATE_RE.test(cloned.answer)) {
        const { answer, escalate } = extractEscalation(cloned.answer, {
          query: body.query, code: body.code, page: body.page,
          title: body.facts && body.facts.title,
        });
        const rebuilt = { ...cloned, answer, ...(cloned.explanation ? { explanation: answer } : {}), escalate };
        payloadForLog = rebuilt;
        res = new Response(JSON.stringify(rebuilt), { status: res.status, headers: res.headers });
      }
    } catch { /* not JSON, or unreadable: leave the response untouched */ }

    const finish = (async () => {
      let payload = payloadForLog || {};
      try { if (!payloadForLog) payload = await res.clone().json(); } catch { /* log what we have */ }
      await logExchange(env, {
        ...base,
        answer: payload.answer || null,
        /* `intent` is what the JSON path calls its branch — pairing, facts,
           brand, decline. The streaming path calls the same thing `route`.
           Reading only `route` here left the column empty for every non-
           streaming answer, which is most of them. */
        route: payload.route || payload.intent || null,
        intent: payload.intent ? JSON.stringify(payload.intent) : (payload.dish ? JSON.stringify({ dish: payload.dish }) : null),
        picks: picksOf(payload),
        ms: Date.now() - started,
        fallback: payload.fallback ? 1 : 0,
        error: payload.error || (res.status >= 400 ? `http ${res.status}` : null),
      });
    })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(finish);

    return res;
  },
};
