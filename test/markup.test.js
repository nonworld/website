/**
 * THE THEME SIDE OF THE SOMM REPAIR.
 *
 * somm-sheet.test.js proves the controller behaves against a fixture. This
 * proves the fixture is the theme: that the Liquid still emits the hooks that
 * test assumes, that the retired component has not grown back, and that the two
 * surfaces which were never part of this repair are byte-for-byte what they
 * were before it.
 *
 * Static reads only — no Liquid engine, no network. A regex over source is a
 * blunt instrument, and it is the right one here: every assertion below is
 * about a literal string the renderer must find, so a literal string is what is
 * checked for.
 *
 *   node test/markup.test.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const snippet = read('snippets/non-somm-form.liquid');
const hero = read('sections/hero-somm.liquid');
const pdp = read('sections/main-product.liquid');
const css = read('assets/theme.css');
const controller = read('assets/somm-sheet.js');

let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ------------------------------------------------- the shared-sheet hook */

test('the shared-sheet hook is emitted by the snippet and the hero, and by nothing else', () => {
  const HOOK = 'data-non-somm-sheet-form';
  assert.ok(snippet.includes(HOOK), 'the snippet does not emit the hook');
  assert.ok(hero.includes(HOOK), 'the hero does not carry the hook');

  /* Anything else carrying it would be silently adopted by the shared sheet. */
  const dirs = ['sections', 'snippets', 'layout', 'templates'];
  const carriers = [];
  for (const dir of dirs) {
    for (const f of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, f);
      const src = fs.readFileSync(f, 'utf8');
      /* The comment prose in main-product.liquid mentions it; only real
         attribute positions count, which is what the leading space or newline
         plus no surrounding backticks approximates. */
      if (new RegExp(`^\\s*${HOOK}\\b|<[^>]*\\s${HOOK}[\\s>]`, 'm').test(src)) carriers.push(rel);
    }
  }
  assert.deepEqual(
    carriers.sort(),
    ['sections/hero-somm.liquid', 'snippets/non-somm-form.liquid'],
    `unexpected carriers of ${HOOK}`
  );
});

