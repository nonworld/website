/* ==========================================================================
   NON — shop filter ("the somm is the filter")

   Reorders and annotates the rendered grid against the active food occasion.
   Scores come from each product's custom.food_tags metafield; the one-line
   reason from custom.food_why. Sets and accessories never answer a food
   question, so they pin to the end exactly as they did in the design.
   ========================================================================== */
(function () {
  'use strict';

  var shelf = document.querySelector('[data-non-shelf]');
  if (!shelf) return;

  var filters = document.querySelectorAll('[data-non-filter]');
  var sommLine = document.querySelector('[data-non-somm-line]');
  var countEl = document.querySelector('[data-non-count]');

  var DIM_ON = shelf.getAttribute('data-dim-enabled') === 'true';
  var DIM = Number(shelf.getAttribute('data-dim')) || 0.34;

  var items = Array.prototype.map.call(shelf.querySelectorAll('[data-non-item]'), function (el) {
    var tags = {};
    var why = {};
    try { tags = JSON.parse(el.getAttribute('data-tags') || '{}'); } catch (e) {}
    try { why = JSON.parse(el.getAttribute('data-why') || '{}'); } catch (e) {}
    return {
      el: el,
      card: el.querySelector('.non-card'),
      code: el.getAttribute('data-code'),
      isPour: el.getAttribute('data-is-pour') === 'true',
      tags: tags,
      why: why
    };
  });

  var pours = items.filter(function (i) { return i.isPour; });

  function apply(key) {
    var filtered = key !== 'all';

    // order: best match first, non-pours pinned to the end
    var ordered = filtered
      ? pours
          .slice()
          .sort(function (a, b) { return (b.tags[key] || 0) - (a.tags[key] || 0); })
          .concat(items.filter(function (i) { return !i.isPour; }))
      : items;

    var top = filtered && ordered.length ? ordered[0].tags[key] || 0 : 0;

    ordered.forEach(function (item) {
      shelf.appendChild(item.el);

      var score = filtered && item.isPour ? item.tags[key] || 0 : 0;
      var card = item.card;
      if (!card) return;

      // fade the bottles that don't answer
      card.classList.toggle('non-card--dim', DIM_ON && filtered && item.isPour && score === 0);
      card.style.setProperty('--non-dim', DIM);

      // "The pick" flag on the strongest match
      var flag = card.querySelector('.non-card__flag');
      var isPick = filtered && score === top && score > 0;
      if (isPick && !flag) {
        flag = document.createElement('span');
        flag.className = 'non-card__flag';
        flag.textContent = 'The pick';
        card.insertBefore(flag, card.firstChild);
      } else if (!isPick && flag) {
        flag.remove();
      }

      // the somm's reason for this bottle against this occasion
      var whyEl = card.querySelector('.non-card__why');
      var text = filtered && item.isPour ? item.why[key] : null;
      if (text) {
        if (!whyEl) {
          whyEl = document.createElement('p');
          whyEl.className = 'non-card__why';
          card.appendChild(whyEl);
        }
        whyEl.textContent = text;
      } else if (whyEl) {
        whyEl.remove();
      }
    });

    // prose line
    if (sommLine) {
      var active = document.querySelector('[data-non-filter="' + key + '"]');
      var line = active ? active.getAttribute('data-somm-line') : '';
      sommLine.hidden = !filtered || !line;
      sommLine.textContent = line || '';
    }

    // count
    if (countEl) {
      if (filtered) {
        var working = pours.filter(function (i) { return (i.tags[key] || 0) > 0; }).length;
        countEl.textContent = working + ' of ' + pours.length + ' bottles work here';
      } else {
        var sets = items.length - pours.length;
        countEl.textContent = pours.length + ' bottles · ' + sets + ' sets';
      }
    }

    filters.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-non-filter') === key ? 'true' : 'false');
    });

    // shareable state
    var url = new URL(window.location.href);
    if (filtered) url.searchParams.set('table', key);
    else url.searchParams.delete('table');
    window.history.replaceState({}, '', url);
  }

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(btn.getAttribute('data-non-filter'));
    });
  });

  // honour ?table=spice on load so the somm can deep-link into the shop
  var initial = new URL(window.location.href).searchParams.get('table');
  apply(initial && document.querySelector('[data-non-filter="' + initial + '"]') ? initial : 'all');
})();
