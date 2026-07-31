/* ==========================================================================
   NON — pairing tool (food → bottle)

   Each answer contributes scores per bottle code; the running total picks a
   winner. The trace panel shows why, which is the point of the tool — the
   design deliberately exposed the reasoning rather than just the result.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-non-pair]');
  if (!root) return;

  var axes = root.querySelectorAll('[data-non-pair-axis]');
  var dots = root.querySelectorAll('.non-pair__dot');
  var traceEl = root.querySelector('[data-non-pair-trace]');
  var resultEl = root.querySelector('[data-non-pair-result]');
  var titleEl = root.querySelector('[data-non-pair-title]');
  var bodyEl = root.querySelector('[data-non-pair-body]');
  var picksEl = root.querySelector('[data-non-somm-picks]');
  var stepEl = document.querySelector('[data-non-pair-step]');
  var resetBtn = root.querySelector('[data-non-pair-reset]');

  var reasons = {};
  var catalogue = {};

  try {
    reasons = JSON.parse(document.querySelector('[data-non-pair-reasons]').textContent);
  } catch (e) {}

  document.querySelectorAll('[data-non-catalogue]').forEach(function (n) {
    try { Object.assign(catalogue, JSON.parse(n.textContent)); } catch (e) {}
  });

  var step = 0;
  var scores = {};
  var trace = [];

  function parseScores(str) {
    var out = {};
    str.split(',').forEach(function (pair) {
      var bits = pair.split(':');
      if (bits.length === 2) out[bits[0].trim().toUpperCase()] = Number(bits[1]) || 0;
    });
    return out;
  }

  function leader() {
    var best = null;
    Object.keys(scores).forEach(function (code) {
      if (!best || scores[code] > scores[best]) best = code;
    });
    return best;
  }

  function renderTrace() {
    traceEl.innerHTML = trace
      .map(function (line) { return '<div>— ' + line + '</div>'; })
      .join('');
  }

  function showStep(n) {
    axes.forEach(function (axis, i) {
      axis.style.display = i === n ? '' : 'none';
    });
    dots.forEach(function (dot, i) {
      dot.className =
        'non-pair__dot' + (i < n ? ' non-pair__dot--done' : i === n ? ' non-pair__dot--now' : '');
    });
    if (stepEl) {
      stepEl.textContent =
        n >= axes.length ? 'done' : 'question ' + (n + 1) + ' of ' + axes.length;
    }
  }

  function finish() {
    var code = leader();
    axes.forEach(function (a) { a.style.display = 'none'; });
    resultEl.hidden = false;

    var product = catalogue[code];
    titleEl.textContent = product ? product.title + ' is your bottle.' : 'Here is your bottle.';
    bodyEl.textContent = reasons[code] || '';

    if (product && picksEl) {
      picksEl.innerHTML =
        '<a class="non-somm__pick" href="' + product.url + '">' +
        (product.image ? '<img src="' + product.image + '" alt="" loading="lazy">' : '') +
        '<span class="non-somm__pick-meta">' +
        '<span class="non-somm__pick-code">' + code + '</span>' +
        '<span class="non-somm__pick-name">' + product.title + '</span>' +
        '<span class="non-somm__pick-note">' + product.price + '</span>' +
        '</span></a>';
      picksEl.hidden = false;
    }

    showStep(axes.length);
  }

  root.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-non-pair-opt]');
    if (opt) {
      var delta = parseScores(opt.getAttribute('data-scores') || '');
      Object.keys(delta).forEach(function (code) {
        scores[code] = (scores[code] || 0) + delta[code];
      });

      var line = opt.getAttribute('data-trace');
      if (line) trace.push(line);
      renderTrace();

      step += 1;
      if (step >= axes.length) finish();
      else showStep(step);
      return;
    }

    if (e.target.closest('[data-non-pair-reset]')) {
      step = 0;
      scores = {};
      trace = [];
      resultEl.hidden = true;
      if (picksEl) picksEl.hidden = true;
      traceEl.textContent = 'Answer the questions and the somm will show its working.';
      showStep(0);
    }
  });

  showStep(0);
})();
