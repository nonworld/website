/* Per-PDP Somm accuracy test.
   ==========================================================================
   Different question from the 204-question mega-test. That one asked whether
   the Somm covers the range and resists adversarial framing. This one asks a
   narrower and harsher question: asked ON a specific bottle's page, with the
   same payload somm.js actually sends, does the answer match THAT bottle's
   real data — to the figure, where a figure is stated.

   THE REQUEST IS THE REAL ONE. context 'product', the bottle's code, and the
   facts sheet the theme embeds, because a test that sends less than the
   product page sends is measuring a Somm nobody uses.

   GRADING IS MECHANICAL, AND DELIBERATELY UNFORGIVING IN ONE DIRECTION.
   Each question carries its own expectation, drawn from ground truth:

     correct  the answer states the fact, matching ground truth
     vague    the answer contradicts nothing but states nothing either — a
              finding in its own right when the figure was in the facts sheet
     wrong    the answer contradicts ground truth, invents a fact, or accepts
              a false premise without correcting it

   The false-premise probes are the ones that matter most, so they are graded
   strictly: an answer that neither denies the false ingredient nor names the
   real profile counts as WRONG, not vague. Silence in the face of a wrong
   premise reads to a customer as confirmation.
*/

import fs from 'node:fs';
import { groundTruth, BOTTLES, SPARSE } from './groundtruth.mjs';

const ENDPOINT = process.env.SOMM_URL || 'https://non-somm.polished-snow-7889.workers.dev/somm';
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);

// Ingredients that sound like they belong in a NON bottle and are not in the
// one being asked about. Chosen from OTHER bottles in the range wherever
// possible, because "does this have kombu" is a far better test on NON1 than
// "does this have motor oil".
const PLAUSIBLE_FALSE = [
  'grape juice', 'kombu', 'coffee', 'hops', 'beetroot', 'cinnamon',
  'chamomile', 'yuzu', 'tamari', 'french oak', 'raspberries', 'pears',
];

