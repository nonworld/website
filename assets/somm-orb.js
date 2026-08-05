/* ==========================================================================
   NON Somm orb — persistent, and out of the way.

   Opening is not this file's job: the orb carries [data-non-somm-open], so
   somm-sheet.js handles the tap and the context exactly as it does for the
   hero and the triptych. This file owns three things the sheet cannot know
   about — when the orb should be on screen at all, when it must step aside,
   and when to stop drawing attention to itself.

   WHEN IT APPEARS. Not immediately. On the homepage it waits until the hero's
   own Somm entry has scrolled away, because until then there are two controls
   for one thing a few hundred pixels apart. On a product page it waits until
   the buy block has gone, for the same reason and a sharper one: nothing may
   compete with Add to cart while Add to cart is on screen.

   WHEN IT STEPS ASIDE. Any layer that takes the screen — the cart drawer, the
   Somm sheet, the lotto, the mobile menu — hides it. Two things asking for
   attention is one too many, and an orb floating over a modal is a tap target
   for something the customer cannot see.

   THE LABEL. Visible on first sight so the orb reads as a control rather than
   as decoration, collapsed to the mark once it has been used. The pulse runs
   three cycles and stops; anyone who has asked for less motion gets none.
   ========================================================================== */
(function () {
  'use strict';

  var NON = (window.NON = window.NON || {});
  var orb = document.querySelector('[data-non-orb]');
  if (!orb) return;

  var USED_KEY = 'non-somm-orb-used';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --- has it been used before? ------------------------------------------ */

  function used() {
    try { return localStorage.getItem(USED_KEY) === '1'; } catch (e) { return false; }
  }
  function markUsed() {
    try { localStorage.setItem(USED_KEY, '1'); } catch (e) {}
    orb.classList.add('is-used');
  }
  if (used()) orb.classList.add('is-used');

  /* --- when it is allowed on screen -------------------------------------- */

  /* The element the orb defers to while it is visible. On a product page that
     is the buy block — the orb must never share the screen with Add to cart.
     On the homepage it is the hero's own Somm entry. Falls back to the hero. */
  var defersTo =
    document.querySelector('[data-non-orb-defer]') ||
    document.querySelector('.non-buy') ||
    document.querySelector('[data-non-somm-entry]') ||
    document.querySelector('.non-hero');

  var suppressed = false;   // a layer is open
  var pastGate = !defersTo; // nothing to defer to: show straight away

  function apply() {
    var show = pastGate && !suppressed;
    orb.hidden = !show;
    if (show && !orb.__seen) {
      orb.__seen = true;
      /* Three cycles then stop, and only for someone who has not used it and
         has not asked for less motion. A control that pulses forever is an
         advert. */
      if (!used() && !reduce.matches) {
        orb.classList.add('is-pulsing');
        setTimeout(function () { orb.classList.remove('is-pulsing'); }, 5400);
      }
    }
  }


  /* THE GATE IS A SCROLL POSITION, not an IntersectionObserver.
   *
   * IO was the obvious tool and it could not be verified: in a tab that is not
   * painting, its callbacks do not arrive, so the orb and the sticky bar never
   * appeared and there was no way to test either of them. A feature whose
   * trigger cannot be exercised is a feature nobody has checked.
   *
   * A passive scroll listener computing the same condition is a couple of
   * microseconds, fires everywhere, and is trivially testable. rect.bottom < 0
   * means "this element has left upwards", which is the real condition —
   * scrolling back UP towards the buy block should retire the orb before the
   * block is reached, not after.
   *
   * Throttled with a dirty flag rather than rAF, for the same reason. */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    setTimeout(function () {
      ticking = false;
      recompute();
    }, 100);
  }

  function recompute() {
    if (!defersTo) { pastGate = true; apply(); return; }
    pastGate = defersTo.getBoundingClientRect().bottom < 0;
    apply();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  recompute();


  /* --- stepping aside ---------------------------------------------------- */

  function layerOpen() {
    var drawer = document.querySelector('[data-non-cart-drawer]');
    var lotto = document.querySelector('[data-non-lotto]');
    var menu = document.querySelector('[data-non-menu-panel], .non-drawer-menu');
    return (
      (NON.somm && NON.somm.isOpen && NON.somm.isOpen()) ||
      (drawer && !drawer.hidden) ||
      (lotto && !lotto.hidden) ||
      (menu && !menu.hidden && getComputedStyle(menu).display !== 'none')
    );
  }

  function sync() {
    suppressed = !!layerOpen();
    apply();
  }

  ['non:somm:opened', 'non:somm:closed', 'non:cart:updated', 'non:cart:closed',
   'non:lotto:won', 'non:menu:toggled'].forEach(function (name) {
    document.addEventListener(name, sync);
  });

  /* The cart drawer, the lotto and the menu do not all announce themselves, so
     their open state is also observed directly. One observer, three targets,
     attribute-filtered — it fires on `hidden` flipping and nothing else. */
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(sync);
    ['[data-non-cart-drawer]', '[data-non-lotto]', '[data-non-menu-panel]'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    });
  }

  orb.addEventListener('click', markUsed);

  /* Exposed so the sticky purchase bar can raise the orb above itself rather
     than the two overlapping — see product-sticky.js. */
  NON.orb = {
    lift: function (px) {
      document.documentElement.style.setProperty('--non-orb-lift', (px || 0) + 'px');
    }
  };
})();
