/**
 * NON Lotto — reveal API
 *
 *   POST /lotto/reveal   { sessionId, email }
 *   →                    { code, description, alreadyRevealed, emailed }
 *
 * Email is required BEFORE the code is issued. The frontend also gates the
 * scratch interaction on a valid-looking address, but that is a courtesy: the
 * check here is the one that counts, because a client-side gate is a
 * suggestion, not a control.
 *
 * ── Why one reveal per EMAIL, not per session ─────────────────────────────
 * Session-only tracking is trivially defeated: clear cookies, open a private
 * window, re-enter the same address, farm codes. The ledger is keyed on the
 * lowercased email. A repeat caller gets the SAME code back with
 * alreadyRevealed: true, and it is re-sent, because the likeliest reason
 * someone asks twice is that they lost the first one.
 *
 * ── Why codes come from a fixed pool ──────────────────────────────────────
 * Every code is a real Shopify discount created in advance. Minting codes on
 * the fly means a customer can be handed something that fails at checkout,
 * which turns a prize into a support ticket. Before returning a code the
 * Worker asks Shopify whether it still exists and is ACTIVE; a code that has
 * been deactivated or has burned its own usage limit is skipped and the next
 * one is drawn.
 *
 * ── Odds ──────────────────────────────────────────────────────────────────
 * Weighted random with replacement, no per-code caps. Two customers can win
 * the same prize. This keeps the published odds table true forever — capping
 * would make the real odds drift away from the printed ones as codes ran out.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// Deliberately permissive. This is a spam gate, not an address validator —
// the only authority on whether an address works is whether the email lands.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LEDGER_TTL = 60 * 60 * 24 * 400; // ~13 months
const RATE_TTL = 60 * 60;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
}

/* ------------------------------------------------------------------ pool */

function loadPool(env) {
  try {
    const pool = JSON.parse(env.LOTTO_POOL || '[]');
    return pool.filter((p) => p && p.code && Number(p.weight) > 0);
  } catch (e) {
    return [];
  }
}

// Draw without replacement from a working copy, so a failed Shopify check can
// retry against the remaining prizes rather than looping on the same one.
function drawWeighted(pool) {
  const total = pool.reduce((sum, p) => sum + Number(p.weight), 0);
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (const prize of pool) {
    r -= Number(prize.weight);
    if (r < 0) return prize;
  }
  return pool[pool.length - 1];
}

/* --------------------------------------------------------------- shopify */

// A code is only handed out if Shopify says it is live right now. This is the
// difference between "we think this works" and "this works".
async function codeIsLive(env, code) {
  // No "unconfigured, so allow" branch. Missing credentials here would silently
  // downgrade the one guarantee this function exists to make — that the code
  // handed over actually works — and it would do it invisibly, on a Worker that
  // otherwise looks healthy. Absent config is caught by missingConfig() before
  // any draw happens.

  const query = `
    query CheckCode($code: String!) {
      codeDiscountNodeByCode(code: $code) {
        codeDiscount {
          ... on DiscountCodeBasic { status }
          ... on DiscountCodeFreeShipping { status }
          ... on DiscountCodeBxgy { status }
        }
      }
    }`;

  const res = await fetch(`https://${env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables: { code } }),
  });

  if (!res.ok) throw new Error(`shopify ${res.status}`);

  const data = await res.json();
  const node = data?.data?.codeDiscountNodeByCode;
  return node?.codeDiscount?.status === 'ACTIVE';
}

/* --------------------------------------------------------------- klaviyo */

// Two calls: the event (what a Flow triggers on, and what carries the code),
// then the subscription (the consent record). Order matters — if the
// subscribe fails we still have the event and can recover the address, but
// the reverse loses the prize context entirely.
async function toKlaviyo(env, { email, prize, sessionId, alreadyRevealed }) {

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Klaviyo-API-Key ${env.KLAVIYO_API_KEY}`,
    revision: '2024-10-15',
  };

  const event = await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          metric: { data: { type: 'metric', attributes: { name: env.KLAVIYO_EVENT || 'Scratched NON Lotto' } } },
          profile: {
            data: {
              type: 'profile',
              attributes: {
                email,
                properties: { lotto_entrant: true, source: 'NON Lotto' },
              },
            },
          },
          properties: {
            prize_title: prize.description,
            discount_code: prize.code,
            prize_terms: prize.terms || '',
            already_revealed: !!alreadyRevealed,
            session_id: sessionId || null,
          },
          // Idempotent on the email, so a repeat reveal re-sends rather than
          // firing a second, duplicate event into the Flow.
          unique_id: `lotto:${email}`,
        },
      },
    }),
  });

  if (env.KLAVIYO_LIST_ID) {
    await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email,
                    properties: { lotto_entrant: true },
                    subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
                  },
                },
              ],
            },
          },
          relationships: { list: { data: { type: 'list', id: env.KLAVIYO_LIST_ID } } },
        },
      }),
    }).catch(() => {}); // consent record is best-effort; the event is the one that matters
  }

  return event.ok;
}

