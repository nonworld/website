/* ==========================================================================
   NON — stockists map
   Leaflet, rendered inline. The design ran the map in an iframe and pushed
   venues across with postMessage; same document here, so the list and the map
   share state directly.
   ========================================================================== */
(function () {
  'use strict';

  var mapEl = document.querySelector('[data-non-map]');
  var venues = Array.prototype.slice.call(document.querySelectorAll('[data-non-venue]'));
  var filters = document.querySelectorAll('[data-non-venue-filter]');
  var countEl = document.querySelector('[data-non-venue-count]');

  var map = null;
  var layer = null;

  function boot() {
    if (!mapEl || typeof window.L === 'undefined') return;

    map = window.L.map(mapEl, { scrollWheelZoom: false });
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19
    }).addTo(map);

    layer = window.L.layerGroup().addTo(map);
    draw('all');
  }

  function draw(type) {
    if (!map || !layer) return;
    layer.clearLayers();

    var bounds = [];

    venues.forEach(function (el) {
      var match = type === 'all' || el.getAttribute('data-type') === type;
      el.style.display = match ? '' : 'none';
      if (!match) return;

      var lat = parseFloat(el.getAttribute('data-lat'));
      var lng = parseFloat(el.getAttribute('data-lng'));
      if (isNaN(lat) || isNaN(lng)) return;

      var name = el.querySelector('.non-venue__name').textContent;
      var addr = el.querySelector('.non-venue__addr').textContent;
      var poursEl = el.querySelector('.non-venue__pours');

      window.L.circleMarker([lat, lng], {
        radius: 6,
        color: '#f2f0ea',
        weight: 1.5,
        fillColor: '#f2f0ea',
        fillOpacity: 0.85
      })
        .bindPopup(
          '<strong>' + name + '</strong><br>' +
          addr +
          (poursEl ? '<br><em>' + poursEl.textContent + '</em>' : '')
        )
        .addTo(layer);

      bounds.push([lat, lng]);
    });

    if (bounds.length === 1) map.setView(bounds[0], 12);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });

    if (countEl) {
      var shown = venues.filter(function (el) { return el.style.display !== 'none'; }).length;
      countEl.textContent = shown + (shown === 1 ? ' venue' : ' venues');
    }
  }

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var type = btn.getAttribute('data-non-venue-filter');
      filters.forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      draw(type);
    });
  });

  // Leaflet is deferred; wait for it rather than racing it.
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
