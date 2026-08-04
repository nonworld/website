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
        /* Every WORD has to appear, not the whole string as one substring.
         *
         * `hay.indexOf(q)` meant "austin texas" found nothing while "austin"
         * found nineteen venues: the feed stores suburb and country, so the
         * haystack reads "Austin US" and the typed phrase is not a substring
         * of it. Splitting on whitespace lets a natural query work, and the
         * suggestion list below stops people having to guess the wording at
         * all. Region is in the haystack now too, which it never was. */
        var hay = (
          v.name + ' ' + (v.suburb || '') + ' ' + (v.region || '') + ' ' + (v.type || '')
        ).toLowerCase();
        var words = q.split(/\s+/);
        for (var w = 0; w < words.length; w++) {
          if (words[w] && hay.indexOf(words[w]) === -1) return false;
        }
      }
      return true;
    });

    page = 1;
    refit = true; // the result set changed, so the camera should follow it
    render();
  }

  /* --- rendering --------------------------------------------------------- */

  function venueNode(v) {
    var el = document.createElement('div');
    el.className = 'non-venue';

    var directions =
      'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(v.lat + ',' + v.lng);

    // Three parts across, per design-reference: identity on the left, what kind
    // of venue and what it pours in the middle, distance hard right. The build
    // stacked everything in one column, which is why the directory read as a
    // list of addresses rather than a table you can scan down.
    el.innerHTML =
      '<span class="non-venue__id">' +
      '<span class="non-venue__name">' + escapeHTML(v.name) + '</span>' +
      '<span class="non-venue__addr">' +
      escapeHTML(v.suburb || '') +
      (v.region ? ' &middot; ' + escapeHTML(v.region) : '') +
      '</span></span>' +
      '<span class="non-venue__what">' +
      (v.type ? '<span class="non-venue__kind">' + escapeHTML(v.type) + '</span>' : '') +
      (v.pours ? '<span class="non-venue__pours">' + escapeHTML(v.pours) + '</span>' : '') +
      '<a class="non-venue__dir" href="' + directions + '" target="_blank" rel="noopener">Directions</a>' +
      '</span>' +
      '<span class="non-venue__dist">' +
      (v.distance ? escapeHTML(String(v.distance)) : '') +
      '</span>';

    el.addEventListener('click', function () {
      if (map) map.setView([v.lat, v.lng], 15);
    });

    return el;
  }

  function render() {
    listEl.innerHTML = '';

    // The empty state is markup in the section, not a string built here. The
    // design gives it a heading, a paragraph and two ways out — search the full
    // directory, or have a bottle shipped. A one-line textContent could carry
    // none of that, and none of it would have been editable.
    var emptyEl = root.querySelector('[data-non-venue-empty]');
    var sortEl = root.querySelector('[data-non-venue-sort]');
    if (emptyEl) emptyEl.hidden = shown.length > 0;
    if (sortEl) sortEl.hidden = !shown.length;

    if (!shown.length) {
      if (!emptyEl) {
        var none = document.createElement('p');
        none.className = 'non-note';
        none.style.padding = '20px 0';
        none.textContent = 'Nothing stocking there yet. Try a nearby suburb, or the full map.';
        listEl.appendChild(none);
      }
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

    // The hero eyebrow carries the live total too — the design shows a count
    // up there and a hardcoded one would be wrong the day a venue is added.
    var heroCount = document.querySelector('[data-non-hero-count]');
    if (heroCount && all.length) {
      var base = heroCount.getAttribute('data-base') || heroCount.textContent.trim();
      // Strip any count already written into the setting before appending the
      // live one. The stored eyebrow read "Stockists · 1,400+ venues", so the
      // page rendered "Stockists · 1,400+ venues · 2,191 venues" — the live
      // figure arriving next to a stale hardcoded one, which is worse than
      // either alone because it invites the reader to work out which is true.
      // Done here rather than only in the setting so a merchandiser typing a
      // count back in cannot resurrect it.
      base = base.replace(/\s*[·|,-]\s*[\d,.]+\+?\s*venues?\s*$/i, '').trim();
      heroCount.setAttribute('data-base', base);
      heroCount.textContent = base + ' · ' + all.length.toLocaleString() + ' venues';
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

  // Whether the next draw should move the camera. Refitting on every render
  // meant "Show more" yanked the map out from under whatever the customer had
  // just panned to. The camera should follow a change in the RESULT SET, not a
  // change in how many rows are printed.
  var refit = true;

  function drawMap() {
    if (!map || !layer) return;

    // Leaflet measures its container once, at construction. This one is in a
    // grid track that is still settling, and the pane it renders in reports
    // its own size late, so without this the map paints at a stale size —
    // tiles stop short and leave a bare band, and hit-testing is offset from
    // what is drawn, which is what made the filters stop responding after a
    // few clicks. Cheap, idempotent, and safe to call on every draw.
    map.invalidateSize(false);

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

    if (!refit) return;
    refit = false;

    if (!bounds.length) return map.setView([-37.84, 144.95], 4); // when a filter empties
    if (bounds.length === 1) return map.setView(bounds[0], 15);

    // Fit the bulk of the results, not the strays.
    //
    // Searching "melbourne" returns a venue whose NAME carries the city but
    // which sits in Adelaide, and a literal fitBounds over every match then
    // zooms out far enough to hold both — you get half of south-east Australia
    // and a useless map. Clipping to the 10th-90th percentile of each axis
    // frames where the results actually are, which is the question being asked.
    //
    // Only worth doing once there are enough points for a percentile to mean
    // something; below that, every point is signal.
    var fit = bounds;
    if (bounds.length >= 8) {
      var lats = bounds.map(function (b) { return b[0]; }).sort(function (a, b) { return a - b; });
      var lngs = bounds.map(function (b) { return b[1]; }).sort(function (a, b) { return a - b; });
      var lo = Math.floor(bounds.length * 0.1);
      var hi = Math.ceil(bounds.length * 0.9) - 1;
      var box = [[lats[lo], lngs[lo]], [lats[hi], lngs[hi]]];
      // Guard against a degenerate box when the middle 80% share a coordinate.
      if (Math.abs(box[0][0] - box[1][0]) > 0.001 || Math.abs(box[0][1] - box[1][1]) > 0.001) {
        fit = box;
      }
    }

    // maxZoom stops a tight cluster from slamming to street level, where the
    // pins overlap and there is no context left around them.
    map.fitBounds(fit, { padding: [30, 30], maxZoom: 13 });
  }

  // Keep the map honest about its own size when the column reflows — the
  // breakpoint change from a side-by-side to a stacked layout is the case
  // that used to leave it half-painted.
  if (mapEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () {
      if (map) map.invalidateSize(false);
    }).observe(mapEl);
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

      /* Length and result count only — never the search term. A stockist
         search is often a suburb, which is close enough to a location to be
         worth not storing. The number that matters is how often a search
         returns nothing: that is either a coverage gap worth knowing about or
         a matcher that has stopped working, and both look identical from the
         outside. */
      if (window.NON && NON.started) {
        NON.started('stockist_search', { chars: (state.query || '').trim().length });
      }
      applyFilters();
      if (window.NON && NON.answered) {
        var n = (state.results || state.filtered || []).length;
        NON.answered('stockist_search', { results: n });
        if (!n) NON.failed('stockist_search', { reason: 'no_results' });
      }
      return;
    });

    var debounce;
    queryInput.addEventListener('input', function () {
      suggest(queryInput.value);
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.query = queryInput.value;
        applyFilters();
      }, 220);
    });

    /* --- place suggestions ------------------------------------------------
       Type "aus", get "Austin, US — 19 venues", click it and the search is
       locked to a place that definitely exists.

       This is here because free text cannot be made to work reliably against
       this feed. It carries a suburb and a country and nothing between, so
       "austin texas" and "austin, tx" both find nothing while the venues sit
       there under "Austin US". Rather than teach the matcher every way a
       person might name a place, the page offers the places it actually has.

       Built from the loaded feed, so it can never suggest somewhere with no
       stockists — the failure mode of a hand-written list. */

    var sugEl = null;
    var sugItems = [];
    var sugIndex = -1;

    function placeIndex() {
      var seen = {};
      for (var i = 0; i < all.length; i++) {
        var v = all[i];
        if (!v.suburb) continue;
        var label = v.suburb + (v.region ? ', ' + v.region : '');
        var key = label.toLowerCase();
        if (!seen[key]) seen[key] = { label: label, term: v.suburb, count: 0 };
        seen[key].count++;
      }
      return Object.keys(seen).map(function (k) { return seen[k]; });
    }

    function closeSuggest() {
      if (sugEl) { sugEl.remove(); sugEl = null; }
      sugItems = [];
      sugIndex = -1;
      queryInput.setAttribute('aria-expanded', 'false');
    }

    function choose(item) {
      queryInput.value = item.term;
      state.query = item.term;
      closeSuggest();
      applyFilters();
    }

    function suggest(raw) {
      var q = (raw || '').trim().toLowerCase();
      // Two characters, because one letter matches most of the directory and
      // a list of forty places is not a suggestion, it is a phone book.
      if (q.length < 2 || !all.length) return closeSuggest();

      // Match on the first word only: someone typing "austin tex" is still
      // looking for Austin, and the second word is them trying to help.
      var head = q.split(/\s+/)[0];
      var hits = placeIndex()
        .filter(function (p) { return p.label.toLowerCase().indexOf(head) !== -1; })
        .sort(function (a, b) {
          // Places whose name STARTS with what was typed first, then by how
          // many venues are there. "Austin" should beat "Port Augusta".
          var as = a.label.toLowerCase().indexOf(head) === 0 ? 0 : 1;
          var bs = b.label.toLowerCase().indexOf(head) === 0 ? 0 : 1;
          if (as !== bs) return as - bs;
          return b.count - a.count;
        })
        .slice(0, 6);

      if (!hits.length) return closeSuggest();

      if (!sugEl) {
        sugEl = document.createElement('div');
        sugEl.className = 'non-stock-suggest';
        sugEl.setAttribute('role', 'listbox');
        queryInput.parentNode.appendChild(sugEl);
      }
      sugItems = hits;
      sugIndex = -1;
      sugEl.innerHTML = hits
        .map(function (p, i) {
          return (
            '<button type="button" role="option" aria-selected="false" ' +
            'class="non-stock-suggest__item" data-i="' + i + '">' +
            '<span>' + escapeHTML(p.label) + '</span>' +
            '<span class="non-stock-suggest__n">' + p.count + '</span>' +
            '</button>'
          );
        })
        .join('');
      queryInput.setAttribute('aria-expanded', 'true');
    }

    // Pointerdown, not click: the input's blur would tear the list down
    // before a click ever landed on it.
    document.addEventListener('pointerdown', function (e) {
      var item = e.target.closest('.non-stock-suggest__item');
      if (item && sugEl && sugEl.contains(item)) {
        e.preventDefault();
        choose(sugItems[Number(item.getAttribute('data-i'))]);
        return;
      }
      if (sugEl && !queryInput.contains(e.target)) closeSuggest();
    });

    queryInput.addEventListener('keydown', function (e) {
      if (!sugItems.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sugIndex += e.key === 'ArrowDown' ? 1 : -1;
        if (sugIndex < 0) sugIndex = sugItems.length - 1;
        if (sugIndex >= sugItems.length) sugIndex = 0;
        [].forEach.call(sugEl.children, function (c, i) {
          c.classList.toggle('is-on', i === sugIndex);
          c.setAttribute('aria-selected', i === sugIndex ? 'true' : 'false');
        });
        return;
      }
      if (e.key === 'Enter' && sugIndex > -1) {
        e.preventDefault();
        choose(sugItems[sugIndex]);
        return;
      }
      if (e.key === 'Escape') closeSuggest();
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
