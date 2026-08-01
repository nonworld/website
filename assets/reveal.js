/* ==========================================================================
   NON — scroll reveal.

   One observer for the whole page. Elements settle once they are ~12% into the
   viewport, staggered within their own section so a band arrives as a sequence
   rather than a flash.

   Two deliberate choices:

   - The hidden state is added by THIS script (html.non-motion), never by the
     stylesheet. If the script fails, is blocked, or the browser has no
     IntersectionObserver, nothing was ever hidden and the page reads normally.
     CSS that hides content pending JS is a blank page waiting to happen.

   - Reduced motion is checked before anything is marked at all, so the class
     is never added and there is nothing to un-hide.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof IntersectionObserver === 'undefined') return;

  // What gets revealed. Deliberately a short list of band-level things: one
  // clear reveal per section beats five competing ones, and animating every
  // paragraph turns a page into a slideshow.
  var TARGETS = [
    '.non-section__head',
    '.non-hero__copy > *',
    '.non-collection-hero > *',
    '.non-about-hero > *',
    '.non-pair-hero > *',
    '.non-stock-hero > *',
    '.non-hq-hero > *',
    '.non-card',
    '.non-trip__cell',
    '.non-split__cell',
    '.non-press__list > *',
    '.non-pair__axis',
    '.non-matrix',
    '.non-stat',
    '.non-hq-fact',
    '.non-hq-room',
    '.non-hq-step',
    '.non-about-cta',
    '.non-stock-offer',
    '.non-promo',
    '.non-creds',
  ].join(',');

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target); // once, never again
    });
  }, {
    // Fire a little BEFORE the element is fully in view, so it is settling as
    // it arrives rather than starting after the reader has already seen it.
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.01,
  });

  function mark(scope) {
    // How many revealable children each band has seen, so the stagger counts
    // within a section rather than across the page.
    var seen = new Map();

    (scope || document).querySelectorAll(TARGETS).forEach(function (el) {
      if (el.hasAttribute('data-reveal')) return;

      // Anything already on screen at load gets no reveal. Animating what the
      // reader is currently looking at is a flash, not a reveal.
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) {
        el.setAttribute('data-reveal', '');
        el.classList.add('is-in');
        return;
      }

      el.setAttribute('data-reveal', '');

      // Stagger within the parent band, capped at five steps so a long grid
      // does not take three seconds to finish arriving.
      var key = el.parentNode;
      var i = seen.get(key) || 0;
      seen.set(key, i + 1);
      if (i > 0) el.style.setProperty('--reveal-delay', Math.min(i, 5) * 90 + 'ms');

      io.observe(el);
    });
  }

  /**
   * Failsafe.
   *
   * Hiding content in JS and un-hiding it from an IntersectionObserver is the
   * same trap as hiding it in CSS, one step removed: if the observer never
   * fires the page stays blank. It does not fire in a background tab, and a
   * page opened in one and read later would arrive empty.
   *
   * So everything reveals unconditionally after a beat, whatever the observer
   * did or did not do. A reveal that fires early is a cosmetic loss; a page
   * that never appears is not.
   */
  function revealAll() {
    document.querySelectorAll('[data-reveal]:not(.is-in)').forEach(function (el) {
      el.classList.add('is-in');
    });
  }

  setTimeout(revealAll, 2500);

  // A tab that was never visible has no meaningful viewport to intersect with.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') setTimeout(revealAll, 1200);
  });

  document.documentElement.classList.add('non-motion');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { mark(); });
  } else {
    mark();
  }

  // Theme editor re-renders a section into fresh nodes.
  document.addEventListener('shopify:section:load', function (e) { mark(e.target); });
})();
