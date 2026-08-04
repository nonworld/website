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

// Sized to the cooldown, not to forever. REVEAL_COOLDOWN_DAYS is 1, so the
// ledger only has to survive long enough to enforce a one-day rule and to
// re-serve the same code if the customer reloads. Seven days gives six days of
// margin for a clock skew or a support query, and nothing beyond that is doing
// any work — a 24-hour feature has no business holding an email for 13 months.
//
// If REVEAL_COOLDOWN_DAYS is ever raised, raise this with it: a cooldown longer
// than the ledger silently stops being enforced, because the key it checks has
// already expired.
const LEDGER_TTL = 60 * 60 * 24 * 7; // 7 days
const LOG_TTL = 60 * 60 * 24 * 30;     // 30 days of attempt history

/**
 * Disposable-mailbox domains. The email ledger is the primary defence, and it
 * is only as strong as the address being real — a throwaway inbox turns "one
 * per person" into "one per ten seconds".
 *
 * Deliberately a short static list rather than a package or a live lookup:
 * this runs on every reveal, a network call would put a third party in the
 * critical path of issuing a prize, and the long tail of these domains is not
 * worth the dependency. Add to it when a pattern shows up in the logs.
 */
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'sharklasers.com', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'mohmal.com',
  'spamgourmet.com', 'tempinbox.com', 'emailondeck.com', 'moakt.com',
  'tempr.email', 'discard.email', 'burnermail.io', 'anonaddy.me',
]);

/** Never log a raw address. A truncated hash is enough to spot one inbox
 *  hammering the endpoint without keeping a list of customer emails in KV. */
async function hashEmail(email) {
  const bytes = new TextEncoder().encode('non-lotto:' + email);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One key per attempt, 30-day TTL, listable by prefix. Not a metrics pipeline —
 * the point is being able to SEE a pattern forming rather than discovering it
 * when the pool is drained. Never awaited on the response path: a logging
 * failure must not cost a customer their prize.
 */
function logAttempt(env, ctx, record) {
  if (!env.LOTTO_KV) return;
  const key = `log:${record.at}:${record.emailHash}`;
  const write = env.LOTTO_KV.put(key, JSON.stringify(record), { expirationTtl: LOG_TTL })
    .catch((e) => console.error('[lotto] log write failed:', e.message));
  if (ctx && ctx.waitUntil) ctx.waitUntil(write);
}
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
  return (await codeStatus(env, code)).status === 'ACTIVE';
}

/* The same Admin lookup, returning what Shopify actually said rather than a
   boolean. codeIsLive answers "may I hand this out", which is the only thing
   the draw needs. This answers "what is the state of the pool", which is what
   you need when a code turns out not to exist, or exists and refuses to stack.
   One query, two callers, so the audit cannot drift from the live check.

   combinesWith is included because "the code did not apply" has two completely
   different causes that look identical to a customer: the code is inactive, or
   the code is fine and Shopify refused the combination. The second one is
   invisible from outside and cost us a live cart. */
