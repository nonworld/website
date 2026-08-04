/* Somm log -> Google Sheet.
   ==========================================================================
   D1 is where the log lives, because the log needs to be queried. The sheet
   is where it gets read, because that is where Aaron reads things. This moves
   rows from the first to the second and does nothing else.

   APPEND-ONLY, WATERMARKED. It never rewrites the sheet and never re-sends a
   row: the highest exported id is kept in D1 and every run starts above it.
   The alternative — clear and rewrite — would destroy any column a human had
   added beside the data, which is the first thing anyone does to a sheet.

   Auth is a service account, not OAuth. There is no human in this loop to
   consent to anything, and a refresh token belonging to a person would break
   the day that person left. The key signs a JWT, Google exchanges it for a
   one-hour access token, and nothing is stored between runs. */

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* A PEM private key is base64 DER wrapped in a header, a footer and hard line
   breaks. WebCrypto wants the DER. Note the \n handling: the key arrives
   inside JSON, so its newlines are the two characters backslash-n unless the
   JSON parser has already turned them into real ones — both forms appear in
   the wild depending on how the file was pasted, so both are handled. */
async function importKey(pem) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----[A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    // One hour is Google's maximum. Short-lived by design: nothing here is
    // cached, so a revoked key stops working within the hour rather than
    // whenever a Worker happens to restart.
    exp: now + 3600,
    iat: now,
  })));
  const signed = `${header}.${claim}`;
  const key = await importKey(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signed));

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signed}.${b64url(sig)}`,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`google token: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.access_token;
}

/* The tab is identified by gid in the URL Aaron shared, and the values API
   addresses tabs by NAME. Resolving it per run rather than hardcoding a name
   means renaming the tab in the sheet does not silently send every future row
   to a tab that no longer exists — or, worse, create one. */
async function tabName(token, sheetId, gid) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`google sheets get: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  const want = String(gid);
  const found = (data.sheets || []).find((s) => String(s.properties.sheetId) === want);
  if (!found) {
    const have = (data.sheets || []).map((s) => `${s.properties.title}=${s.properties.sheetId}`).join(', ');
    throw new Error(`no tab with gid ${gid}; sheet has ${have}`);
  }
  return found.properties.title;
}

const HEADER = [
  'id', 'when (UTC)', 'question', 'answer', 'route', 'picks', 'context',
  'product', 'page', 'store', 'country', 'region', 'device', 'locale',
  'model', 'ms', 'fallback', 'error',
];

function toRow(r) {
  return [
    r.id,
    new Date(r.at).toISOString().replace('T', ' ').slice(0, 19),
    r.question || '', r.answer || '', r.route || '', r.picks || '',
    r.context || '', r.product || '', r.page || '', r.store || '',
    r.country || '', r.region || '', r.device || '', r.locale || '',
    r.model || '', r.ms == null ? '' : r.ms,
    r.fallback ? 'yes' : '', r.error || '',
  ];
}

export async function exportToSheet(env) {
  if (!env.GOOGLE_SA_KEY) return { skipped: 'no GOOGLE_SA_KEY' };
  if (!env.SHEET_ID) return { skipped: 'no SHEET_ID' };
  if (!env.SOMM_LOG) return { skipped: 'no SOMM_LOG binding' };

  const sa = JSON.parse(env.GOOGLE_SA_KEY);

  // The watermark lives in D1 beside the data it describes, so a Worker
  // redeploy or a KV outage cannot lose track of what has already been sent.
  await env.SOMM_LOG.prepare(
    'CREATE TABLE IF NOT EXISTS somm_export (k TEXT PRIMARY KEY, v INTEGER)',
  ).run();
  const mark = await env.SOMM_LOG.prepare(
    "SELECT v FROM somm_export WHERE k = 'last_id'",
  ).first();
  const since = mark ? mark.v : 0;

  const { results } = await env.SOMM_LOG.prepare(
    // Bounded per run. A first export against a long backlog would otherwise
    // build one request larger than the API accepts and fail on every retry;
    // capped, it drains over successive runs and always makes progress.
    'SELECT * FROM somm_log WHERE id > ? ORDER BY id LIMIT 500',
  ).bind(since).all();

  if (!results.length) return { appended: 0, since };

  const token = await accessToken(sa);
  const tab = await tabName(token, env.SHEET_ID, env.SHEET_GID || '0');

  // Write the header once, on the first export only, so a sheet someone has
  // already labelled by hand is not given a second header mid-column.
  const rows = since === 0 ? [HEADER, ...results.map(toRow)] : results.map(toRow);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/`
    + `${encodeURIComponent(tab)}!A1:append`
    // RAW, not USER_ENTERED. USER_ENTERED parses what it is given, so a
    // question beginning with = becomes a formula and a question beginning
    // with + or - becomes a broken one. Customer text is data, never input.
    + '?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    },
  );
  const out = await res.json();
  if (!res.ok) throw new Error(`google sheets append: ${res.status} ${JSON.stringify(out).slice(0, 300)}`);

  const last = results[results.length - 1].id;
  // Only after the append has been accepted. Advancing the watermark first
  // would lose every row in a run that failed at the network.
  await env.SOMM_LOG.prepare(
    "INSERT INTO somm_export (k, v) VALUES ('last_id', ?) "
    + 'ON CONFLICT(k) DO UPDATE SET v = excluded.v',
  ).bind(last).run();

  return { appended: results.length, from: since + 1, to: last, tab };
}
