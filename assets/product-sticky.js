/* ==========================================================================
   Sticky mobile purchase bar.

   Once the real Add button has scrolled away, the pack, the price and a second
   Add follow the customer down the page. Everything below the buy block —
   pairings, process, the case builder — is there to answer a question, and the
   answer to "yes, this one" should never be a scroll back up.

   IT MIRRORS, IT DOES NOT DUPLICATE. The bar has no state of its own: the pack
   it names and the variant it adds are read from the real form every time, so
   a pack chosen at the top is the pack bought at the bottom. There is exactly
   one source of truth and it is the form.

   IT STEPS ASIDE. Any layer that takes the screen hides it, and while it is up
   it raises the Somm orb by its own height so the two cannot overlap. The orb
   is told the number rather than guessing it.
   ========================================================================== */
(function () {
  'use strict';

  var NON = (window.NON = window.NON || {});

  var bar = document.querySelector('[data-non-sticky-buy]');
  var form = document.querySelector('[data-non-product-form]');
  if (!bar || !form) return;

  var realAdd = form.querySelector('.non-atc');
  var variantInput = form.querySelector('[data-non-variant-input]');
  if (!realAdd || !variantInput) return;

  var packEl = bar.querySelector('[data-non-sticky-pack]');
  var priceEl = bar.querySelector('[data-non-sticky-price]');
  var addEl = bar.querySelector('[data-non-sticky-add]');

  var pastAdd = false;
  var suppressed = false;

  /* --- what it says ------------------------------------------------------ */

  /* Read off the form, never remembered. The selected pack button is the one
     with aria-checked="true"; on a single-variant product there are no pack
     buttons at all and the product's own name stands in. */
  function sync() {
    var chosen = form.querySelector('[data-non-variant][aria-checked="true"]');

    if (packEl) {
      var label = chosen && chosen.querySelector('.non-variant__label');
      packEl.textContent = label ? label.textContent.trim() : (bar.getAttribute('data-fallback-pack') || '');
    }

    if (priceEl) {
      /* The price the real button is showing. Mirroring the rendered string
         rather than re-formatting a number keeps the two identical in every
         market, including the ones whose currency this theme does not format
         the same way as Shopify. */
      var shown = realAdd.querySelector('[data-non-price]');
      priceEl.textContent = shown ? shown.textContent.trim() : '';
    }

    if (addEl) {
      var id = variantInput.value;
      addEl.setAttribute('data-variant-id', id);
      var soldOut = realAdd.disabled;
      addEl.disabled = soldOut;
      addEl.textContent = soldOut
        ? (NON.strings && NON.strings.soldOut) || 'Sold out'
        : bar.getAttribute('data-add-label') || 'Add';
    }
  }

  /* --- when it shows ------------------------------------------------------ */

  function apply() {
    var show = pastAdd && !suppressed;
    bar.classList.toggle('is-on', show);
    bar.setAttribute('aria-hidden', show ? 'false' : 'true');
    /* LIFT THE ORB CLEAR OF THE BAR.
     *
     * Set directly rather than through NON.orb.lift(). Both files are deferred
     * scripts and this one is emitted by the section, so it can execute BEFORE
     * theme.liquid's orb script has defined NON.orb — and the guarded call then
     * did nothing at all, silently, leaving the orb sitting on top of the bar.
     *
     * It is a custom property on the root: no API, no load order, nothing to be
     * undefined. NON.orb.lift stays as the named way to do the same thing.
     *
     * Measured, not assumed — the bar's height depends on the pack label and
     * the safe-area inset. */
    var lift = show ? Math.round(bar.getBoundingClientRect().height) + 12 : 0;
    document.documentElement.style.setProperty('--non-orb-lift', lift + 'px');
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
    /* The real Add button leaving upwards. Measured against the element rather
       than a fixed offset so it stays correct whatever the gallery above it
       does at any width. */
    pastAdd = realAdd.getBoundingClientRect().bottom < 0;
    apply();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  function layerOpen() {
    var drawer = document.querySelector('[data-non-cart-drawer]');
    var lotto = document.querySelector('[data-non-lotto]');
    var menu = document.querySelector('[data-non-menu-panel]');
    return (
      (NON.somm && NON.somm.isOpen && NON.somm.isOpen()) ||
      (drawer && !drawer.hidden) ||
      (lotto && !lotto.hidden) ||
      (menu && !menu.hidden)
    );
  }

  function syncLayers() {
    suppressed = !!layerOpen();
    apply();
  }

  ['non:somm:opened', 'non:somm:closed', 'non:cart:updated', 'non:cart:closed',
   'non:lotto:won', 'non:menu:toggled'].forEach(function (n) {
    document.addEventListener(n, syncLayers);
  });
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(syncLayers);
    ['[data-non-cart-drawer]', '[data-non-lotto]', '[data-non-menu-panel]'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    });
  }

  /* Pack changes come through product.js, which fires no event of its own, so
     the buttons are watched directly. */
  form.querySelectorAll('[data-non-variant]').forEach(function (b) {
    b.addEventListener('click', function () { setTimeout(sync, 0); });
  });
  document.addEventListener('non:cart:updated', sync);

  sync();
  recompute();
})();
