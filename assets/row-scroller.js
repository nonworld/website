/* ==========================================================================
   NON — single-row product scroller.

   The arrows only appear when there is actually something off screen. An
   arrow that does nothing is worse than no arrow: it says "there is more"
   and then proves itself wrong.
   ========================================================================== */
(function () {
  'use strict';

  function wire(wrap) {
    var row = wrap.querySelector('[data-non-row]');
    var prev = wrap.querySelector('[data-non-row-prev]');
    var next = wrap.querySelector('[data-non-row-next]');
    if (!row) return;

    function page() {
      // Scroll by whole cards rather than a fixed pixel amount, so a card is
      // never left half-cut at the edge.
      var first = row.firstElementChild;
      if (!first) return row.clientWidth;
      var gap = parseFloat(getComputedStyle(row).columnGap) || 20;
      var card = first.getBoundingClientRect().width + gap;
      return Math.max(card, Math.floor(row.clientWidth / card) * card);
    }

    function sync() {
      var max = row.scrollWidth - row.clientWidth;
      var x = row.scrollLeft;
      // 2px of slack: sub-pixel layout means scrollLeft rarely hits max exactly.
      if (prev) prev.classList.toggle('is-on', x > 2);
      if (next) next.classList.toggle('is-on', x < max - 2);
    }

    if (prev) prev.addEventListener('click', function () { row.scrollBy({ left: -page(), behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function () { row.scrollBy({ left: page(), behavior: 'smooth' }); });

    row.addEventListener('scroll', sync, { passive: true });

    // Re-check when the row itself changes size — a breakpoint change can turn
    // an overflowing row into one that fits, and vice versa.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(sync).observe(row);
    }
    sync();
  }

  function init() {
    document.querySelectorAll('[data-non-row-wrap]').forEach(function (w) {
      if (w.getAttribute('data-non-row-ready')) return;
      w.setAttribute('data-non-row-ready', 'true');
      wire(w);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('shopify:section:load', init);
})();