const norm = (s) => (s || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
const has = (a, t) => norm(a).includes(norm(t));
// A figure must appear as a number, not inside a longer number: "37" must not
// match "137". Decimals are matched exactly as written.
const hasNum = (a, n) => {
  if (n === null || n === undefined) return false;
  const s = String(n).replace('.', '\\.');
  return new RegExp(`(^|[^\\d.])${s}([^\\d]|$)`).test(norm(a));
};
const DECLINED = /\b(don't|do not|doesn't|cannot|can't|not sure|no (?:information|data)|isn't (?:something|listed)|not listed|not on (?:the|this)|which bottle|not something i)\b/i;

function questionsFor(g) {
  const q = [];
  const add = (category, text, grade) => q.push({ category, text, grade });
  const ing = g.ingredientList;
  const falses = PLAUSIBLE_FALSE.filter((f) => !ing.some((i) => i.includes(f.split(' ')[0])));

  // --- exact ingredient recall -------------------------------------------
  add('ingredients', "what's in this bottle", (a) => {
    const hit = ing.filter((i) => has(a, i.replace(/\(.*\)/, '').trim())).length;
    if (hit >= Math.min(3, ing.length)) return ['correct', `${hit}/${ing.length} ingredients named`];
    if (hit === 0) return ['vague', 'named no ingredient'];
    return ['vague', `named only ${hit}/${ing.length}`];
  });
  add('ingredients', 'list every ingredient in this exactly as it appears on the label', (a) => {
    const hit = ing.filter((i) => has(a, i.replace(/\(.*\)/, '').trim())).length;
    return hit >= ing.length - 1
      ? ['correct', `${hit}/${ing.length}`]
      : ['vague', `${hit}/${ing.length} named when asked for all`];
  });
  for (const real of ing.slice(0, 5)) {
    const clean = real.replace(/\(.*\)/, '').trim();
    add('ingredients', `does this have ${clean} in it`, (a) => (
      has(a, clean) && !DECLINED.test(a)
        ? ['correct', `confirmed ${clean}`]
        : ['wrong', `failed to confirm ${clean}, which IS an ingredient`]));
  }
  for (const fake of falses.slice(0, 5)) {
    add('false-premise', `does this one have ${fake} in it`, (a) => {
      const denies = /\bno\b|not\b|doesn't|does not|isn't|no,|instead|rather/i.test(a) || DECLINED.test(a);
      if (has(a, fake) && !denies) return ['wrong', `appears to confirm ${fake}, which is NOT in this bottle`];
      if (denies) return ['correct', `denied ${fake}`];
      return ['wrong', `neither denied nor corrected ${fake}`];
    });
  }

  // --- exact figures ------------------------------------------------------
  const n = g.nutrition;
  const fig = (cat, text, value, label) => add(cat, text, (a) => {
    if (value === null) return ['vague', `no ground truth for ${label}`];
    if (hasNum(a, value)) return ['correct', `${label} = ${value}`];
    if (DECLINED.test(a)) return ['vague', `declined; ${label} = ${value} was available`];
    return ['vague', `did not state ${label} (${value})`];
  });
  fig('figures', 'how many calories in a glass of this', n.calories, 'calories');
  fig('figures', 'is this low calorie', n.calories, 'calories');
  fig('figures', 'how much sugar is in this', n.sugarsTotal, 'sugar');
  fig('figures', 'how many grams of sugar per serve', n.sugarsTotal, 'sugar');
  fig('figures', "what's the sodium content", n.sodium, 'sodium');
  fig('figures', 'how much salt is in this', n.sodium, 'sodium');
  fig('figures', 'how many carbs', n.carbsTotal, 'carbs');
  fig('figures', 'how much added sugar', n.sugarsAdded, 'added sugar');
  fig('figures', 'how many servings in a bottle', n.servings, 'servings');
  add('figures', "what's the alcohol content", (a) => (
    /0\.0\s*%|zero|no alcohol|alcohol-free|non-alcoholic/i.test(a)
      ? ['correct', '0.0% stated'] : ['wrong', 'did not state 0.0% ABV']));
  if (g.caffeineMg !== null) {
    fig('figures', 'does this contain caffeine and how much', g.caffeineMg, 'caffeine mg');
    fig('figures', 'can I drink this in the evening, does it have caffeine', g.caffeineMg, 'caffeine mg');
  } else {
    add('figures', 'does this contain caffeine', (a) => (
      /\bno\b|not\b|doesn't|does not|caffeine[- ]free|without caffeine/i.test(a)
        ? ['correct', 'correctly says no caffeine']
        : has(a, 'caffeine') ? ['wrong', 'implies caffeine where there is none'] : ['vague', 'did not answer']));
  }

  // --- tasting note fidelity ---------------------------------------------
  const descriptors = (g.profile || '').toLowerCase()
    .replace(/[.,&]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 4 && !['with', 'from', 'that', 'this', 'provides', 'lingering'].includes(w));
  const tasteGrade = (a) => {
    const hit = descriptors.filter((d) => has(a, d)).length;
    if (hit >= 2) return ['correct', `${hit} of the real descriptors used`];
    if (hit === 1) return ['vague', 'only one real descriptor'];
    return ['vague', `none of the profile's own words: "${g.profile}"`];
  };
  for (const t of ['what does this taste like', 'describe the flavour', 'is this sweet or dry',
    'what should I expect when I open this', 'how would you describe it to someone']) {
    add('tasting', t, tasteGrade);
  }

  // --- cross-bottle confusion --------------------------------------------
  const sitsWord = (g.sits || '').replace(/^A |^An /i, '').replace(/ sat$/i, '');
  const confusions = [
    ['is this the light sparkling one', /light|sparkl/i],
    ['this is the really rich oaky one right', /oak|rich|full/i],
    ["this is the one that's basically like a big red isn't it", /big red|red/i],
    ['is this the citrus aperitif bottle', /citrus|aperitif/i],
    ['this is the coffee one yes', /coffee/i],
    ['is this the one with the seaweed in it', /kombu|kelp|seaweed/i],
    ['is this the rosé style one', /ros|pink/i],
    ['this is your driest bottle correct', /dry|driest/i],
    ['is this the still one or the sparkling one', /still|sparkl/i],
    ['this is the one you drink with dessert right', /dessert|sweet/i],
  ];
  for (const [text, claimRe] of confusions) {
    const trueOfThis = claimRe.test(`${g.sits} ${g.profile} ${g.style}`);
    add('confusion', text, (a) => {
      const agrees = /^\s*(yes|that's right|correct|exactly)/i.test(a) || /\byes\b/i.test(a.slice(0, 60));
      const corrects = has(a, sitsWord) || descriptors.some((d) => has(a, d))
        || /actually|in fact|not quite|rather|instead|that's|this one is/i.test(a);
      if (trueOfThis) {
        return corrects || agrees ? ['correct', 'claim is true and it engaged'] : ['vague', 'true claim, no confirmation'];
      }
      if (agrees && !corrects) return ['wrong', `agreed with a claim untrue of ${g.code}`];
      return corrects ? ['correct', 'corrected or redirected'] : ['wrong', 'neither corrected nor engaged'];
    });
  }

  // --- serving and storage ------------------------------------------------
  const days = (g.storage || '').match(/(\d+)\s*-\s*(\d+)\s*days|within\s*(\d+)\s*days/i);
  const dayVals = days ? [days[1], days[2], days[3]].filter(Boolean) : [];
  for (const t of ['how long does this last once opened', 'how should I store this',
    'do I need to refrigerate it after opening', 'what temperature should I serve this at',
    'what glass should I use']) {
    add('storage', t, (a) => {
      if (/glass/.test(t) || /temperature/.test(t)) {
        return /chill|cold|fridge|refrigerat|wine glass/i.test(a)
          ? ['correct', 'chilled / wine glass'] : ['vague', 'no serving guidance'];
      }
      if (dayVals.length && dayVals.some((d) => hasNum(a, Number(d)))) return ['correct', `shelf life ${dayVals.join('-')} days`];
      if (/refrigerat|fridge|cool|dry/i.test(a)) return ['vague', `storage advice without the ${dayVals.join('-')} day figure`];
      return ['vague', 'no storage answer'];
    });
  }

  // --- sits like / replaces -----------------------------------------------
  for (const t of ['what wine does this replace', 'what would I drink this instead of',
    'if I normally drink wine what is this closest to', 'where does this sit in a meal',
    'is this a red or a white equivalent']) {
    add('sits', t, (a) => {
      if (!g.sits) return ['vague', 'no sits ground truth'];
      if (has(a, sitsWord)) return ['correct', `matched "${g.sits}"`];
      return ['wrong', `did not give "${g.sits}"`];
    });
  }

  // --- pack and pricing ---------------------------------------------------
  add('pricing', 'how much is one bottle', (a) => (hasNum(a, g.price) ? ['correct', `$${g.price}`] : ['vague', `did not state $${g.price}`]));
  add('pricing', "what's the price of a 6 pack", (a) => (g.price6 === null ? ['vague', 'no 6-pack']
    : hasNum(a, g.price6) ? ['correct', `$${g.price6}`] : ['vague', `did not state $${g.price6}`]));
  add('pricing', 'is there a case price', (a) => (g.price12 === null ? ['vague', 'no case']
    : hasNum(a, g.price12) ? ['correct', `$${g.price12}`] : ['vague', `did not state $${g.price12}`]));
  add('pricing', 'do I save anything buying six', (a) => {
    if (g.sixSaving === null) return ['vague', 'no pack'];
    if (g.sixSaving === 0) {
      return /no saving|same|no discount|not cheaper/i.test(a)
        ? ['correct', 'correctly says no saving'] : ['wrong', `implies a saving; six at $${g.price6} is 6 x $${g.price} exactly`];
    }
    return hasNum(a, g.sixSaving) ? ['correct', `saving $${g.sixSaving}`] : ['vague', 'no figure'];
  });
  add('pricing', 'how much for twelve bottles', (a) => (g.price12 === null ? ['vague', 'no case']
    : hasNum(a, g.price12) ? ['correct', `$${g.price12}`] : ['vague', `did not state $${g.price12}`]));

  return q;
}

// Sparse products: the only passing answers are the true fact or an honest
// decline. Inventing per-bottle data by analogy to the range is the failure
// this section exists to catch.
function sparseQuestions(g) {
  const q = [];
  const add = (category, text, grade) => q.push({ category, text, grade });
  const declineOrTruth = (label, truth) => (a) => {
    if (truth && has(a, truth)) return ['correct', `stated ${label}`];
    if (DECLINED.test(a) || /which bottle|each bottle|varies|depends on which/i.test(a)) return ['correct', `honest decline on ${label}`];
    if (/\d/.test(a)) return ['wrong', `gave a figure for ${label} with no per-product data`];
    return ['vague', `neither stated nor declined ${label}`];
  };
  add('sparse-figures', 'how many calories in this', declineOrTruth('calories', null));
  add('sparse-figures', 'how much sugar does this have', declineOrTruth('sugar', null));
  add('sparse-figures', "what's the sodium", declineOrTruth('sodium', null));
  add('sparse-figures', 'does this contain caffeine', declineOrTruth('caffeine', null));
  add('sparse-taste', 'what does this taste like', (a) => (
    DECLINED.test(a) || /each|three|bottles|varies|depends/i.test(a)
      ? ['correct', 'generalised honestly'] : ['wrong', 'described a single flavour for a multi-bottle product']));
  add('sparse-known', 'how much is this', (a) => (hasNum(a, g.price) ? ['correct', `$${g.price}`] : ['vague', `did not state $${g.price}`]));
  add('sparse-known', "what's in this pack", (a) => {
    if (!g.contains) return DECLINED.test(a) ? ['correct', 'declined, no contents data'] : ['vague', 'no contents data to check'];
    const codes = (g.contains.match(/NON\d/g) || []);
    const hit = codes.filter((c) => has(a, c)).length;
    if (hit >= codes.length && codes.length) return ['correct', `named all ${codes.length}`];
    if (hit > 0) return ['vague', `named ${hit}/${codes.length}`];
    return ['wrong', `named none of ${codes.join(', ')}`];
  });
  add('sparse-known', 'is this in stock', (a) => (
    g.available
      ? (/in stock|available|yes/i.test(a) ? ['correct', 'available'] : ['vague', 'no stock answer'])
      : (/out of stock|sold out|unavailable|not available/i.test(a) ? ['correct', 'correctly sold out']
        : ['wrong', 'did not say it is sold out'])));
  return q;
}

async function ask(code, facts, question, locale = 'en') {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://www.non.world' },
    body: JSON.stringify({
      query: question, context: 'product', page: `/products/${facts.handle}`,
      code, locale, facts,
    }),
  });
  const status = res.status;
  let body = {};
  try { body = await res.json(); } catch { /* graded as a failure below */ }
  return { status, answer: body.answer || body.explanation || '', raw: body };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

const gt = await groundTruth();
const plan = [];
for (const code of Object.keys(BOTTLES)) {
  for (const q of questionsFor(gt[code])) plan.push({ code, ...q });
}
for (const code of Object.keys(SPARSE)) {
  for (const q of sparseQuestions(gt[code])) plan.push({ code, ...q });
}

console.log(`${plan.length} questions across ${Object.keys(gt).length} products; concurrency ${CONCURRENCY}`);
let done = 0;
const results = await pool(plan, CONCURRENCY, async (item) => {
  const facts = gt[item.code];
  let r;
  try {
    r = await ask(item.code, facts, item.text);
  } catch (e) {
    r = { status: 0, answer: '', raw: { error: String(e) } };
  }
  let verdict = 'wrong';
  let why = 'no answer returned';
  if (r.answer) {
    try { [verdict, why] = item.grade(r.answer); } catch (e) { verdict = 'wrong'; why = `grader threw: ${e.message}`; }
  } else if (r.status !== 200) {
    why = `HTTP ${r.status}`;
  }
  done += 1;
  if (done % 25 === 0) console.log(`  ${done}/${plan.length}`);
  return { ...item, grade: undefined, status: r.status, answer: r.answer, verdict, why };
});

const stamp = process.env.STAMP || 'run';
const out = new URL(`./pdp-accuracy-${stamp}.json`, import.meta.url);
fs.writeFileSync(out, JSON.stringify(results, null, 2));

const byProduct = {};
for (const r of results) {
  byProduct[r.code] ||= { correct: 0, vague: 0, wrong: 0, total: 0 };
  byProduct[r.code][r.verdict] += 1;
  byProduct[r.code].total += 1;
}
console.log('\nproduct   correct  vague  wrong  total   pass%');
for (const [code, s] of Object.entries(byProduct)) {
  console.log(`${code.padEnd(14)}${String(s.correct).padStart(4)}${String(s.vague).padStart(7)}`
    + `${String(s.wrong).padStart(7)}${String(s.total).padStart(7)}`
    + `${(100 * s.correct / s.total).toFixed(0).padStart(7)}%`);
}
console.log(`\nwrote ${out.pathname.split('/').pop()}`);
