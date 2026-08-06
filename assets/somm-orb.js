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

  /* Every orb opens the same sheet, so any of them counts as "used" and
     collapses the compact one's label. */
  document.addEventListener('click', function (e) {
    if (e.target.closest('.non-orb')) markUsed();
  });

  /* --- when it is allowed on screen -------------------------------------- */

  /* WHAT THE COMPACT ORB DEFERS TO.
   *
   * Two things, and both must be off screen before it appears:
   *
   *   the INTEGRATED orb — the large art-directed one in the hero, or in the
   *     PDP's "still deciding?" band. The two are one control in two sizes and
   *     showing both at once would say there are two.
   *
   *   the BUY BLOCK on a product page — nothing competes with Add to cart
   *     while Add to cart is on screen.
   *
   * A page may have either, both, or neither. With neither, the compact orb is
   * simply always available. */
  var gates = [].slice.call(
    document.querySelectorAll('[data-non-orb-integrated], [data-non-orb-defer]')
  );

  var suppressed = false;   // a layer is open
  var pastGate = !gates.length;

  function apply() {
    var show = pastGate && !suppressed;
    orb.hidden = !show;
  }

  /* THE GATE IS A SCROLL POSITION, not an IntersectionObserver.
   *
   * IO was the obvious tool and it could not be verified: in a tab that is not
   * painting its callbacks do not arrive, so the orb never appeared and there
   * was no way to exercise it. A feature whose trigger cannot be tested is a
   * feature nobody has checked.
   *
   * A passive scroll listener computing the same condition costs microseconds
   * and fires everywhere. `bottom < 0` means "has left upwards", which is the
   * real condition — scrolling back up towards the hero should retire the
   * compact orb before the integrated one is reached, not after. */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    setTimeout(function () { ticking = false; recompute(); }, 100);
  }

  function recompute() {
    pastGate = gates.every(function (el) {
      /* An element that is display:none has a zero rect and is not a gate —
         the integrated orb is hidden below 360px, and the compact one should
         still work there. */
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return true;
      return r.bottom < 0;
    });
    apply();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  recompute();

  /* --- motion, and when to stop it --------------------------------------- */

  /* Every orb on the page, both states. Browsers already throttle animation in
     a background tab, but "throttled" is not "stopped" — and this is a light
     that breathes, which is the kind of thing that should not be running for
     someone who has switched to another tab. */
  function stillness() {
    var still = document.visibilityState === 'hidden';
    document.querySelectorAll('.non-orb').forEach(function (o) {
      o.classList.toggle('is-still', still);
    });
  }
  document.addEventListener('visibilitychange', stillness);
  stillness();

  /* --- stepping aside ---------------------------------------------------- */

  function layerOpen() {
    var drawer = document.querySelector('[data-non-cart-drawer]');
    var lotto = document.querySelector('[data-non-lotto]');
        /* `[data-non-menu]` — the panel's real hook. This queried
       `[data-non-menu-panel]`, which matches nothing in this theme
       (sections/header.liquid:75), so the mobile menu never counted as an open
       layer: the floating orb stayed up over the open menu.
       Never caught because both the selector and the element look plausible and
       the miss is silent — querySelector returns null and the || chain simply
       moves on. */
    var menu = document.querySelector('[data-non-menu]');
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
    ['[data-non-cart-drawer]', '[data-non-lotto]', '[data-non-menu]'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    });
  }


  /* Exposed so the sticky purchase bar can raise the orb above itself rather
     than the two overlapping — see product-sticky.js. */
  NON.orb = {
    lift: function (px) {
      document.documentElement.style.setProperty('--non-orb-lift', (px || 0) + 'px');
    }
  };
})();