test('the controller binds the explicit hook, not the .non-somm class', () => {
  assert.ok(controller.includes("querySelectorAll('[data-non-somm-sheet-form]')"));
  assert.ok(
    !/querySelectorAll\(['"]\.non-somm['"]\)|querySelector\(['"]\.non-somm['"]\)/.test(controller),
    'the controller selects .non-somm directly — that is the pairing and stockists forms too'
  );
});

test('the snippet does not carry somm.js’s inline-answer hook', () => {
  /* somm.js:944 calls Somm() on every [data-non-somm]. A shared-sheet form
     carrying it would preventDefault twice and ask twice. */
  assert.ok(
    !/^\s*data-non-somm\s*$/m.test(snippet.replace(/\{%-?\s*comment[\s\S]*?endcomment\s*-?%\}/g, '')),
    'the snippet emits data-non-somm — somm.js will bind an inline controller to it'
  );
});

/* ----------------------------------------------------------- the surfaces */

test('the hero keeps every hook and control it had', () => {
  for (const needle of [
    'data-non-somm-hero',
    'data-non-somm-hero-input',
    'class="non-somm"',
    'class="non-somm__bar"',
    'class="non-somm__input"',
    'type="submit"',
    'class="non-somm__seeds"',
    'class="non-somm__seed"',
    'data-somm-surface="homepage_hero"',
    'data-somm-context="home"'
  ]) {
    assert.ok(hero.includes(needle), `the hero lost ${needle}`);
  }
});

test('the PDP renders the canonical snippet with the full contract', () => {
  assert.ok(pdp.includes("render 'non-somm-form'"), 'the PDP does not render the snippet');
  for (const param of [
    "surface: 'product_entry'",
    "context: 'product'",
    "modifier: 'non-somm--pdp'",
    'uid: section.id',
    'label: pdp_somm_label',
    'placeholder: section.settings.somm_placeholder',
    'submit_label: pdp_somm_submit',
    'chips: pdp_chips',
    'product: product',
    'code: code'
  ]) {
    assert.ok(pdp.includes(param), `the PDP does not pass ${param}`);
  }
  assert.ok(pdp.includes('somm_pdp_label }} {{ code }}?'),
    'the dynamic "Considering NON1?" label is gone');
});

test('the snippet emits a real form, a real input and a real submit button', () => {
  assert.ok(/^<form$/m.test(snippet), 'the entry is not a <form>');
  assert.ok(snippet.includes('type="search"'));
  assert.ok(snippet.includes('<button type="submit" class="non-somm__submit">'));
  assert.ok(snippet.includes('id="somm-q-{{ somm_uid }}"'));
  assert.ok(snippet.includes('for="somm-q-{{ somm_uid }}"'),
    'the label does not point at the input');
});

test('the snippet carries the whole bottle, on the form and on every chip', () => {
  for (const attr of [
    'data-somm-product="{{ product.id }}"',
    'data-somm-variant="{{ somm_variant.id }}"',
    'data-somm-product-price="{{ somm_variant.price | money }}"',
    'data-somm-product-available="{{ somm_variant.available }}"'
  ]) {
    assert.equal(
      snippet.split(attr).length - 1, 2,
      `${attr} should appear twice — once on the form, once on the chips`
    );
  }
  assert.ok(snippet.includes('data-non-somm-open'), 'chips cannot open the sheet');
  assert.ok(snippet.includes('data-somm-prompt="{{ chip_text | escape }}"'));
});

test('the variant-sync marker still rides on a product-context form', () => {
  assert.ok(snippet.includes("{%- if somm_context == 'product' %} data-non-somm-pdp{% endif -%}"),
    'product.js:62 has nothing to write the live variant onto');
});

test('every somm input id on a page is distinct by construction', () => {
  /* Three id prefixes, one per surface, each suffixed with something unique to
     the instance. Two Somms sharing an id gives one of them a label pointing at
     the other's field. */
  assert.ok(snippet.includes('somm-q-{{ somm_uid }}'));
  assert.ok(hero.includes('somm-hero-{{ section.id }}'));
  assert.ok(read('sections/pairing-tool.liquid').includes('pair-q-{{ section.id }}'));
});

/* ------------------------------------------------------- the retirement */

test('the .non-somm-entry component is gone from markup and stylesheet', () => {
  const live = [];
  for (const dir of ['sections', 'snippets', 'layout', 'templates']) {
    for (const f of walk(path.join(ROOT, dir))) {
      const src = stripLiquidComments(fs.readFileSync(f, 'utf8'));
      if (/non-somm-entry/.test(src)) live.push(path.relative(ROOT, f));
    }
  }
  assert.deepEqual(live, [], `.non-somm-entry still rendered in ${live.join(', ')}`);
  assert.ok(!/non-somm-entry/.test(stripCssComments(css)),
    '.non-somm-entry still has CSS rules');
});

test('the retired component’s child classes and its fake arrow are gone', () => {
  const src = stripCssComments(css);
  for (const dead of [
    '__ph', '__go'
  ]) {
    assert.ok(!src.includes('.non-somm-entry' + dead), `.non-somm-entry${dead} survives`);
  }
  /* Scoped to the two Somm surfaces. `&rarr;` is a perfectly good arrow
     elsewhere on the site — it is only a defect here, where it stood in for a
     submit button that could not be pressed and could not be tabbed to. */
  for (const rel of ['sections/main-product.liquid', 'snippets/non-somm-form.liquid']) {
    assert.ok(!stripLiquidComments(read(rel)).includes('&rarr;'),
      `${rel} still draws the fake arrow trigger`);
  }
});

test('the alignment overrides that collapsed the grid are gone', () => {
  const src = stripCssComments(css);
  /* Only inside a Somm rule. `justify-items: start` is correct on the process
     infographic's row and has nothing to do with this. */
  const sommRules = [...src.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter((m) => /\.non-somm/.test(m[1]))
    .map((m) => m[2]);
  assert.ok(!sommRules.some((b) => /justify-items:\s*start/.test(b)),
    'justify-items: start survives on a Somm rule — it sizes every grid item to max-content');
  /* The property is still READ, with the canonical track as its default — that
     is the sanctioned way to vary the track without a second
     grid-template-columns declaration, which check 6b forbids. What must not
     exist is anything SETTING it: `--non-somm-cols: minmax(0, 1fr)` is how the
     orb's column was deleted on both surfaces at once. */
  assert.ok(!/--non-somm-cols\s*:/.test(src),
    'a rule sets --non-somm-cols — that is how the orb lost its column');
  assert.ok(!/\.non-hero \.non-somm\.non-somm/.test(src),
    'the doubled-specificity hero override survives');
});

test('the column track is declared exactly once, on .non-somm', () => {
  /* preflight check 6b enforces this too. It is repeated here because the
     failure it prevents — a 96px input and chips stacked one word wide — is
     what this whole repair was about. */
  const rules = [...stripCssComments(css).matchAll(/([^{}]*)\{([^{}]*grid-template-columns[^{}]*)\}/g)]
    .filter((m) => /\.non-somm(?![-\w])/.test(m[1].replace(/\s+/g, ' ')));
  assert.equal(rules.length, 1, `grid-template-columns declared on .non-somm ${rules.length} times`);
  assert.ok(rules[0][2].includes('96px minmax(0, 1fr)'), 'the orb has lost its column');
});

test('the PDP modifier sets outer spacing and nothing else', () => {
  const m = stripCssComments(css).match(/\.non-somm--pdp\s*\{([^}]*)\}/);
  assert.ok(m, '.non-somm--pdp has no rule');
  const props = m[1].split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);
  assert.deepEqual(props, ['padding'],
    `.non-somm--pdp sets ${props.join(', ')} — a modifier may set outer spacing only`);
});


test('a Somm chip cannot shrink on a phone — resolved through the real cascade', () => {
  /* THE DEFECT THIS EXISTS FOR, seen on a real iPhone on staging: every chip on
     every Somm surface rendered its text out through its own border and across
     the next chip. Unreadable, on the homepage, the PDP, pairing and stockists
     at once.

     It was not a value that was wrong, it was a SPECIFICITY that was wrong, and
     that is why reading either rule on its own made it look fine.
     `.non-somm .non-somm__seed` sets `flex: 0 1 auto` — correct where written,
     because the row wrapped there. The mobile block later switches the row to
     nowrap + horizontal scroll and sets `white-space: nowrap` on the chip, and
     its `flex: none` was written as `.non-somm__seed`: 0,1,0 against 0,2,0, so
     it lost regardless of order or media query. A chip that cannot wrap and may
     still shrink puts its words outside itself.

     So this does not grep for a declaration. It resolves the cascade the way a
     browser does — every rule that matches a chip, ordered by specificity then
     source order — and asserts the winner. Any future rule that reintroduces
     shrink at higher specificity fails here, wherever it is written. */
  const chipSelectors = [
    '.non-somm__seed',
    '.non-somm .non-somm__seed',
    '.non-sommbox .non-somm__seed'
  ];

  const winner = resolve(css, 'flex-shrink', chipSelectors, 400);
  assert.ok(winner, 'nothing sets flex-shrink on a chip at phone width');
  assert.equal(winner.value, '0',
    `at 400px a chip resolves to flex-shrink: ${winner.value} (from \`${winner.selector}\`). ` +
    'It carries white-space: nowrap, so shrinking renders its text through its own border.');

  /* And the pair has to stay a pair: shrink 0 is only safe because the row
     scrolls instead of wrapping. */
  const wrap = resolve(css, 'flex-wrap', ['.non-somm__seeds', '.non-somm .non-somm__seeds'], 400);
  assert.equal(wrap && wrap.value, 'nowrap');
  const overflow = resolve(css, 'overflow-x', ['.non-somm__seeds'], 400);
  assert.equal(overflow && overflow.value, 'auto',
    'the chip row neither wraps nor scrolls — the chips have nowhere to go');
});

/* ------------------------------------------- what this repair must not touch */

test('the pairing tool is byte-identical to the published branch point', () => {
  assertUnchanged('sections/pairing-tool.liquid');
});

test('the stockists section is byte-identical to the published branch point', () => {
  assertUnchanged('sections/stockists.liquid');
});

test('somm.js is untouched — the inline answer path is not part of this repair', () => {
  assertUnchanged('assets/somm.js');
});

test('the pairing and stockists forms still carry their own hooks', () => {
  assert.ok(read('sections/pairing-tool.liquid').includes('data-non-somm data-somm-context="pairing"'));
  assert.ok(read('sections/stockists.liquid').includes('data-non-venue-search'));
});

/* -------------------------------------------------------------- helpers */

const BASE = '2611d06';   // origin/staging at the time of this repair

function assertUnchanged(rel) {
  let base;
  try {
    base = execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    assert.fail(`cannot read ${rel} at ${BASE}: ${e.message}`);
  }
  assert.equal(read(rel), base, `${rel} changed — it is outside the scope of this repair`);
}


/* A very small slice of the cascade: enough to answer "which declaration wins
   on this element at this viewport width". Handles the two things that actually
   decide it here — media-query width bounds, and specificity then source order.
   Deliberately not a CSS engine; it reads only the declarations asked for.

   One pass, tracking a brace stack, so `order` is the rule's real offset in the
   file. An earlier version recursed into @media blocks first and numbered them
   ahead of the top-level rules — which inverts every tie-break and quietly
   reports the wrong winner. A cascade resolver that gets source order wrong is
   worse than no resolver, because it fails convincingly. */
function resolve(source, prop, selectors, width) {
  const text = stripCssComments(source);
  const stack = [];
  const rules = [];
  let i = 0, mark = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      const head = text.slice(mark, i).trim();
      if (head.startsWith('@')) {
        stack.push(head);
      } else {
        /* Collect the declaration body of this rule. */
        let depth = 1, j = i + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
          j++;
        }
        rules.push({
          sel: head,
          body: text.slice(i + 1, j - 1),
          media: stack.filter((s) => s.startsWith('@media')).join(' and '),
          order: i
        });
        i = j; mark = j; continue;
      }
      mark = i + 1;
    } else if (ch === '}') {
      if (stack.length) stack.pop();
      mark = i + 1;
    }
    i++;
  }

  const applies = (media) => {
    if (!media) return true;
    for (const mx of media.matchAll(/max-width:\s*(\d+)px/g)) if (width > +mx[1]) return false;
    for (const mn of media.matchAll(/min-width:\s*(\d+)px/g)) if (width < +mn[1]) return false;
    return true;
  };

  const spec = (s) =>
    (s.match(/#/g) || []).length * 100 +
    (s.match(/[.:[]/g) || []).length * 10 +
    (s.match(/(^|[\s>+~])[a-z]/gi) || []).length;

  let best = null;
  for (const r of rules) {
    if (!applies(r.media)) continue;
    const hit = r.sel.split(',').map((x) => x.trim()).filter((p) => selectors.includes(p));
    if (!hit.length) continue;
    for (const d of r.body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:([^;]+)/g)) {
      const name = d[1].trim();
      let value = d[2].trim();
      if (name === 'flex') {
        if (prop !== 'flex-shrink') continue;
        const bits = value.split(/\s+/);
        value = value === 'none' ? '0' : (bits[1] !== undefined ? bits[1] : '1');
      } else if (name !== prop) continue;
      const sp = Math.max(...hit.map(spec));
      if (!best || sp > best.spec || (sp === best.spec && r.order >= best.order)) {
        best = { value, spec: sp, order: r.order, selector: hit[0], media: r.media };
      }
    }
  }
  return best;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.liquid')) out.push(p);
  }
  return out;
}

const stripLiquidComments = (s) =>
  s.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* ------------------------------------------------------------------- run */

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log('PASS ', name);
  } catch (e) {
    failed++;
    console.log('FAIL ', name);
    console.log('       ' + String(e.message).split('\n').join('\n       '));
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
