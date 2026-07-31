/* ==========================================================================
   NON — stockists, sourced from find.non.world

   GET https://find.non.world/api/stockists
     { stockists: [ { id, name, lat, lng, suburb, region, type } ],
       meta: { total, shown }, generatedAt }

   Public, sanitised and CORS-open by design, so this runs straight from the
   browser with no proxy and no key. Around 2,200 venues, which drives three
   decisions here:

     - the map renders to canvas (preferCanvas), because 2,200 SVG markers
       is what makes a Leaflet map feel broken
     - the written list is paged; the map always shows every match
     - filtering is done in memory on one fetch rather than per-keystroke
       round trips
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-non-stockists]');
  if (!root) return;

  var ENDPOINT = root.getAttribute('data-endpoint') || 'https://find.non.world/api/stockists';
  var PAGE = Number(root.getAttribute('data-list-limit')) || 30;

  var listEl = root.querySelector('[data-non-venues]');
  var countEl = root.querySelector('[data-non-venue-count]');
  var errorEl = root.querySelector('[data-non-venue-error]');
  var moreBtn = root.querySelector('[data-non-venue-more]');
  var mapEl = root.querySelector('[data-non-map]');
  var searchForm = root.querySelector('[data-non-venue-search]');
  var queryInput = root.querySelector('[data-non-venue-query]');

  var all = [];
  var shown = [];
  var page = 1;

  var state = {
    type: 'all',
    region: root.getAttribute('data-default-region') || 'all',
    query: '',
  };

  var map = null;
  var layer = null;

  /* --- category buckets -------------------------------------------------- */

  // The feed carries Google's own category ("Wine Bar", "Liquor Store",
  // "Fine Dining Restaurant"), which is far more granular than the three
  // buckets the design filtered on. Match on substrings rather than an
  // exhaustive list, because new categories appear as venues are enriched.
  var BAR = /(bar|pub|brewery|taproom|hotel|cocktail|tavern|club)/i;
  var RETAIL = /(liquor|bottle|store|shop|supermarket|grocery|market|cellar|deli|merchant|winery)/i;
  var RESTAURANT = /(restaurant|dining|bistro|eatery|steak|cafe|café|coffee|pizzeria|brasserie|trattoria|osteria|izakaya|kitchen|canteen)/i;

  function bucket(type) {
    var t = String(type || '');
    if (!t) return 'other';
    // Order matters: "Wine Bar" is a bar, not retail; "Steak House" is a
    // restaurant even though it contains no "restaurant".
    if (BAR.test(t) && !/wine shop|bottle/i.test(t)) return 'bar';
    if (RESTAURANT.test(t)) return 'restaurant';
    if (RETAIL.test(t)) return 'retail';
    return 'other';
  }

  /* --- filtering --------------------------------------------------------- */

  function applyFilters() {
    var q = state.query.trim().toLowerCase();

    shown = all.filter(function (v) {
      if (state.region !== 'all' && v.region !== state.region) return false;
      if (state.type !== 'all' && v.bucket !== state.type) return false;
      if (q) {
        var hay = (v.name + ' ' + v.suburb + ' ' + (v.type || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    page = 1;
    render();
  }

  /* --- rendering --------------------------------------------------------- */

  function venueNode(v) {
    var el = document.createElement('div');
    el.className = 'non-venue';

    var directions =
      'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(v.lat + ',' + v.lng);

    el.innerHTML =
      '<div class="non-venue__name">' + escapeHTML(v.name) + '</div>' +
      '<div class="non-venue__addr">' +
      escapeHTML(v.suburb || '') +
      (v.region ? ' &middot; ' + escapeHTML(v.region) : '') +
      '</div>' +
      (v.type ? '<div class="non-venue__pours">' + escapeHTML(v.type) + '</div>' : '') +
      '<a class="non-venue__pours" style="text-decoration:underline;display:inline-block;margin-top:6px" ' +
      'href="' + directions + '" target="_blank" rel="noopener">Directions</a>';

    el.addEventListener('click', function () {
      if (map) map.setView([v.lat, v.lng], 15);
    });

    return el;
  }

  function render() {
    listEl.innerHTML = '';

    if (!shown.length) {
      var none = document.createElement('p');
      none.className = 'non-note';
      none.style.padding = '20px 0';
      none.textContent = 'Nothing stocking there yet. Try a nearby suburb, or the full map.';
      listEl.appendChild(none);
    } else {
      shown.slice(0, page * PAGE).forEach(function (v) {
        listEl.appendChild(venueNode(v));
      });
    }

    if (moreBtn) {
      var remaining = shown.length - page * PAGE;
      moreBtn.hidden = remaining <= 0;
      moreBtn.textContent = 'Show ' + Math.min(remaining, PAGE) + ' more';
    }

    if (countEl) {
      countEl.textContent =
        shown.length === all.length
          ? all.length.toLocaleString() + ' venues'
          : shown.length.toLocaleString() + ' of ' + all.length.toLocaleString();
    }

    drawMap();
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* --- map --------------------------------------------------------------- */

  function initMap() {
    if (!mapEl || typeof window.L === 'undefined' || map) return;

    // preferCanvas is what makes ~2,200 markers viable.
    map = window.L.map(mapEl, { scrollWheelZoom: false, preferCanvas: true });

    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    layer = window.L.layerGroup().addTo(map);
    drawMap();
  }

  function drawMap() {
    if (!map || !layer) return;
    layer.clearLayers();

    var bounds = [];

    shown.forEach(function (v) {
      window.L.circleMarker([v.lat, v.lng], {
        radius: 5,
        color: '#f2f0ea',
        weight: 1,
        fillColor: '#f2f0ea',
        fillOpacity: 0.8,
      })
        .bindPopup(
          '<strong>' + escapeHTML(v.name) + '</strong><br>' +
          escapeHTML(v.suburb || '') +
          (v.type ? '<br><em>' + escapeHTML(v.type) + '</em>' : '')
        )
        .addTo(layer);

      bounds.push([v.lat, v.lng]);
    });

    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
    else map.setView([-37.84, 144.95], 4); // Melbourne, when a filter empties
  }

  /* --- events ------------------------------------------------------------ */

  root.addEventListener('click', function (e) {
    var type = e.target.closest('[data-non-venue-filter]');
    if (type) {
      state.type = type.getAttribute('data-non-venue-filter');
      press('[data-non-venue-filter]', state.type);
      return applyFilters();
    }

    var region = e.target.closest('[data-non-venue-region]');
    if (region) {
      state.region = region.getAttribute('data-non-venue-region');
      press('[data-non-venue-region]', state.region);
      return applyFilters();
    }

    if (e.target.closest('[data-non-venue-more]')) {
      page += 1;
      render();
    }
  });

  function press(selector, value) {
    var attr = selector.slice(1, -1);
    root.querySelectorAll(selector).forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute(attr) === value ? 'true' : 'false');
    });
  }

  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      state.query = queryInput.value;
      applyFilters();
    });

    var debounce;
    queryInput.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.query = queryInput.value;
        applyFilters();
      }, 220);
    });
  }

  /* --- boot -------------------------------------------------------------- */

  function load() {
    fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('stockists ' + res.status);
        return res.json();
      })
      .then(function (data) {
        all = (data.stockists || [])
          .filter(function (v) {
            return Number.isFinite(v.lat) && Number.isFinite(v.lng);
          })
          .map(function (v) {
            v.bucket = bucket(v.type);
            return v;
          })
          .sort(function (a, b) {
            return a.name.localeCompare(b.name);
          });

        if (!all.length) {
          throw new Error('feed returned no venues');
        }

        press('[data-non-venue-region]', state.region);
        applyFilters();
      })
      .catch(function (err) {
        // The curated blocks above still render, so the page is never empty.
        listEl.innerHTML = '';
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent =
            'The live stockist list is unavailable right now. Try find.non.world directly.';
        }
        if (countEl) countEl.textContent = '';
        console.error('[non] stockists:', err);
      });
  }

  if (document.readyState === 'complete') {
    initMap();
    load();
  } else {
    window.addEventListener('load', function () {
      initMap();
      load();
    });
  }
})();
