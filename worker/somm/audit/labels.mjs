/* The label vocabulary, and the join back to the log.
   ==========================================================================
   ONE DEFINITION, IMPORTED BY EVERYTHING. The sheet's dropdowns and this file
   have to agree or the counts are meaningless, and the way that fails is
   quiet: a labeller types "incorrect", the code looks for "wrong", the row is
   skipped, and the accuracy rate improves because a bad answer stopped being
   counted. Validation below is therefore LOUD — an unknown value is an error,
   never a shrug.

   WHY TWO AXES RATHER THAN ONE VERDICT.

   The 2026-08-07 review of 524 logged questions found two failures that a
   single "good/bad" column would have merged, and they need opposite fixes:

     - 48 of 52 pricing questions were answered "the price and availability
       are on the bottle's own page", on a page printing the price two inches
       away. Every word TRUE. Completely useless. Cause: a stale prompt rule
       contradicting a newer one.

     - "is it dry?" came back as a confident pairing recommendation for cured
       meat and hard cheese. Not false exactly — it answered a DIFFERENT
       question. Cause: a dead code path falling through to the pairing engine.

   Collapse those into "bad" and you cannot tell a prompt contradiction from a
   dead code path, which is the only thing the label was for.

   ACCURACY asks: is what it said true?
   USEFULNESS asks: did it answer what was asked?

   A row can be `correct` + `dodged` (the pricing case) or `n/a` +
   `wrong-question` (the fallback case). Both are failures. They are not the
   same failure.
*/

/* `unsupported` is deliberately distinct from `wrong`. The Somm is instructed
   to use ONLY the spec sheet it is given, so a claim that happens to be true
   in the world but is not in the sheet is still a rule breach — and it is the
   breach that precedes a fabricated figure. Grading it as `correct` because it
   is not false trains the exact behaviour the prompt forbids. */
export const ACCURACY = ['correct', 'wrong', 'unsupported', 'n/a'];

/* `partial` and `dodged` are separated because they fail differently.
   `partial` answered some of it and stopped. `dodged` answered none of it and
   pointed elsewhere — which reads as evasion and is a conversion problem, not
   a knowledge problem. */
export const USEFULNESS = ['answered', 'partial', 'dodged', 'wrong-question'];

/* Columns the labels tab must carry. `id` joins to the log.

   NOTE ON `id`: the log tab currently renders ids as DATES (0 shows as
   1899-12-31, 1 as 1900-01-01) because a date number-format is applied to the
   column. The values are integers; only the display is wrong. Format that
   column as plain number before labelling, or every join key is a date string
   and this parser's coercion below is doing load-bearing work it should not
   have to. */
export const COLUMNS = [
  'id', 'accuracy', 'usefulness', 'better_answer', 'must_contain', 'code',
  'note', 'labelled_by', 'labelled_at',
];

/* `must_contain` and `code` are OPTIONAL, and both exist because the first run
   of this harness failed three fixtures and none of them was a Somm fault.

   must_contain — the builder derives required figures from `better_answer`,
   and that over-constrains the moment a correction is generous. Asked "how
   much is one bottle", the Somm answered "$30, and it's in stock", which is
   right; the fixture failed it for omitting $150.00, a six-pack price the
   correction had helpfully volunteered. Demanding it would have tested the
   opposite of the "answer the question asked, then stop" rule. So a derived
   figure list is now a WEAK assertion (at least one must appear, which still
   catches a fallback or a fabrication), and `must_contain` is how a labeller
   says "this exact figure is the point of the question" — a semicolon-
   separated list, authoritative when set.

   code — which bottle the question was about. It should come from the log and
   cannot: `product` is empty on all 524 rows and `picks` is empty on precisely
   the fallback rows most worth testing, because the fallback path never sets
   it. Without a bottle the replay sends no facts and the Somm answers about
   the whole range, so the fixture tests something the customer never asked.
   Until the Worker logs it, the labeller supplies it. */

/* ------------------------------------------------------------------- csv */

/* A real parser rather than split(','). Both exports quote fields containing
   commas, and `better_answer` will contain them constantly — it is a sentence.
   Answers also contain newlines, which is why this walks characters instead of
   lines: splitting on \n first would tear one row into several and every one
   of them would fail validation for a reason that has nothing to do with the
   label. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } // escaped quote
        else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Sheets exports a header row; find it rather than assuming row 0. The log tab
   carries an unrelated review header above the real one, which is exactly the
   kind of thing that makes "the first row is the header" wrong. */
