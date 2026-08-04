/* NON watch — the thing that notices.
   ==========================================================================
   Everything else in this repo is built to fail loudly at the moment it fails.
   That is worth nothing if nobody is looking, and nobody is looking at 2am on
   a Sunday, which is when a Shopify token expires or an Anthropic key gets
   rotated. This runs every fifteen minutes and says so.

   THREE RULES, each one earned:

   1. Alert on TRANSITIONS, not on state. A check that posts every time it
      finds something broken posts ninety-six times a day about one broken
      thing, and the ninety-seventh message is the one nobody reads. Alerts
      fire when a check changes: ok -> failing, and failing -> ok. The recovery
      message matters as much as the alarm — an alert with no all-clear leaves
      you not knowing whether it is still broken.

   2. A DAILY DIGEST regardless. Silence has two causes: nothing is wrong, or
      the monitor is dead. Those are indistinguishable from the outside, and
      the second one is how a monitored system quietly becomes an unmonitored
      one. One message a day, even when everything is fine, is what makes
      silence mean something.

   3. NO CHANNEL IS ITSELF A FAILURE. If SLACK_WEBHOOK is unset this Worker
      can see everything and tell no one, which is the exact failure mode it
      exists to prevent. It refuses to report healthy in that state, and says
      why, so a half-configured monitor cannot pass for a working one.
*/

/* Prefers the service binding and falls back to the URL. The binding is the
   correct mechanism — see wrangler.toml — but keeping the fallback means this
   Worker still works if it is ever run somewhere the bindings do not exist,
   and the fallback is honest about which one answered. */
async function probe(env, binding, url, path) {
  if (env[binding]) return env[binding].fetch(new Request(`https://internal${path}`));
  return fetch(`${url}${path}`);
}

const CHECKS = [
  {
    id: 'somm',
    label: 'Somm Worker',
    async run(env) {
      const r = await probe(env, 'SOMM_SVC', env.SOMM_URL, '/health');
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const d = await r.json();
      return d.ok ? { ok: true, detail: `${d.products} products` }
        : { ok: false, detail: JSON.stringify(d).slice(0, 160) };
    },
  },
  {
    id: 'lotto',
    label: 'Lotto Worker',
    async run(env) {
      const r = await probe(env, 'LOTTO_SVC', env.LOTTO_URL, '/health');
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const d = await r.json();
      return d.ok ? { ok: true, detail: `${d.prizes} prizes, ${d.codeCheck}` }
        : { ok: false, detail: `missing: ${(d.missing || []).join(', ') || 'unknown'}` };
    },
  },
  {
    id: 'store',
    label: 'Storefront',
    async run(env) {
      const r = await fetch(env.STORE_URL, { headers: { 'User-Agent': 'non-watch' } });
      return r.ok ? { ok: true, detail: `HTTP ${r.status}` }
        : { ok: false, detail: `HTTP ${r.status}` };
    },
  },
  {
    id: 'somm_errors',
    label: 'Somm error rate',
    /* Reads the log rather than the health endpoint, because a Worker that
       answers /health perfectly while returning a fallback to every customer
       is up by every measure except the one that matters. */
    async run(env) {
      if (!env.SOMM_LOG) return { ok: true, detail: 'no log binding, skipped' };
      const since = Date.now() - 60 * 60 * 1000;
      const row = await env.SOMM_LOG.prepare(
        `SELECT count(*) AS n,
                sum(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errs,
                sum(fallback) AS fbs
           FROM somm_log WHERE at > ?`,
      ).bind(since).first();
      const n = row?.n || 0;
      // No traffic is not a failure. Asserting health from an empty sample is
      // how a dead site reports green.
      if (n === 0) return { ok: true, detail: 'no questions in the last hour' };
      const bad = (row.errs || 0) + (row.fbs || 0);
      const pct = Math.round((bad / n) * 100);
      return { ok: pct < 20, detail: `${bad}/${n} degraded (${pct}%) in the last hour` };
    },
  },
  {
    id: 'export',
    label: 'Sheet export',
    /* Staleness, not success. The export can return 200 forever while its
       watermark sits still, and the sheet silently stops growing. */
    async run(env) {
      if (!env.SOMM_LOG) return { ok: true, detail: 'no log binding, skipped' };
      const head = await env.SOMM_LOG.prepare('SELECT max(id) AS m FROM somm_log').first();
      const mark = await env.SOMM_LOG.prepare(
        "SELECT v FROM somm_export WHERE k = 'last_id'",
      ).first().catch(() => null);
      const behind = (head?.m || 0) - (mark?.v || 0);
      // The export runs hourly and this runs every fifteen minutes, so a small
      // backlog is normal. 600 is two full batches — that is not lag, that is
      // stopped.
      return { ok: behind < 600, detail: `${behind} rows behind` };
    },
  },
];

