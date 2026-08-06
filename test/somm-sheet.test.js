/**
 * THE SHARED SOMM SHEET — one submit path, four .non-somm forms on the page.
 *
 * These exist because the failure they guard against is invisible. A form whose
 * submit handler never binds does not throw and does not warn: it reloads the
 * page, which on a PDP looks like "the Somm did nothing" and on the hero looks
 * like the question was swallowed. Nothing in preflight.py or scripts/check.py
 * can see it — those read Liquid and CSS, not behaviour.
 *
 * The DOM here is built from the SAME attributes the Liquid emits, and
 * markup.test.js asserts the Liquid still emits them. Neither test is worth
 * much without the other: this one would keep passing against a fixture that no
 * longer resembles the theme.
 *
 *   node test/somm-sheet.test.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONTROLLER = fs.readFileSync(path.join(ROOT, 'assets/somm-sheet.js'), 'utf8');

/* The sheet's own markup, reduced to the hooks somm-sheet.js queries. Every one
   of these is present in snippets/somm-sheet.liquid; a hook that disappeared
   from the snippet would make the controller bail at `if (!sheet) return`. */
const SHEET = `
<div class="non-sheet" data-non-sheet hidden>
  <div class="non-sheet__scrim" data-non-sheet-close tabindex="-1"></div>
  <div class="non-sheet__panel" data-non-sheet-panel data-non-somm-root>
    <div data-non-sheet-grab></div>
    <button type="button" data-non-sheet-close>close</button>
    <p data-non-sheet-opener hidden></p>
    <div data-non-sheet-ctx hidden></div>
    <div data-non-sheet-seeds></div>
    <form data-non-somm data-somm-context="home">
      <input data-non-somm-input type="search">
      <button type="submit">Ask</button>
    </form>
  </div>
</div>`;

/* THE HERO, as sections/hero-somm.liquid renders it. */
const HERO = `
<section class="non-hero" data-non-somm-root>
  <form class="non-somm" data-non-somm-sheet-form data-non-somm-hero role="search"
        data-somm-surface="homepage_hero" data-somm-context="home">
    <div class="non-somm__bar">
      <label class="visually-hidden" for="somm-hero-hero1">Ask</label>
      <input id="somm-hero-hero1" class="non-somm__input" type="search"
             data-non-somm-hero-input placeholder="Tell me what's on the table">
      <button type="submit" class="non-somm__submit">Ask</button>
    </div>
    <div class="non-somm__seeds">
      <button type="button" class="non-somm__seed" data-non-somm-open
              data-somm-surface="homepage_hero" data-somm-context="home"
              data-somm-intent="pairing" data-somm-prompt="What goes with oysters?">Oysters</button>
    </div>
  </form>
</section>`;

/* THE PDP, as snippets/non-somm-form.liquid renders it for main-product.liquid. */
const PDP = `
<div class="non-product" data-non-somm-root>
  <form class="non-somm non-somm--pdp" data-non-somm-sheet-form data-non-somm-pdp
        role="search"
        data-somm-context="product" data-somm-surface="product_entry"
        data-somm-product="7712" data-somm-product-title="NON1 Salt &amp; Wild Raspberry"
        data-somm-variant="44011" data-somm-product-price="$26.00"
        data-somm-product-available="true" data-somm-code="NON1">
    <div class="non-mono non-eyebrow non-somm__label">Considering NON1?</div>
    <div class="non-somm__bar">
      <label class="visually-hidden" for="somm-q-pdp1">Ask about this bottle</label>
      <input id="somm-q-pdp1" class="non-somm__input" type="search"
             data-non-somm-input placeholder="Ask about this bottle">
      <button type="submit" class="non-somm__submit">Ask</button>
    </div>
    <div class="non-somm__seeds">
      <button type="button" class="non-somm__seed" data-non-somm-seed data-non-somm-open
              data-non-somm-pdp
              data-somm-surface="product_entry" data-somm-context="product"
              data-somm-prompt="Is it dry?" data-somm-code="NON1"
              data-somm-product="7712" data-somm-product-title="NON1 Salt &amp; Wild Raspberry"
              data-somm-variant="44011" data-somm-product-price="$26.00"
              data-somm-product-available="true">Is it dry?</button>
    </div>
  </form>
</div>`;