function toObjects(rows, required) {
  const at = rows.findIndex((r) => required.every((k) => r.includes(k)));
  if (at === -1) {
    throw new Error(`no header row containing: ${required.join(', ')}`);
  }
  const head = rows[at].map((h) => h.trim());
  return rows.slice(at + 1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* The id column may arrive as an integer, or as the date Sheets renders it as.
   Both are accepted and normalised to a number, because refusing the date form
   would block labelling on a formatting fix — but the date form is reported by
   `readLabels` so it gets fixed rather than lived with.

   Day zero is 1899-12-31: Sheets' epoch is 1899-12-30, and id 0 renders as
   1899-12-31 because the export adds a day the way Sheets' own date maths
   does. Derived from the data (id 0 -> 1899-12-31, id 523 -> 1901-06-07,
   which is 523 days later) rather than from the documentation. */
const SHEET_EPOCH = Date.UTC(1899, 11, 31);

export function coerceId(raw) {
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return { id: Number(s), wasDate: false };
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return { id: Math.round((ms - SHEET_EPOCH) / 86400000), wasDate: true };
  }
  return { id: null, wasDate: false };
}

/* ---------------------------------------------------------------- public */

export function readLabels(csvText) {
  const objs = toObjects(parseCsv(csvText), ['id', 'accuracy', 'usefulness']);
  const out = [];
  const problems = [];
  let dateFormatted = 0;

  objs.forEach((o, i) => {
    const line = i + 2; // 1-indexed, past the header
    const { id, wasDate } = coerceId(o.id);
    if (wasDate) dateFormatted += 1;

    if (id === null) { problems.push(`row ${line}: unreadable id ${JSON.stringify(o.id)}`); return; }

    // A row with neither axis set is simply unlabelled, not broken. Skip it
    // silently — a half-filled sheet is the normal state of a sheet.
    if (!o.accuracy && !o.usefulness) return;

    if (o.accuracy && !ACCURACY.includes(o.accuracy)) {
      problems.push(`row ${line}: accuracy ${JSON.stringify(o.accuracy)} not one of ${ACCURACY.join('|')}`);
      return;
    }
    if (o.usefulness && !USEFULNESS.includes(o.usefulness)) {
      problems.push(`row ${line}: usefulness ${JSON.stringify(o.usefulness)} not one of ${USEFULNESS.join('|')}`);
      return;
    }

    out.push({
      id,
      accuracy: o.accuracy || null,
      usefulness: o.usefulness || null,
      better: o.better_answer || '',
      mustContain: (o.must_contain || '').split(';').map((s) => s.trim()).filter(Boolean),
      code: (o.code || '').trim().toUpperCase(),
      note: o.note || '',
      by: o.labelled_by || '',
      at: o.labelled_at || '',
    });
  });

  return { labels: out, problems, dateFormatted };
}

export function readLog(csvText) {
  const objs = toObjects(parseCsv(csvText), ['id', 'question', 'answer']);
  const out = [];
  objs.forEach((o) => {
    const { id } = coerceId(o.id);
    if (id === null) return;
    out.push({
      id,
      when: o['when (UTC)'] || '',
      question: o.question || '',
      answer: o.answer || '',
      route: o.route || '',
      picks: o.picks || '',
      context: o.context || '',
      page: o.page || '',
      locale: o.locale || 'en',
    });
  });
  return out;
}

/* Inner join. A label whose id is not in the log is reported rather than
   dropped: it means the two exports came from different points in time, and
   silently ignoring it would make a labelling session look smaller than it
   was. */
export function join(labels, log) {
  const byId = new Map(log.map((r) => [r.id, r]));
  const rows = [];
  const orphans = [];
  labels.forEach((l) => {
    const r = byId.get(l.id);
    if (!r) { orphans.push(l.id); return; }
    rows.push({ ...r, label: l });
  });
  return { rows, orphans };
}

export function summarise(rows) {
  const count = (key, vocab) => Object.fromEntries(
    vocab.map((v) => [v, rows.filter((r) => r.label[key] === v).length]),
  );
  return {
    labelled: rows.length,
    accuracy: count('accuracy', ACCURACY),
    usefulness: count('usefulness', USEFULNESS),
    withCorrection: rows.filter((r) => r.label.better).length,
    byRoute: rows.reduce((a, r) => { a[r.route || '(none)'] = (a[r.route || '(none)'] || 0) + 1; return a; }, {}),
  };
}
