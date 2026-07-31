/* ==========================================================================
   NON — product page
   Gallery switching and variant selection. Variant state lives in the form's
   hidden id input, which is what the AJAX cart posts.
   ========================================================================== */
(function () {
  'use strict';

  var main = document.querySelector('[data-non-gallery-main]');
  var thumbs = document.querySelectorAll('[data-non-gallery-thumb]');

  thumbs.forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      if (!main) return;
      main.src = thumb.getAttribute('data-full');
      main.removeAttribute('srcset');
      thumbs.forEach(function (t) {
        t.setAttribute('aria-current', t === thumb ? 'true' : 'false');
      });
    });
  });

  var variantInput = document.querySelector('[data-non-variant-input]');
  var priceEl = document.querySelector('[data-non-price]');
  var variants = document.querySelectorAll('[data-non-variant]');

  variants.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;

      variants.forEach(function (b) {
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });

      if (variantInput) variantInput.value = btn.getAttribute('data-variant-id');

      if (priceEl && window.NON && window.NON.cart) {
        priceEl.textContent = window.NON.cart.format(Number(btn.getAttribute('data-price')));
      }

      // Keep the URL shareable — deep links to a pack size should work.
      var url = new URL(window.location.href);
      url.searchParams.set('variant', btn.getAttribute('data-variant-id'));
      window.history.replaceState({}, '', url);
    });
  });
})();
