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

  /* NOT ON A PHONE.
   *
   * On mobile the quotes are a scroll-snapped row the customer swipes, and a
   * timer moving them underneath a thumb is the worst of both — it steals the
   * quote someone is halfway through reading, and it makes the swipe fight the
   * script for control of the same row. The brief is explicit that press
   * quotes must not auto-rotate on mobile.
   *
   * This is a live query rather than a one-off width check: the theme editor
   * and a rotated tablet both cross the boundary without a reload, and a
   * rotator that had already started would keep running on a layout that has
   * no place for it. */
  var PHONE = window.matchMedia('(max-width: 859px)');

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

    function play() {
      clearInterval(timer);
      if (PHONE.matches) return;   // swipe owns the row here
      timer = setInterval(step, interval);
    }
    function pause() { clearInterval(timer); }

    /* Marks the list as script-controlled. Until this lands the CSS shows
       every quote, so a failed script leaves a long list rather than an
       empty box. */
    list.setAttribute('data-non-press-ready', '');

    /* On a phone every quote is in the row and none is hidden, so `show()` —
       which is what applies the is-on gating — must not run. Crossing the
       boundary in either direction re-decides it. */
    function apply() {
      if (PHONE.matches) {
        pause();
        items.forEach(function (el) { el.classList.remove('is-on'); });
      } else {
        show();
        play();
      }
    }

    apply();
    if (PHONE.addEventListener) PHONE.addEventListener('change', apply);
    else if (PHONE.addListener) PHONE.addListener(apply);

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
