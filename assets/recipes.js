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

  // Which of the recipes matching the current bottle+effort is on screen.
  // There used to be exactly one of each, so this did not exist and reveal()
  // simply unhid every match. With more than one per pair that showed them
  // stacked down the page instead of choosing between them.
  var variant = 0;

  function matching() {
    return recipes.filter(function (r) {
      return r.getAttribute('data-bottle') === bottle &&
             r.getAttribute('data-effort') === effort;
    });
  }

  // Every effort that exists for the current bottle, so "write me another"
  // rolls within the bottle rather than jumping to a different one.
  // Deduped: with several recipes per effort the raw list repeats an effort
  // once per recipe, which would weight the random roll toward whichever
  // effort happened to have the most dishes written for it.
  function effortsFor(b) {
    var seen = {};
    return recipes
      .filter(function (r) { return r.getAttribute('data-bottle') === b; })
      .map(function (r) { return r.getAttribute('data-effort'); })
      .filter(function (e) {
        if (seen[e]) return false;
        seen[e] = true;
        return true;
      });
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
    var list = matching();
    if (variant >= list.length) variant = 0;

    recipes.forEach(function (article) { article.hidden = true; });
    if (list.length) list[variant].hidden = false;

    if (empty) empty.hidden = list.length > 0;
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
      variant = 0;
      marks();
      // Only re-write once they have asked for a dish at least once.
      if (written) write();
      return;
    }

    var f = e.target.closest('[data-non-recipe-effort]');
    if (f) {
      effort = f.getAttribute('data-non-recipe-effort');
      variant = 0;
      marks();
      if (written) write();
      return;
    }

    if (e.target.closest('[data-non-recipe-write]')) return write();

    if (e.target.closest('[data-non-recipe-another]')) {
      // Another dish for the SAME bottle and the same effort first, if one
      // has been written. Someone who picked "Sunday" and asked for another
      // wants a different Sunday dish, not to be moved to a weeknight.
      var list = matching();
      if (list.length > 1) {
        variant = (variant + 1) % list.length;
        write();
        return;
      }

      // Only when that pair has nothing else to offer does the effort roll.
      // Jumping to a different bottle would answer a question the customer
      // did not ask.
      var options = effortsFor(bottle).filter(function (x) { return x !== effort; });
      if (options.length) {
        variant = 0;
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