/* DIRECT TO SLACK, NOT VIA NORI.
   ==========================================================================
   The obvious wiring was to hand these alerts to Nori, which already has a
   Slack bot and already talks to Aaron. It is the wrong shape: routing an
   alert through a service makes that service a single point of failure for
   its own alarm, so the message telling you Nori is down is the one message
   Nori cannot send. Same bot token, same destination, no shared fate.

   It also sidesteps Nori's outbound kill switch, which is OFF on purpose
   since the reporting layer was cleared — an operational alarm is not a
   proactive report and should not be gated behind the same flag, in either
   direction.

   DMs, resolved from email at send time. Hardcoded user ids rot silently when
   someone is re-invited; an address is the thing Aaron actually typed. The
   resolved ids are cached so the lookup is not repeated every quarter hour,
   and the cache is keyed by address so changing ALERT_EMAILS invalidates
   nothing else. */
async function slackUserId(env, email) {
  const cacheKey = `slack:${email}`;
  const cached = await env.SOMM_LOG.prepare(
    'SELECT v FROM watch_state WHERE k = ?',
  ).bind(cacheKey).first().catch(() => null);
  if (cached && cached.v) return cached.v;

  const r = await fetch('https://slack.com/api/users.lookupByEmail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ email }),
  });
  const d = await r.json();
  if (!d.ok || !d.user) {
    console.error(`[watch] slack lookup ${email}: ${d.error}`);
    return null;
  }
  await setState(env, cacheKey, d.user.id);
  return d.user.id;
}

async function notify(env, text) {
  let sent = 0;

  if (env.SLACK_BOT_TOKEN) {
    const emails = (env.ALERT_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
    for (const email of emails) {
      try {
        const id = await slackUserId(env, email);
        if (!id) continue;
        const r = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({ channel: id, text, unfurl_links: false }),
        });
        const d = await r.json();
        // Slack answers a refused post with HTTP 200 and ok:false, so res.ok
        // alone would count every failure as a delivery.
        if (d.ok) sent += 1;
        else console.error(`[watch] slack post to ${email}: ${d.error}`);
      } catch (e) {
        console.error('[watch] slack:', e && e.message ? e.message : e);
      }
    }
  }

  if (!sent && env.SLACK_WEBHOOK) {
    try {
      const r = await fetch(env.SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (r.ok) sent += 1;
    } catch (e) {
      console.error('[watch] webhook:', e && e.message ? e.message : e);
    }
  }

  return sent > 0;
}

async function state(env) {
  await env.SOMM_LOG.prepare(
    'CREATE TABLE IF NOT EXISTS watch_state (k TEXT PRIMARY KEY, v TEXT)',
  ).run();
  const { results } = await env.SOMM_LOG.prepare('SELECT k, v FROM watch_state').all();
  return Object.fromEntries(results.map((r) => [r.k, r.v]));
}

async function setState(env, k, v) {
  await env.SOMM_LOG.prepare(
    'INSERT INTO watch_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
  ).bind(k, String(v)).run();
}

