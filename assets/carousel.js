/* ==========================================================================
   NON — hero carousel

   Crossfade, auto-advance, dots. Everything is rendered server-side; this only
   moves the active class, so the first slide is visible before JS runs and
   stays visible if JS never does.

   Deliberately small: no library, no touch-drag. A hero carousel that nobody
   swipes does not justify a gesture handler.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-non-carousel]').forEach(function (root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-non-slide]'));
    if (slides.length < 2) return;

    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-non-carousel-dot]'));
    var interval = Number(root.getAttribute('data-interval')) || 6000;
    var index = 0;
    var timer = null;

    /* Promote the deferred slides.
     *
     * Every slide is stacked in the viewport, so loading="lazy" never held any
     * of them back — the homepage fetched 481KB of hero on a 375px phone to
     * show one image. The non-first slides now ship data-src instead of src
     * (see snippets/cdn-image.liquid) and are hydrated here.
     *
     * On idle, so it costs the first paint nothing, and immediately on the
     * first advance in case idle never arrives on a busy phone. Whichever
     * happens first; hydrate() is safe to call twice. */
    function hydrate() {
      root.querySelectorAll('img[data-src]').forEach(function (img) {
        var set = img.getAttribute('data-srcset');
        if (set) img.setAttribute('srcset', set);
        img.setAttribute('src', img.getAttribute('data-src'));
        img.removeAttribute('data-src');
        img.removeAttribute('data-srcset');
      });
    }

    if (window.requestIdleCallback) {
      requestIdleCallback(hydrate, { timeout: 3000 });
    } else {
      setTimeout(hydrate, 1200);
    }

    function show(next) {
      // Before the class moves, not after: a slide must not be crossfaded to
      // while it still has no src.
      hydrate();
      index = (next + slides.length) % slides.length;

      slides.forEach(function (slide, i) {
        slide.classList.toggle('is-active', i === index);
        // Keep inactive slides out of the accessibility tree — a screen
        // reader should not read five overlapping images.
        slide.setAttribute('aria-hidden', i === index ? 'false' : 'true');
      });

      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
    }

    function start() {
      if (reduced) return; // auto-advance is motion; respect the preference
      stop();
      timer = setInterval(function () { show(index + 1); }, interval);
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        show(i);
        start(); // restart the clock so a manual pick gets its full dwell
      });
    });

    // Pause while someone is looking at it deliberately.
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);

    // Nothing should animate in a background tab.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { show(index + 1); start(); }
      if (e.key === 'ArrowLeft') { show(index - 1); start(); }
    });

    show(0);
    start();
  });
})();
