/* ==========================================================================
   NON — "goes well in a case with".

   Shopify only populates `recommendations` when it renders a section through
   the Section Rendering API. On a normal page load the object is empty, so a
   product with no custom.related metafield had nothing to show and no way to
   ask for anything. This is the request that was never made.
   ========================================================================== */
(function () {
  'use strict';

  function load(box) {
    var url = box.getAttribute('data-url');
    if (!url) return;

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('recommendations ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.querySelector('[data-non-recommendations]');
        // `.non-grid`, not `.non-related`. This band was rebuilt on the shared
        // product card, so the bespoke wrapper class no longer exists — and
        // this selector missing would have failed the quiet way: the fetch
        // succeeds, `list` is null, and the early return below leaves the
        // section hidden forever. Identical on screen to "this product has no
        // recommendations", which is why it needed catching here rather than
        // in a screenshot. Kept generic so the next layout change survives it.
        var list = fresh && fresh.querySelector('.non-grid, .non-row');

        // No recommendations for this product is a real answer, not a failure.
        // Leave the section hidden rather than showing an empty heading.
        if (!list || !list.children.length) return;

        box.innerHTML = fresh.innerHTML;
        box.hidden = false;
      })
      .catch(function (e) {
        // Stay hidden. A product page missing its "goes well with" row is a
        // smaller problem than one showing a broken empty band.
        console.error('[related]', e.message);
      });
  }

  function init() {
    document.querySelectorAll('[data-non-recommendations]').forEach(function (box) {
      if (box.getAttribute('data-non-related-ready')) return;
      box.setAttribute('data-non-related-ready', 'true');
      // Already server-rendered from custom.related — nothing to fetch.
      if (!box.hidden) return;
      load(box);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('shopify:section:load', init);
})();
