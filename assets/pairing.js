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

  /**
   * Every question is visible at once now, per the design's numbered headings —
   * numbering a sequence you can only see one step of is pointless. So this no
   * longer hides anything; it marks progress and scrolls the next question into
   * view, which is the useful half of what stepping did.
   *
   * The dots and the "question n of m" counter are gone from the markup, hence
   * the guards: this has to keep working if either is absent.
   */
  function showStep(n) {
    axes.forEach(function (axis, i) {
      axis.classList.toggle('is-answered', i < n);
      axis.classList.toggle('is-current', i === n);
    });

    if (dots && dots.length) {
      dots.forEach(function (dot, i) {
        dot.className =
          'non-pair__dot' + (i < n ? ' non-pair__dot--done' : i === n ? ' non-pair__dot--now' : '');
      });
    }
    if (stepEl) {
      stepEl.textContent =
        n >= axes.length ? 'done' : 'question ' + (n + 1) + ' of ' + axes.length;
    }

    var next = axes[n];
    if (next && n > 0) {
      next.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function finish() {
    var code = leader();
    // The questions stay on screen. They are the page now, and hiding what was
    // answered to reveal a verdict leaves nothing to change your mind with.
    axes.forEach(function (a) { a.classList.add('is-answered'); });
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

  // What each axis currently contributes, so re-answering REPLACES rather than
  // stacks. With one question on screen at a time you could only ever answer
  // each axis once; now that all six are visible, clicking a second option in
  // the same axis used to add its scores on top of the first — two answers to
  // one question, silently double-counted.
  var chosen = {};

  function applyAxis(axisIndex, opt) {
    var prev = chosen[axisIndex];
    if (prev) {
      Object.keys(prev.delta).forEach(function (code) {
        scores[code] = (scores[code] || 0) - prev.delta[code];
      });
      var at = trace.indexOf(prev.line);
      if (prev.line && at !== -1) trace.splice(at, 1);
    }

    var delta = parseScores(opt.getAttribute('data-scores') || '');
    Object.keys(delta).forEach(function (code) {
      scores[code] = (scores[code] || 0) + delta[code];
    });

    var line = opt.getAttribute('data-trace');
    if (line) trace.push(line);

    chosen[axisIndex] = { delta: delta, line: line };
  }

  root.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-non-pair-opt]');
    if (opt) {
      var axis = opt.closest('[data-non-pair-axis]');
      var axisIndex = axis ? Number(axis.getAttribute('data-non-pair-axis')) : 0;

      // Radio behaviour within the axis. Nothing set aria-pressed before, which
      // is why a chosen option looked exactly like an unchosen one.
      if (axis) {
        axis.querySelectorAll('[data-non-pair-opt]').forEach(function (o) {
          o.setAttribute('aria-pressed', o === opt ? 'true' : 'false');
        });
      }

      var isFirstAnswer = !chosen[axisIndex];
      applyAxis(axisIndex, opt);
      renderTrace();

      // Only advance on a NEW answer. Changing your mind should not skip you
      // forward past a question you have not reached.
      if (isFirstAnswer) {
        step += 1;
        if (step >= axes.length) finish();
        else showStep(step);
      } else if (Object.keys(chosen).length >= axes.length) {
        finish();
      }
      return;
    }

    if (e.target.closest('[data-non-pair-reset]')) {
      chosen = {};
      root.querySelectorAll('[data-non-pair-opt]').forEach(function (o) {
        o.setAttribute('aria-pressed', 'false');
      });
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