/* ------------------------------------------------------------ config gate */

/**
 * A deploy without secrets is a broken deploy, not a degraded one.
 *
 * The tempting behaviour is to carry on: skip the Shopify check, skip the
 * email, still hand over a code. That fails in the worst possible way — the
 * endpoint returns 200, the card reveals a prize, and nobody finds out that the
 * code was never verified and the email never sent until a customer complains.
 *
 * The email is not a nice-to-have here either. It is the entire consideration
 * for the address; a reveal that does not send one has taken something and
 * given nothing back.
 *
 * So: missing config is a closed shop. The theme already renders that state
 * honestly, and /health says exactly which piece is absent.
 */
function missingConfig(env) {
  const missing = [];
  if (!env.SHOPIFY_STORE) missing.push('SHOPIFY_STORE');
  if (!env.SHOPIFY_ADMIN_TOKEN) missing.push('SHOPIFY_ADMIN_TOKEN');
  if (!env.KLAVIYO_API_KEY) missing.push('KLAVIYO_API_KEY');
  if (!env.LOTTO_KV) missing.push('LOTTO_KV');
  return missing;
}

/* ------------------------------------------------------------ rate limit */

async function overRateLimit(env, ip) {
  if (!env.LOTTO_KV || !ip) return false;
  const key = `rl:${ip}`;
  const used = Number((await env.LOTTO_KV.get(key)) || 0);
  const cap = Number(env.RATE_LIMIT_PER_HOUR || 6);
  if (used >= cap) return true;
  await env.LOTTO_KV.put(key, String(used + 1), { expirationTtl: RATE_TTL });
  return false;
}

/* -------------------------------------------------------------- handler */

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const missing = missingConfig(env);
      return json({
        ok: missing.length === 0,
        prizes: loadPool(env).length,
        missing, // named explicitly, so a half-configured deploy is one curl away
      });
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (url.pathname !== '/lotto/reveal') return json({ error: 'not found' }, 404);

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'invalid JSON body' }, 400);
    }

    const email = String(body.email || '').trim().toLowerCase();
    const sessionId = body.sessionId || null;

    if (!email) return json({ error: 'email is required' }, 400);
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ error: 'that does not look like an email address' }, 400);
    }

    const ip = request.headers.get('CF-Connecting-IP');
    if (await overRateLimit(env, ip)) {
      return json({ error: 'too many reveals, try again later' }, 429);
    }

    const pool = loadPool(env);
    if (!pool.length) return json({ error: 'closed' }, 503);

    const missing = missingConfig(env);
    if (missing.length) {
      console.error('[lotto] refusing to draw, missing config:', missing.join(', '));
      return json({ error: 'closed' }, 503);
    }

    /* ---- already revealed: same code, re-sent ---------------------------- */
    if (env.LOTTO_KV) {
      const seen = await env.LOTTO_KV.get(`email:${email}`, 'json');
      if (seen && seen.code) {
        const prize = pool.find((p) => p.code === seen.code) || {
          code: seen.code,
          description: seen.description || 'Your NON Lotto prize',
          terms: '',
        };
        let emailed = false;
        try {
          emailed = await toKlaviyo(env, { email, prize, sessionId, alreadyRevealed: true });
        } catch (e) {
          console.error('[lotto] klaviyo resend failed:', e.message);
        }
        return json({
          code: prize.code,
          description: prize.description,
          terms: prize.terms || '',
          alreadyRevealed: true,
          emailed,
        });
      }
    }

    /* ---- draw, validating each candidate against Shopify ----------------- */
    let remaining = pool.slice();
    let prize = null;

    while (remaining.length) {
      const candidate = drawWeighted(remaining);
      if (!candidate) break;

      let live;
      try {
        live = await codeIsLive(env, candidate.code);
      } catch (e) {
        // Shopify unreachable. Do not hand out an unverified code and do not
        // 500 at the customer — the theme already has an honest closed state.
        console.error('[lotto] shopify check failed:', e.message);
        return json({ error: 'closed' }, 503);
      }

      if (live) {
        prize = candidate;
        break;
      }

      console.error(`[lotto] skipping inactive code: ${candidate.code}`);
      remaining = remaining.filter((p) => p.code !== candidate.code);
    }

    if (!prize) return json({ error: 'closed' }, 503);

    if (env.LOTTO_KV) {
      await env.LOTTO_KV.put(
        `email:${email}`,
        JSON.stringify({ code: prize.code, description: prize.description, at: Date.now() }),
        { expirationTtl: LEDGER_TTL }
      );
    }

    let emailed = false;
    try {
      emailed = await toKlaviyo(env, { email, prize, sessionId, alreadyRevealed: false });
    } catch (e) {
      // Never block the reveal on the email. The customer has the code on
      // screen; the failure is logged so it can be chased.
      console.error('[lotto] klaviyo send failed:', e.message);
    }

    return json({
      code: prize.code,
      description: prize.description,
      terms: prize.terms || '',
      alreadyRevealed: false,
      emailed,
    });
  },
};
