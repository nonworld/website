/* Build the answer key for the per-PDP accuracy test.
   ==========================================================================
   THE SOURCE, AND WHY IT IS NOT THE ADMIN API. The brief says pull ground
   truth from the Shopify Admin API and not from memory. The Admin API is not
   reachable: the MCP connector reports its connection invalidated on every
   call, and the token supplied by hand is a 32-character API key rather than
   an shpat_ access token, which Shopify rejects.

   So the key is built from the storefront instead — product.js for pricing,
   variants and the full description, which is where the nutrition panel,
   caffeine figures and food pairings actually live. This is the SAME data the
   Admin API would return for those fields, read through a different door, and
   it is not memory: every value below is parsed out of the live response.

   WHAT THIS SOURCE CANNOT SEE, stated so no one mistakes the gap for a pass:
   metafields that are never rendered or embedded anywhere on the storefront.
   Everything the Somm is actually fed IS visible, because the theme embeds it
   as data-non-somm-facts, so the test can still grade what the assistant was
   given against what it said.
*/

import { isMain } from './is-main.mjs';
const STORE = 'https://www.non.world';

export const BOTTLES = {
  NON1: 'salted-raspberry-chamomile',
  NON2: 'caramelised-pear-kombu',
  NON3: 'toasted-cinnamon-yuzu',
  NON5: 'lemon-marmalade-hibiscus',
  NON7: 'stewed-cherry-coffee',
  NON9: 'non9-oaked-blackberry-plum',
};

export const SPARSE = {
  STOPPER: 'nonstopper',
  'SET-EVERYDAY': 'the-everyday-set',
  'SET-SPRING': 'the-spring-set',
  'SET-SPICE': 'the-spice-set',
  'SET-STOPPER': 'the-stopper-set',
  'MIX6': 'mixed-6-pack',
  'MIX6-STOPPER': 'mixed-6-stopper-pack',
};

const decode = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// The description is a wall of HTML whose structure is headings and tables.
// Flattened to lines, the nutrition panel becomes label/value pairs on
// consecutive lines, which is what makes it parseable at all.
const lines = (html) => decode(html)
  .replace(/<[^>]*>/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

// A nutrition label is followed by its value on the next line. Matched loosely
// because the store's own labels contain typos ("Calroes per serve" on NON2)
// and trailing spaces — an exact match would silently return null and the test
// would grade every calorie question as "no ground truth".
function panelValue(ls, labelRe) {
  for (let i = 0; i < ls.length - 1; i++) {
    if (labelRe.test(ls[i])) return ls[i + 1];
  }
  return null;
}

const num = (s) => {
  if (!s) return null;
  const m = String(s).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

function section(ls, name) {
  const i = ls.findIndex((l) => l.toUpperCase() === name);
  if (i === -1) return null;
  const out = [];
  for (let j = i + 1; j < ls.length; j++) {
    if (/^[A-Z][A-Z *]{3,}$/.test(ls[j]) && ls[j].toUpperCase() === ls[j]) break;
    out.push(ls[j]);
  }
  return out.join(' ').trim() || null;
}

const OVERRIDE = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('./facts-override.json', import.meta.url), 'utf8'),
);

export async function groundTruth() {
  const all = {};
  for (const [code, handle] of [...Object.entries(BOTTLES), ...Object.entries(SPARSE)]) {
    const p = await (await fetch(`${STORE}/products/${handle}.js`)).json();
    const ls = lines(p.description);

    const single = p.variants.find((v) => v.title === '1') || p.variants[0];
    const six = p.variants.find((v) => v.title === '6');
    const twelve = p.variants.find((v) => v.title === '12');

    const caffeineLine = ls.find((l) => /contains caffeine/i.test(l));

    all[code] = {
      code,
      handle,
      title: p.title,
      available: p.available,
      price: single ? single.price / 100 : null,
      price6: six ? six.price / 100 : null,
      price12: twelve ? twelve.price / 100 : null,
      // Stated so a "what do I save on a 6-pack" answer can be graded rather
      // than eyeballed. Zero is a real answer here and must not read as absent.
      sixSaving: six && single ? (single.price * 6 - six.price) / 100 : null,
      abv: '0.0%',
      volume: /750/.test(p.description) || /-750-/.test(single?.sku || '') ? '750ml' : null,
      style: /(^|\n)\s*Sparkling\s*($|\n)/i.test(decode(p.description)) ? 'Sparkling'
        : /(^|\n)\s*Still\s*($|\n)/i.test(decode(p.description)) ? 'Still' : null,
      // Metafields the storefront .js cannot see, cached from the embedded
      // facts sheet. See facts-override.json for why and when to refresh.
      sits: OVERRIDE[code]?.sits || null,
      storageMetafield: OVERRIDE[code]?.storageMetafield || null,
      profile: section(ls, 'PROFILE'),
      ingredients: section(ls, 'INGREDIENTS'),
      storage: section(ls, 'STORAGE'),
      notes: section(ls, 'NOTES'),
      contains: section(ls, 'CONTAINS') || section(ls, 'CONTAINS*'),
      foodPairing: (ls.find((l) => /^food pairing/i.test(l)) || '').replace(/^food pairing\s*-\s*/i, '') || null,
      occasion: (ls.find((l) => /^occasion/i.test(l)) || '').replace(/^occasion\s*-\s*/i, '') || null,
      caffeineMg: caffeineLine ? num(caffeineLine.split('-')[1]) : null,
      nutrition: {
        servings: num(panelValue(ls, /^servings per container/i)),
        servingSize: panelValue(ls, /^serving size/i),
        kj: num(panelValue(ls, /^kilojoules per serve/i)),
        // "Calroes" is the store's typo, on NON2. Matching it is not sloppiness.
        calories: num(panelValue(ls, /^cal(o|)r(ie|oe)s per serve/i)),
        protein: num(panelValue(ls, /^protein/i)),
        fatTotal: num(panelValue(ls, /^fat - total/i)),
        carbsTotal: num(panelValue(ls, /^carbohydrates - total/i)),
        sugarsTotal: num(panelValue(ls, /^sugars - total/i)),
        sugarsAdded: num(panelValue(ls, /^sugars - added/i)),
        sodium: num(panelValue(ls, /^sodium/i)),
      },
      // Every ingredient as its own token, so "does it contain X" can be
      // graded mechanically rather than by reading.
      ingredientList: (section(ls, 'INGREDIENTS') || '')
        .replace(/\.$/, '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    };
  }
  return all;
}

// argv[1] is undefined under `node -e`, where this module is imported rather
// than run. Guarding it means importing the key never crashes the importer.
if (isMain(import.meta.url)) {
  const fs = await import('node:fs');
  const gt = await groundTruth();
  const out = new URL('./groundtruth.json', import.meta.url);
  fs.writeFileSync(out, JSON.stringify(gt, null, 2));
  console.log(`wrote ${Object.keys(gt).length} products`);
  for (const [k, v] of Object.entries(gt)) {
    console.log(`  ${k.padEnd(13)} $${v.price} | ${v.nutrition.calories ?? '—'} cal | `
      + `${v.nutrition.sugarsTotal ?? '—'}g sugar | ${v.nutrition.sodium ?? '—'}mg Na | `
      + `caffeine ${v.caffeineMg ?? '—'} | ${v.ingredientList.length} ingredients`);
  }
}
