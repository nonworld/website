/* ==========================================================================
   Featured set — the two events the brief asks for.

     featured_set_viewed     it came into view, once per page
     featured_set_selected   someone followed it to the product

   VIEWED MEANS SEEN, not rendered. The section is display:none above the
   mobile breakpoint, so a desktop page would otherwise report a view of a
   band nobody could look at — and the whole point of measuring this is to
   compare it against the sets carousel it replaces on a phone. An
   IntersectionObserver only fires for an element that has a box, so
   display:none reports nothing without a width check being written here.

   ONCE. The observer disconnects on the first hit. A band that a customer
   scrolls past, back to, and past again is one view of one section, not three
   — and duplicate events are called out in the brief specifically.
   ========================================================================== */
(function () {
  'use strict';

  var NON = window.NON || {};

  document.querySelectorAll('[data-non-firstbuy]').forEach(function (box) {
    if (box.__nonSeen) return;   // survive a Shopify section reload
    box.__nonSeen = true;

    function track(name, extra) {
      if (!NON.track) return;
      var props = {
        surface: 'homepage_featured_set',
        page_type: (document.body.className.match(/template-([\w-]+)/) || [, ''])[1]
      };
      Object.keys(extra || {}).forEach(function (k) { props[k] = extra[k]; });
      NON.track(name, props);
    }

    if (!('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.disconnect();
          track('featured_set_viewed');
        });
      },
      /* Half of it on screen. A single pixel at the edge of the viewport is
         not a view of a band whose job is to be read. */
      { threshold: 0.5 }
    );
    io.observe(box);

    box.addEventListener('click', function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      track('featured_set_selected', {
        /* Which of the two links: the product, or "View all sets". They mean
           different things — one is the recommendation working, the other is
           the customer declining it and going to browse. */
        position: link.classList.contains('non-firstbuy__more') ? 'view_all' : 'primary'
      });
    });
  });
})();