export async function sweep(env, { force } = {}) {
  const results = [];
  for (const c of CHECKS) {
    try {
      const r = await c.run(env);
      results.push({ id: c.id, label: c.label, ...r });
    } catch (e) {
      // A check that throws is a failing check, not a skipped one. Swallowing
      // it here would make an unreachable dependency look healthy.
      results.push({ id: c.id, label: c.label, ok: false, detail: `check threw: ${e && e.message ? e.message : e}` });
    }
  }

  /* Configured means a token AND someone to send to. A bot token with an
     empty recipient list is the same silence as no token at all, and it is
     the easier of the two to leave behind by accident. */
  const recipients = (env.ALERT_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
  const channel = (env.SLACK_BOT_TOKEN && recipients.length > 0) || !!env.SLACK_WEBHOOK;
  if (!channel) {
    results.push({
      id: 'channel',
      label: 'Alert channel',
      ok: false,
      detail: env.SLACK_BOT_TOKEN
        ? 'SLACK_BOT_TOKEN is set but ALERT_EMAILS is empty — nobody would be told'
        : 'no SLACK_BOT_TOKEN or SLACK_WEBHOOK — this monitor can see everything and tell no one',
    });
  } else {
    results.push({
      id: 'channel',
      label: 'Alert channel',
      ok: true,
      detail: recipients.length ? `DM to ${recipients.join(', ')}` : 'webhook',
    });
  }

  const prev = await state(env);
  const changed = [];
  for (const r of results) {
    const was = prev[`check:${r.id}`];
    const now = r.ok ? 'ok' : 'fail';
    if (was !== undefined && was !== now) changed.push({ ...r, was, now });
    await setState(env, `check:${r.id}`, now);
  }

  const failing = results.filter((r) => !r.ok);

  // Transitions only, so one broken thing is one message rather than ninety-six.
  if (changed.length) {
    const lines = changed.map((c) => (c.now === 'fail'
      ? `:red_circle: *${c.label}* has started failing — ${c.detail}`
      : `:large_green_circle: *${c.label}* has recovered — ${c.detail}`));
    await notify(env, `NON watch\n${lines.join('\n')}`);
  }

  // And a heartbeat, so silence is evidence rather than an assumption.
  const today = new Date().toISOString().slice(0, 10);
  if (force || prev['digest:day'] !== today) {
    const hour = new Date().getUTCHours();
    // 22:00 UTC is 08:00 AEST, which is when Aaron would want to read it.
    if (force || hour >= 22) {
      const body = results
        .map((r) => `${r.ok ? ':white_check_mark:' : ':x:'} ${r.label} — ${r.detail}`)
        .join('\n');
      await notify(env, `NON watch — daily check\n${body}`);
      await setState(env, 'digest:day', today);
    }
  }

  await setState(env, 'last_sweep', Date.now());
  return { ok: failing.length === 0, checked: results.length, failing, results };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sweep(env).then((r) => {
      console.log('[watch]', JSON.stringify({ ok: r.ok, failing: r.failing.map((f) => f.id) }));
    }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Open, and deliberately so: it exposes no customer data, and a status
    // page you need a token to read is a status page nobody reads.
    if (url.pathname === '/status') {
      const s = await state(env);
      const last = Number(s.last_sweep || 0);
      const age = last ? Date.now() - last : null;
      return new Response(JSON.stringify({
        // A monitor that has not run in an hour is itself the outage.
        ok: age !== null && age < 60 * 60 * 1000
          && Object.entries(s).filter(([k]) => k.startsWith('check:')).every(([, v]) => v === 'ok'),
        lastSweep: last ? new Date(last).toISOString() : null,
        minutesAgo: age === null ? null : Math.round(age / 60000),
        checks: Object.fromEntries(
          Object.entries(s).filter(([k]) => k.startsWith('check:'))
            .map(([k, v]) => [k.slice(6), v]),
        ),
      }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/sweep' && request.method === 'POST') {
      return new Response(JSON.stringify(await sweep(env, { force: url.searchParams.get('digest') === '1' }), null, 2),
        { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('non-watch', { status: 200 });
  },
};