/* THE TWO FORMS THAT MUST NOT BE TOUCHED. Both are `.non-somm`, which is exactly
   why a class-based binding would have been wrong: pairing answers INLINE
   through somm.js, and the stockists search is a venue filter that has nothing
   to do with the Somm at all. */
const PAIRING = `
<div class="non-section" data-non-somm-root>
  <form class="non-somm" data-non-somm data-somm-context="pairing">
    <input id="pair-q-pair1" class="non-somm__input" type="search" data-non-somm-input>
    <button type="submit" class="non-somm__submit">Ask</button>
    <div class="non-somm__seeds">
      <button type="button" class="non-somm__seed" data-non-somm-seed>Roast chicken</button>
    </div>
  </form>
</div>`;

const STOCKISTS = `
<form class="non-somm non-stock-search" data-non-venue-search>
  <input id="stock-q-1" class="non-somm__input" type="search" name="venue">
  <button type="submit" class="non-somm__submit">Search</button>
</form>`;

function page(body) {
  const dom = new JSDOM(
    `<!doctype html><html><body class="template-product"><div class="non-shell">${body}</div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;

  /* jsdom has no matchMedia and no visualViewport. Both are optional to the
     controller — it feature-detects visualViewport — but matchMedia is called
     unconditionally, so it gets the minimum honest stand-in. */
  w.matchMedia = (q) => ({
    media: q, matches: false,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });

  /* Every question the sheet asks ends at form.__nonSommAsk, which is somm.js's
     job in the real page. Recording it here is what lets a test say "the typed
     text reached the conversation" rather than "a handler ran". */
  const asked = [];
  const sheetForm = w.document.querySelector('[data-non-sheet-panel] [data-non-somm]');
  sheetForm.__nonSommAsk = (text, type) => asked.push({ text, type });

  const submitted = [];
  /* jsdom does not implement form submission and logs "not implemented" to
     stderr when a submit event goes undefaulted. That log IS the signal here:
     a submit that reaches the default action is a page reload in a browser. */
  w.document.addEventListener('submit', (e) => {
    submitted.push({ form: e.target, defaultPrevented: e.defaultPrevented });
  });

  w.eval(CONTROLLER);
  return { w, d: w.document, asked, submitted, NON: w.NON };
}

/* The controller defers every ask by 60ms and the reveal by up to 60ms. Real
   timers, because faking them would test the fake. */
const settle = (ms = 220) => new Promise((r) => setTimeout(r, ms));

function submit(form) {
  const ev = form.ownerDocument.defaultView.Event;
  form.dispatchEvent(new ev('submit', { bubbles: true, cancelable: true }));
}
function click(el) {
  const w = el.ownerDocument.defaultView;
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
}

let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ------------------------------------------------------------------ hero */

test('hero submit prevents navigation', async () => {
  const { d, submitted } = page(SHEET + HERO);
  submit(d.querySelector('[data-non-somm-hero]'));
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].defaultPrevented, true,
    'the hero form submitted natively — the page would reload and the question is lost');
});

test('hero query transfers to the conversation', async () => {
  const { d, asked } = page(SHEET + HERO);
  d.querySelector('[data-non-somm-hero-input]').value = '  what goes with oysters  ';
  submit(d.querySelector('[data-non-somm-hero]'));
  await settle();
  assert.deepEqual(asked, [{ text: 'what goes with oysters', type: 'typed' }]);
  assert.equal(d.querySelector('[data-non-somm-hero-input]').value, '',
    'the field kept the question, so it reads as unsent');
  assert.equal(d.querySelector('[data-non-sheet]').hidden, false);
});

test('hero focus opens the sheet', async () => {
  const { d, NON } = page(SHEET + HERO);
  d.querySelector('[data-non-somm-hero-input]').dispatchEvent(
    new d.defaultView.FocusEvent('focus'));
  assert.equal(NON.somm.isOpen(), true);
});

/* ------------------------------------------------------------------- pdp */

test('PDP submit prevents navigation', async () => {
  const { d, submitted } = page(SHEET + PDP);
  submit(d.querySelector('[data-non-somm-pdp]'));
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].defaultPrevented, true,
    'Enter in the PDP field reloaded the page — the whole reason the old markup was a <div>');
});

test('PDP query transfers to the conversation', async () => {
  const { d, asked } = page(SHEET + PDP);
  d.querySelector('#somm-q-pdp1').value = 'is it dry?';
  submit(d.querySelector('[data-non-somm-sheet-form]'));
  await settle();
  assert.deepEqual(asked, [{ text: 'is it dry?', type: 'typed' }]);
});

test('PDP product, variant, price and availability reach the conversation', async () => {
  const { d, NON } = page(SHEET + PDP);
  submit(d.querySelector('[data-non-somm-sheet-form]'));
  const ctx = NON.somm.context();
  assert.equal(ctx.surface, 'product_entry');
  assert.equal(ctx.context, 'product');
  assert.equal(ctx.product_id, '7712');
  assert.equal(ctx.variant_id, '44011');
  assert.equal(ctx.product_title, 'NON1 Salt & Wild Raspberry');
  assert.equal(ctx.product_price, '$26.00');
  assert.equal(ctx.product_available, true);
  assert.equal(ctx.code, 'NON1');

  /* And the bottle stays buyable inside the sheet — the context payload is only
     worth carrying if renderProductAction() can act on it. */
  const ctxBox = d.querySelector('[data-non-sheet-ctx]');
  assert.equal(ctxBox.hidden, false);
  assert.ok(ctxBox.textContent.includes('$26.00'));
  assert.ok(ctxBox.querySelector('[data-non-somm-add]'));
});

test('PDP variant sync still finds the form', async () => {
  /* product.js:62 writes the live variant onto every [data-non-somm-pdp]. The
     marker moved from a retired <div> onto the canonical <form>; product.js
     cannot tell the difference, and this proves the target still exists. */
  const { d } = page(SHEET + PDP);
  const marked = d.querySelectorAll('[data-non-somm-pdp]');
  assert.equal(marked.length, 2, 'the form and its chip both carry the marker');
  marked.forEach((el) => {
    el.setAttribute('data-somm-variant', '99999');
    el.setAttribute('data-somm-product-price', '$140.00');
  });
  const { NON } = { NON: d.defaultView.NON };
  submit(d.querySelector('[data-non-somm-sheet-form]'));
  assert.equal(NON.somm.context().variant_id, '99999');
  assert.equal(NON.somm.context().product_price, '$140.00');
});

/* ----------------------------------------------------------------- chips */

test('preset chips open the sheet and ask their prompt — hero', async () => {
  const { d, asked, NON } = page(SHEET + HERO);
  click(d.querySelector('.non-somm__seeds .non-somm__seed'));
  await settle();
  assert.equal(NON.somm.isOpen(), true);
  assert.deepEqual(asked, [{ text: 'What goes with oysters?', type: 'prompt_chip' }]);
});

test('preset chips open the sheet and ask their prompt — PDP, with context', async () => {
  const { d, asked, NON } = page(SHEET + PDP);
  click(d.querySelector('.non-somm__seeds .non-somm__seed'));
  await settle();
  assert.deepEqual(asked, [{ text: 'Is it dry?', type: 'prompt_chip' }]);
  assert.equal(NON.somm.context().variant_id, '44011',
    'a chip that does not carry the bottle starts a conversation about nothing');
});

test('a chip inside the form does not also submit it', async () => {
  /* type="button" is what stops this. Without it a chip fires the click handler
     AND the form's submit handler: the same question asked twice. */
  const { d, asked, submitted } = page(SHEET + PDP);
  click(d.querySelector('.non-somm__seeds .non-somm__seed'));
  await settle();
  assert.equal(submitted.length, 0);
  assert.equal(asked.length, 1);
});

/* --------------------------------------------------- the untouched forms */

test('the pairing form is not bound to the sheet', async () => {
  const { d, NON, submitted } = page(SHEET + PAIRING);
  const form = d.querySelector('[data-non-somm][data-somm-context="pairing"]');
  assert.equal(form.__nonSommSheetBound, undefined);
  submit(form);
  await settle();
  assert.equal(NON.somm.isOpen(), false,
    'pairing opened a sheet instead of printing its verdict');
  assert.equal(submitted[0].defaultPrevented, false,
    'the sheet controller swallowed a submit that belongs to somm.js');
});

test('the stockists venue search is not bound to the sheet', async () => {
  const { d, NON, submitted } = page(SHEET + STOCKISTS);
  const form = d.querySelector('[data-non-venue-search]');
  assert.equal(form.__nonSommSheetBound, undefined);
  submit(form);
  await settle();
  assert.equal(NON.somm.isOpen(), false,
    'searching for a stockist opened a sommelier');
  assert.equal(submitted[0].defaultPrevented, false);
});

test('four .non-somm forms on one page, two of them bound', async () => {
  const { d } = page(SHEET + HERO + PDP + PAIRING + STOCKISTS);
  const all = [...d.querySelectorAll('form.non-somm')];
  assert.equal(all.length, 4);
  assert.deepEqual(
    all.map((f) => !!f.__nonSommSheetBound),
    [true, true, false, false]
  );
});

/* ------------------------------------------------------ double dispatch */

test('no double submission', async () => {
  const { d, asked } = page(SHEET + PDP);
  const form = d.querySelector('[data-non-somm-sheet-form]');
  d.querySelector('#somm-q-pdp1').value = 'is it dry?';
  submit(form);
  submit(form);
  submit(form);
  await settle();
  assert.equal(asked.length, 1, `asked ${asked.length} times`);
});

test('no double binding when the controller is evaluated twice', async () => {
  /* The theme editor re-renders a section without a reload, and a second pass
     over a form already carrying a listener asks everything twice. */
  const { w, d, asked } = page(SHEET + PDP);
  w.eval(CONTROLLER);
  d.querySelector('#somm-q-pdp1').value = 'is it dry?';
  submit(d.querySelector('[data-non-somm-sheet-form]'));
  await settle();
  assert.equal(asked.length, 1, `asked ${asked.length} times`);
});

test('no duplicate sheet opening', async () => {
  const { d, NON } = page(SHEET + HERO);
  let opens = 0;
  d.addEventListener('non:somm:opened', () => opens++);
  submit(d.querySelector('[data-non-somm-hero]'));
  click(d.querySelector('.non-somm__seed'));
  d.querySelector('[data-non-somm-hero-input]').dispatchEvent(
    new d.defaultView.FocusEvent('focus'));
  await settle();
  assert.equal(opens, 1, `the sheet announced itself open ${opens} times`);
  assert.equal(NON.somm.isOpen(), true);
});

/* ----------------------------------------------------------------- focus */

test('focus returns to the control that opened the sheet — hero field', async () => {
  const { d, NON } = page(SHEET + HERO);
  const field = d.querySelector('[data-non-somm-hero-input]');
  field.focus();
  submit(d.querySelector('[data-non-somm-hero]'));
  await settle();
  NON.somm.close('test');
  assert.equal(d.activeElement, field);
  assert.equal(NON.somm.isOpen(), false,
    'restoring focus to the hero field reopened the sheet — Escape cannot escape it');
});

test('focus returns to the submit button when that is what was pressed', async () => {
  const { d, NON } = page(SHEET + PDP);
  const btn = d.querySelector('.non-somm__submit');
  btn.focus();
  submit(d.querySelector('[data-non-somm-sheet-form]'));
  await settle();
  NON.somm.close('test');
  assert.equal(d.activeElement, btn);
});

test('focus returns to a preset chip', async () => {
  const { d, NON } = page(SHEET + PDP);
  const chip = d.querySelector('.non-somm__seed');
  click(chip);
  await settle();
  NON.somm.close('test');
  assert.equal(d.activeElement, chip);
});

test('focus never lands on the form itself', async () => {
  /* A <form> cannot hold focus. Restoring to it drops the caret to the top of
     the document, which is where the hero used to leave keyboard users. */
  const { d, NON } = page(SHEET + PDP);
  d.querySelector('#somm-q-pdp1').focus();
  submit(d.querySelector('[data-non-somm-sheet-form]'));
  await settle();
  NON.somm.close('test');
  assert.notEqual(d.activeElement, d.querySelector('form.non-somm'));
  assert.notEqual(d.activeElement, d.body);
});

/* ------------------------------------------------------------------- ids */

test('every input id on a page is unique, and every label resolves', async () => {
  /* Two Somms on one page with the same id gives one of them a label pointing
     at the other's input — silent, and only findable with a screen reader. */
  const { d } = page(SHEET + HERO + PDP + PAIRING + STOCKISTS);
  const ids = [...d.querySelectorAll('input[id]')].map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate input id in ${ids.join(', ')}`);
  for (const label of d.querySelectorAll('label[for]')) {
    assert.ok(d.getElementById(label.htmlFor),
      `label points at #${label.htmlFor}, which is not on the page`);
  }
});

/* ------------------------------------------------------------------- run */

const only = process.argv[2];
for (const [name, fn] of tests) {
  if (only && !name.includes(only)) continue;
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