async function codeStatus(env, code) {
  // No "unconfigured, so allow" branch. Missing credentials here would silently
  // downgrade the one guarantee this function exists to make — that the code
  // handed over actually works — and it would do it invisibly, on a Worker that
  // otherwise looks healthy. Absent config is caught by missingConfig() before
  // any draw happens.

  const query = `
    query CheckCode($code: String!) {
      codeDiscountNodeByCode(code: $code) {
        codeDiscount {
          __typename
          ... on DiscountCodeBasic {
            status
            combinesWith { orderDiscounts productDiscounts shippingDiscounts }
          }
          ... on DiscountCodeFreeShipping {
            status
            combinesWith { orderDiscounts productDiscounts shippingDiscounts }
          }
          ... on DiscountCodeBxgy {
            status
            combinesWith { orderDiscounts productDiscounts shippingDiscounts }
          }
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

  /* A GraphQL error is NOT "the code is inactive", and conflating the two is
     how this fails silently.

     Shopify answers a missing access scope with HTTP 200 and an `errors`
     array, with `data: null`. That sails past the res.ok check above; `node`
     then comes back undefined and the old code returned false — so a token
     without read_discounts reported every prize as dead, the draw skipped all
     six, and the customer was told the Lotto was closed. Verified 2026-08-02:
     all six pool codes read ACTIVE through the Admin API while the widget was
     returning closed.

     Throwing instead pushes it into the caller's catch, which logs the reason
     and still shows the honest closed state — same customer experience, but
     the cause appears in `wrangler tail` rather than being invisible. */
  if (data?.errors?.length) {
    const detail = data.errors.map((e) => e.message).join('; ');
    throw new Error(`shopify graphql: ${detail}`);
  }

  const node = data?.data?.codeDiscountNodeByCode;

  /* A null node means no discount with that code exists in the shop at all,
     which is a different fault from one that exists and is expired — the first
     is a typo or a code nobody ever created, the second is a date. Naming them
     separately is the whole point of this function. */
  if (!node) return { status: 'MISSING' };

  const d = node.codeDiscount || {};
  return {
    status: d.status || 'UNKNOWN',
    type: d.__typename,
    combinesWith: d.combinesWith,
  };
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
/* CODE_CHECK decides whether a prize code is verified against Shopify at the
   moment it is handed out.

   'live'    — the original behaviour. Every draw asks the Admin API whether
               that code is still ACTIVE, and a failure closes the shop rather
               than issuing something that might be dead.

   'trusted' — no Shopify call. The pool is taken as verified, and the date it
               was last checked is published on /health so the claim is
               falsifiable rather than assumed.

   'trusted' exists because Shopify stopped issuing static Admin API tokens:
   legacy custom apps could no longer be created after 1 January 2026, and an
   existing app's token cannot be revealed a second time. On this store the
   only route to a fresh token is rotating ZAP's, which breaks the Zapier
   automations running off it. The choice was a scratchie that never opens or
   one that trusts a pool checked by hand — this makes the second choice
   explicit, dated and reversible instead of silently degrading. */
function codeCheckMode(env) {
  return String(env.CODE_CHECK || 'live').toLowerCase() === 'trusted' ? 'trusted' : 'live';
}

function missingConfig(env) {
  const missing = [];
  if (!env.SHOPIFY_STORE) missing.push('SHOPIFY_STORE');
  // Only needed when we actually intend to call Shopify.
  if (codeCheckMode(env) === 'live' && !env.SHOPIFY_ADMIN_TOKEN) missing.push('SHOPIFY_ADMIN_TOKEN');
  if (!env.KLAVIYO_API_KEY) missing.push('KLAVIYO_API_KEY');
  if (!env.LOTTO_KV) missing.push('LOTTO_KV');
  return missing;
}

/* ------------------------------------------------------------ rate limit */

/**
 * Sliding window, not a fixed bucket.
 *
 * The counter this replaces reset on a wall-clock hour, so five attempts at
 * 10:59 and five more at 11:01 passed as ten in two minutes. Keeping the
 * timestamps and discarding anything older than the window closes that.
 *
 * This is a BACKSTOP against scripted farming, not the main gate — office wifi
 * and carrier NAT put a lot of real customers behind one address, which is why
 * the cap is generous and the email ledger does the actual enforcing.
 */
async function overRateLimit(env, ip) {
  if (!env.LOTTO_KV || !ip) return false;

  const key = `rl:${ip}`;
  const cap = Number(env.RATE_LIMIT_PER_HOUR || 6);
  const windowMs = RATE_TTL * 1000;
  const now = Date.now();

  let hits = [];
  try {
    hits = (await env.LOTTO_KV.get(key, 'json')) || [];
    if (!Array.isArray(hits)) hits = [];
  } catch (e) {
    hits = [];
  }

  hits = hits.filter((t) => now - t < windowMs);
  if (hits.length >= cap) return true;

  hits.push(now);
  await env.LOTTO_KV.put(key, JSON.stringify(hits), { expirationTtl: RATE_TTL });
  return false;
}

/**
 * Cloudflare Turnstile, verified server-side before any of the logic below
 * runs. Stopping a script here is cheaper than catching it after it has burned
 * a KV read and a Shopify call.
 *
 * Optional by design: with no TURNSTILE_SECRET set it is skipped entirely, so
 * it can be switched on later without a redeploy or a frontend change landing
 * first. Once the secret exists a missing token is a hard fail — a half-enabled
 * check that lets tokenless requests through is worse than none, because it
 * reads as protection.
 */
async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;

  try {
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', token);
    if (ip) body.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    // Turnstile unreachable. Fail OPEN here, deliberately: the email ledger and
    // the rate limit still stand, and blocking every reveal because a bot check
    // is down punishes customers for our outage.
    console.error('[lotto] turnstile check failed:', e.message);
    return true;
  }
}

/** The email ledger is only as strong as the address being real. */
function isDisposable(email) {
  const domain = email.split('@')[1] || '';
  return DISPOSABLE.has(domain.toLowerCase());
}

/* -------------------------------------------------------------- handler */

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const missing = missingConfig(env);

      /* `?deep=1` also proves the Shopify token WORKS, not merely that it is
         set. On 2026-08-03 this endpoint reported ok:true with nothing missing
         while every reveal returned closed, because the token was present and
         rejected — `shopify 401` in the tail. Presence and validity are not the
         same check, and the cheap one was quietly standing in for the other.

         Off by default: it costs an API call, and health gets polled. */
      const mode = codeCheckMode(env);
      let shopify;
      /* Probe regardless of mode. In trusted mode nothing reads the token, but
         you still need to know whether a newly pasted one is good BEFORE
         flipping CODE_CHECK back to live — otherwise the only way to find out
         is to open the shop and watch it close. */
      if (url.searchParams.get('deep') === '1' && env.SHOPIFY_ADMIN_TOKEN) {
        try {
          const probe = await fetch(
            `https://${env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
              },
              body: JSON.stringify({ query: '{ shop { name } }' }),
            },
          );
          if (!probe.ok) {
            // Shopify's body distinguishes a wrong value from a wrong store,
            // and "HTTP 401" alone sent us round the houses once already.
            const why = (await probe.text()).slice(0, 160);
            shopify = `token rejected: HTTP ${probe.status} — ${why}`;
          } else {
            const data = await probe.json();
            shopify = data?.errors?.length
              ? `token lacks scope: ${data.errors.map((e) => e.message).join('; ')}`
              : 'ok';
          }
        } catch (e) {
          shopify = `unreachable: ${e.message}`;
        }
      }

      /* Shape only, never the value: enough to tell a shpat_ access token from
         a shpss_ app secret, or to catch a stray newline in the paste. */
      let tokenShape;
      if (url.searchParams.get('deep') === '1' && env.SHOPIFY_ADMIN_TOKEN) {
        const t = env.SHOPIFY_ADMIN_TOKEN;
        tokenShape = {
          prefix: t.slice(0, 6),
          length: t.length,
          hasWhitespace: /\s/.test(t),
        };
      }

      /* `?codes=1` checks every prize in the pool, not just the token.
         CODE_CHECK is "trusted" in production, which means nothing verifies
         these codes on a draw — the pool is taken at its word, and the only
         record that it was ever true is a POOL_VERIFIED_AT date typed in by
         hand. That is fine as a runtime posture and useless as an assurance:
         a code deleted in Admin the day after that date fails silently, and
         the first person to find out is a customer holding a dead prize.

         So the assurance is made re-runnable. One curl reports every code's
         real state, and it works in trusted mode precisely because trusted
         mode is when you cannot see it any other way. */
      /* An unanswerable check must not read as a passed one.

         Both deep probes are guarded on the token being present, and when it
         is absent they simply omitted their key — so /health?deep=1&codes=1
         returned `ok: true` with no `shopify` and no `codes` on a Worker that
         has no Shopify token at all and therefore cannot verify a single
         thing. Asking the hardest question available and being told "ok" is
         worse than not asking: it launders "I could not look" into "I looked
         and it was fine". Found 2026-08-04, by asking it.

         Now the answer is the reason. */
      const wantsShopify = url.searchParams.get('deep') === '1'
        || url.searchParams.get('codes') === '1';
      const noToken = wantsShopify && !env.SHOPIFY_ADMIN_TOKEN;
      if (noToken) shopify = 'no SHOPIFY_ADMIN_TOKEN set — nothing can be verified';

      let codes;
      if (url.searchParams.get('codes') === '1' && env.SHOPIFY_ADMIN_TOKEN) {
        const pool = loadPool(env);
        codes = await Promise.all(pool.map(async (p) => {
          try {
            const s = await codeStatus(env, p.code);
            return { code: p.code, description: p.description, ...s };
          } catch (e) {
            // Reported per code rather than failing the whole report: one bad
            // lookup should not hide the five that answered.
            return { code: p.code, description: p.description, status: `error: ${e.message}` };
          }
        }));
      }

      return json({
        ok: missing.length === 0
          && (shopify === undefined || shopify === 'ok')
          && (codes === undefined || codes.every((c) => c.status === 'ACTIVE')),
        prizes: loadPool(env).length,
        ...(codes === undefined ? {} : { codes }),
        missing, // named explicitly, so a half-configured deploy is one curl away
        codeCheck: mode,
        ...(mode === 'trusted' ? { poolVerifiedAt: env.POOL_VERIFIED_AT || 'unrecorded' } : {}),
        ...(shopify === undefined ? {} : { shopify }),
        ...(tokenShape === undefined ? {} : { tokenShape }),
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
    const ip = request.headers.get('CF-Connecting-IP');

    // Checks run cheapest-first: shape, then disposable, then the bot check,
    // then KV. No point spending a KV read on a malformed address.
    if (!email) return json({ error: 'email is required' }, 400);
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ error: 'that does not look like an email address' }, 400);
    }

    const emailHash = await hashEmail(email);
    const log = (outcome, extra) =>
      logAttempt(env, ctx, { at: Date.now(), emailHash, ip: ip || null, outcome, ...(extra || {}) });

    if (isDisposable(email)) {
      log('rejected-disposable');
      return json({ error: 'please use a permanent email address' }, 400);
    }

    if (!(await turnstileOk(env, body.turnstileToken, ip))) {
      log('rejected-bot');
      return json({ error: 'could not verify that request' }, 403);
    }

    if (await overRateLimit(env, ip)) {
      log('rate-limited');
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

      // Once-ever by default; set REVEAL_COOLDOWN_DAYS to allow repeat entries
      // after a period. Parameterised rather than chosen for you — the two
      // behaviours differ only in whether an old entry is treated as spent.
      const cooldownDays = Number(env.REVEAL_COOLDOWN_DAYS || 0);
      const expired =
        cooldownDays > 0 && seen && seen.at &&
        Date.now() - seen.at > cooldownDays * 86400000;

      if (seen && seen.code && !expired) {
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
        log('already-issued', { code: prize.code });
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
      if (codeCheckMode(env) === 'trusted') {
        live = true;
        prize = candidate;
        break;
      }
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

    if (!prize) {
      log('closed-no-live-code');
      return json({ error: 'closed' }, 503);
    }

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

    log('issued', { code: prize.code, emailed });
    return json({
      code: prize.code,
      description: prize.description,
      terms: prize.terms || '',
      alreadyRevealed: false,
      emailed,
    });
  },
};
