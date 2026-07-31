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
      apply();
    }
  });

  apply();
})();
