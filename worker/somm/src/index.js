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

import { PRODUCTS, rankProducts } from './scoring-engine.js';

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
  const attempt = async (extraInstruction) => {
    const text = await claude(env, {
      model: env.EXTRACT_MODEL || 'claude-haiku-4-5-20251001',
      maxTokens: 400,
      system: EXTRACT_SYSTEM + (extraInstruction || ''),
      messages: [{ role: 'user', content: query }],
    });
    return validateDish(parseJSONish(text));
  };

  const first = await attempt();
  if (first) return first;

  const second = await attempt(
    '\n\nYour previous response was not valid. Return ONLY the JSON object. ' +
      'Every field is required. All numbers must be between 0 and 5.'
  );
  if (second) return second;

  throw new Error('extraction failed twice');
}

/* -------------------------------------------------- step 3: explanation */

async function explain(env, { query, product, reasons, score }) {
  return claude(env, {
    model: env.EXPLAIN_MODEL || 'claude-sonnet-5',
    maxTokens: 150,
    system: EXPLAIN_SYSTEM,
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

/* ------------------------------------------------------------- fallback */

// Never fail in the customer's face. The Mixed 6 is the honest answer when we
// cannot compute one: it covers every course.
function fallbackResponse(reason) {
  return {
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

    // On a product page the theme sends the bottle's own code. Bias toward it
    // only if it is genuinely competitive — never override a better match.
    const context = body.code || null;

    let dish;
    try {
      dish = await extractDish(env, query);
    } catch (e) {
      return json(fallbackResponse('extraction'), 200);
    }

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
      });
    } catch (e) {
      return json(fallbackResponse('explanation'), 200);
    }

    const includeAlternative = runnerUp && top.score - runnerUp.score <= 15;

    const picks = [top.productId];
    if (includeAlternative) picks.push(runnerUp.productId);

    return json({
      // documented shape
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
