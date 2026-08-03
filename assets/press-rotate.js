/* ==========================================================================
   NON — press quotes, two at a time.

   The old strip put four quotes side by side and each is a paragraph; at that
   width none of them got read. Two at a time gives each one room, and the
   rest cycle through.

   Every quote is in the DOM from the start — this only toggles which two are
   shown. If the script never runs, the section degrades to a plain stack of
   all of them, which is a worse layout but not a broken one.
   ========================================================================== */
(function () {
  'use strict';

  document.querySelectorAll('[data-non-press]').forEach(function (list) {
    var items = Array.prototype.slice.call(list.querySelectorAll('[data-non-press-item]'));
    var visible = Math.max(1, parseInt(list.getAttribute('data-visible'), 10) || 2);
    var interval = Math.max(3000, parseInt(list.getAttribute('data-interval'), 10) || 7000);

    /* Nothing to rotate: leave the markup exactly as rendered. */
    if (items.length <= visible) return;

    var start = 0;
    var timer;

    function show() {
      items.forEach(function (el, i) {
        var n = items.length;
        var on = false;
        for (var k = 0; k < visible; k++) if (i === (start + k) % n) on = true;
        el.classList.toggle('is-on', on);
      });
    }

    function step() { start = (start + visible) % items.length; show(); }

    function play() { clearInterval(timer); timer = setInterval(step, interval); }
    function pause() { clearInterval(timer); }

    /* Marks the list as script-controlled. Until this lands the CSS shows
       every quote, so a failed script leaves a long list rather than an
       empty box. */
    list.setAttribute('data-non-press-ready', '');

    show();
    play();

    /* Stop while someone is reading it, and while the tab is hidden — a timer
       running in a background tab just burns battery to change nothing. */
    list.addEventListener('mouseenter', pause);
    list.addEventListener('mouseleave', play);
    list.addEventListener('focusin', pause);
    list.addEventListener('focusout', play);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') pause(); else play();
    });

    /* Anyone who has asked for less motion gets the first two, held. */
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce && reduce.matches) pause();
  });
})();
