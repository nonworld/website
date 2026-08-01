/* ==========================================================================
   NON — pairing, reverse flow (bottle → recipe)

   Two pickers and a write button. Every recipe is rendered server-side; this
   decides which one is visible and paces the somm "writing" it first.

   The pause is the point. The design has the somm reason out loud — numbered
   lines, one at a time — before the dish lands, because the claim is that it
   wrote this dish around that bottle's structure. Swapping a hidden article
   straight in asserts the recipe instead of composing it, which is what the
   previous build did.

   First press is deliberate: nothing shows until you ask for it. After that
   the pickers re-write immediately, so the thing stays responsive once you are
   engaged rather than making you press Write for every adjustment.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-non-recipes]');
  if (!root) return;

  var recipes = Array.prototype.slice.call(root.querySelectorAll('[data-non-recipe]'));
  if (!recipes.length) return;

  var empty = root.querySelector('[data-non-recipe-empty]');
  var trace = root.querySelector('[data-non-recipe-trace]');
  var traceLines = trace
    ? Array.prototype.slice.call(trace.querySelectorAll('[data-non-recipe-traceline]'))
    : [];
  var writeBtn = root.querySelector('[data-non-recipe-write]');

  var speed = parseInt(root.getAttribute('data-trace-speed'), 10);
  if (!(speed > 0)) speed = 340;

  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var bottle = recipes[0].getAttribute('data-bottle');
  var effort = recipes[0].getAttribute('data-effort') || 'fast';
  var written = false;
  var timers = [];

  // Every effort that exists for the current bottle, so "write me another"
  // rolls within the bottle rather than jumping to a different one.
  function effortsFor(b) {
    return recipes
      .filter(function (r) { return r.getAttribute('data-bottle') === b; })
      .map(function (r) { return r.getAttribute('data-effort'); });
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function marks() {
    root.querySelectorAll('[data-non-recipe-bottle]').forEach(function (btn) {
      btn.setAttribute(
        'aria-pressed',
        btn.getAttribute('data-non-recipe-bottle') === bottle ? 'true' : 'false'
      );
    });
    root.querySelectorAll('[data-non-recipe-effort]').forEach(function (btn) {
      btn.setAttribute(
        'aria-pressed',
        btn.getAttribute('data-non-recipe-effort') === effort ? 'true' : 'false'
      );
    });
  }

  function reveal() {
    var shown = 0;

    recipes.forEach(function (article) {
      var match =
        article.getAttribute('data-bottle') === bottle &&
        article.getAttribute('data-effort') === effort;
      article.hidden = !match;
      if (match) shown++;
    });

    if (empty) empty.hidden = shown > 0;
    if (writeBtn) writeBtn.disabled = false;
    written = true;
  }

  function hideAll() {
    recipes.forEach(function (a) { a.hidden = true; });
    if (empty) empty.hidden = true;
  }

  function write() {
    clearTimers();
    marks();
    hideAll();

    // No trace copy, or reduced motion: land it immediately. Someone who has
    // asked for less movement is not served by a staged pause.
    if (!traceLines.length || reduced) {
      if (trace) trace.hidden = true;
      return reveal();
    }

    trace.hidden = false;
    traceLines.forEach(function (l) { l.hidden = true; });
    if (writeBtn) writeBtn.disabled = true;

    traceLines.forEach(function (line, i) {
      timers.push(setTimeout(function () { line.hidden = false; }, i * speed));
    });

    timers.push(setTimeout(function () {
      trace.hidden = true;
      reveal();
    }, traceLines.length * speed + 260));
  }

  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-non-recipe-bottle]');
    if (b) {
      bottle = b.getAttribute('data-non-recipe-bottle');
      marks();
      // Only re-write once they have asked for a dish at least once.
      if (written) write();
      return;
    }

    var f = e.target.closest('[data-non-recipe-effort]');
    if (f) {
      effort = f.getAttribute('data-non-recipe-effort');
      marks();
      if (written) write();
      return;
    }

    if (e.target.closest('[data-non-recipe-write]')) return write();

    if (e.target.closest('[data-non-recipe-another]')) {
      // Roll within the current bottle. Jumping to a different bottle would
      // answer a question the customer did not ask.
      var options = effortsFor(bottle).filter(function (x) { return x !== effort; });
      if (options.length) {
        effort = options[Math.floor(Math.random() * options.length)];
        write();
      }
    }
  });

  // Pickers show their selection from the start; the panel waits to be asked.
  marks();
  hideAll();
  if (trace) trace.hidden = true;
})();
