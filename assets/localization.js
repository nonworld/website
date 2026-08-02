/* ==========================================================================
   NON — country/region picker.

   Progressive enhancement only. The markup is a real form with a real submit
   button, so it works with JavaScript off; this just removes the extra click
   by submitting on change and hiding the button that is then redundant.
   ========================================================================== */
(function () {
  'use strict';

  document.querySelectorAll('[data-non-loc]').forEach(function (form) {
    var go = form.querySelector('[data-non-loc-go]');

    // Only hide the button once we know we can replace it. If anything below
    // throws, the visible button is still the way through.
    if (go) go.hidden = true;

    form.querySelectorAll('[data-non-loc-select]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        // Native submit, not fetch: Shopify sets the market cookie on the
        // redirect, and an XHR would not carry it back to the document.
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      });
    });
  });
})();
