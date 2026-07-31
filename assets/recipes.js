/* ==========================================================================
   NON — pairing, reverse flow (bottle → recipe)
   Two pickers, bottle and effort. Everything is rendered server-side; this
   only decides which article is visible.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-non-recipes]');
  if (!root) return;

  var recipes = Array.prototype.slice.call(root.querySelectorAll('[data-non-recipe]'));
  if (!recipes.length) return;

  var empty = root.querySelector('[data-non-recipe-empty]');

  var bottle = recipes[0].getAttribute('data-bottle');
  var effort = recipes[0].getAttribute('data-effort') || 'fast';

  // Every effort that exists for the current bottle, so "write me another"
  // rolls within the bottle rather than jumping to a different one.
  function effortsFor(b) {
    return recipes
      .filter(function (r) { return r.getAttribute('data-bottle') === b; })
      .map(function (r) { return r.getAttribute('data-effort'); });
  }

  function apply() {
    var shown = 0;

    recipes.forEach(function (article) {
      var match =
        article.getAttribute('data-bottle') === bottle &&
        article.getAttribute('data-effort') === effort;
      article.hidden = !match;
      if (match) shown++;
    });

    if (empty) empty.hidden = shown > 0;

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

  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-non-recipe-bottle]');
    if (b) {
      bottle = b.getAttribute('data-non-recipe-bottle');
      return apply();
    }

    var f = e.target.closest('[data-non-recipe-effort]');
    if (f) {
      effort = f.getAttribute('data-non-recipe-effort');
      return apply();
    }

    if (e.target.closest('[data-non-recipe-another]')) {
      // Roll within the current bottle. Jumping to a different bottle would
      // answer a question the customer did not ask.
      var options = effortsFor(bottle).filter(function (x) { return x !== effort; });
      if (options.length) {
        effort = options[Math.floor(Math.random() * options.length)];
        apply();
      }
    }
  });

  // Nothing is pressed in the markup, so the first apply() sets both pickers.
  apply();
})();
