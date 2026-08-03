/* ==========================================================================
   NON — pairing tool (food → bottle)

   Each answer contributes scores per bottle code; the running total picks a
   winner. The verdict shows why, which is the point of the tool — the design
   deliberately exposed the reasoning rather than just the result. That
   reasoning is listed once, in the verdict column.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-non-pair]');
  if (!root) return;

  var axes = root.querySelectorAll('[data-non-pair-axis]');
  var dots = root.querySelectorAll('.non-pair__dot');
  var resultEl = root.querySelector('[data-non-pair-result]');
  var titleEl = root.querySelector('[data-non-pair-title]');
  var bodyEl = root.querySelector('[data-non-pair-body]');
  var picksEl = root.querySelector('[data-non-somm-picks]');
  var stepEl = document.querySelector('[data-non-pair-step]');
  var resetBtn = root.querySelector('[data-non-pair-reset]');
  var buyEl = root.querySelector('[data-non-pair-buy]');

  var reasons = {};
  var catalogue = {};

  try {
    reasons = JSON.parse(document.querySelector('[data-non-pair-reasons]').textContent);
  } catch (e) {
    /* The verdict still renders without these — it just loses the per-bottle
       paragraph, silently, so the tool looks thinner rather than broken. */
    console.warn('[NON pairing] reasons JSON missing or malformed — the verdict will show the answered lines but no per-bottle explanation.', e);
  }

  document.querySelectorAll('[data-non-catalogue]').forEach(function (n) {
    try { Object.assign(catalogue, JSON.parse(n.textContent)); } catch (e) {
      console.warn('[NON pairing] catalogue JSON failed to parse — the verdict cannot show the bottle or its add-to-cart.', e);
    }
  });
  if (!Object.keys(catalogue).length) {
    console.warn('[NON pairing] no catalogue on this page: the tool will pick a bottle code but cannot name it, price it or sell it.');
  }

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

  /* The trace panel under the photograph is gone.
     It printed the answered lines a second time, as "— line" divs, while the
     verdict column already lists the identical lines as .non-pair__why. Two
     copies of the same reasoning either side of one result reads as a bug, not
     as emphasis. `trace` is still collected — the verdict column is built from
     it — it simply is not mirrored under the picture any more. */

  /**
   * The questions are dynamic: they load as you answer, and a question that
   * your earlier answer made meaningless never appears.
   *
   * All three used to render at once and score independently, so "Dessert &
   * cheese" sat next to a live "How is it cooked?" offering Raw or cured —
   * you could tell the tool you were eating a raw cheese board, and it would
   * score it. An option can now declare which later questions it retires
   * (4th field, `data-skip`), and anything beyond the question you are on
   * stays hidden until you get there.
   *
   * Everything derives from `chosen` rather than from a step counter, because
   * changing an earlier answer can retire or restore a later question and a
   * counter cannot describe that.
   */

  function skippedSet() {
    var out = {};
    Object.keys(chosen).forEach(function (i) {
      (chosen[i].skip || []).forEach(function (n) { out[n] = true; });
    });
    return out;
  }

  var lastRevealed = 0;

  function refresh() {
    var sk = skippedSet();

    // An answer to a question that has since been retired must not keep
    // scoring. Drop it and clear its pressed state.
    axes.forEach(function (axis, i) {
      if (sk[i] && chosen[i]) {
        removeAxis(i);
        axis.querySelectorAll('[data-non-pair-opt]').forEach(function (o) {
          o.setAttribute('aria-pressed', 'false');
        });
      }
    });

    var active = [];
    axes.forEach(function (a, i) { if (!sk[i]) active.push(i); });

    var firstUnanswered = -1;
    for (var k = 0; k < active.length; k++) {
      if (!chosen[active[k]]) { firstUnanswered = k; break; }
    }
    var revealUpTo = firstUnanswered === -1 ? active.length - 1 : firstUnanswered;

    axes.forEach(function (axis, i) {
      var isSkipped = !!sk[i];
      var pos = active.indexOf(i);
      axis.hidden = isSkipped || pos > revealUpTo;
      axis.classList.toggle('is-skipped', isSkipped);
      axis.classList.toggle('is-answered', !!chosen[i]);
      axis.classList.toggle('is-current', !axis.hidden && pos === revealUpTo && firstUnanswered !== -1);
    });

    // Renumber what is actually on screen. Leaving 01 / 03 with 02 retired
    // reads as a missing question rather than an irrelevant one.
    var n = 0;
    axes.forEach(function (axis) {
      if (axis.hidden) return;
      n += 1;
      var el = axis.querySelector('.non-pair__n');
      if (el) el.textContent = (n < 10 ? '0' : '') + n;
    });

    if (dots && dots.length) {
      dots.forEach(function (dot, i) {
        dot.className =
          'non-pair__dot' +
          (i < revealUpTo ? ' non-pair__dot--done' : i === revealUpTo ? ' non-pair__dot--now' : '');
      });
    }
    if (stepEl) {
      stepEl.textContent =
        firstUnanswered === -1 ? 'done' : 'question ' + (revealUpTo + 1) + ' of ' + active.length;
    }

    if (revealUpTo > lastRevealed && firstUnanswered !== -1) {
      var next = axes[active[revealUpTo]];
      if (next) next.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    lastRevealed = revealUpTo;

    if (active.length && firstUnanswered === -1) {
      finish();
    } else {
      // Changing an earlier answer can reopen a question, and the verdict from
      // the previous run must not sit there looking current while it is being
      // re-asked. Nothing is shown again until there is a complete answer.
      resultEl.hidden = true;
      if (buyEl) buyEl.hidden = true;
      if (picksEl) picksEl.hidden = true;
    }
  }

  function finish() {
    var code = leader();
    if (window.NON && NON.answered) {
      /* answers_used is the useful one: it tells you whether the dynamic
         question flow is retiring questions as intended, or whether people
         are being asked things that do not apply to them. */
      NON.answered('pairing', {
        bottle: code || 'none',
        answers_used: Object.keys(chosen).length,
        resolved: !!catalogue[code]
      });
    }
    if (!catalogue[code] && window.NON && NON.failed) {
      NON.failed('pairing', { reason: 'bottle_not_in_catalogue', bottle: code || 'none' });
    }
    // The questions stay on screen. They are the page now, and hiding what was
    // answered to reveal a verdict leaves nothing to change your mind with.
    resultEl.hidden = false;

    var product = catalogue[code];
    titleEl.textContent = product ? product.title + ' is your bottle.' : 'Here is your bottle.';

    // WHY IT WORKS FOR WHAT WAS ANSWERED — not the bottle's general blurb.
    //
    // Every option already carries its own line explaining what that answer
    // implies ("Light plates, salinity before weight", "Caramelised meets
    // caramelised"). That IS the reasoning, and it was only ever shown in the
    // trace panel off to the side, while the verdict printed a static
    // per-bottle paragraph that would have read identically whatever you
    // clicked. The generic line still runs, but last and as context.
    bodyEl.innerHTML = '';
    if (trace.length) {
      var ul = document.createElement('ul');
      ul.className = 'non-pair__why';
      trace.forEach(function (line) {
        var li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
      });
      bodyEl.appendChild(ul);
    }
    if (reasons[code]) {
      var gen = document.createElement('p');
      gen.className = 'non-pair__whygen';
      gen.textContent = reasons[code];
      bodyEl.appendChild(gen);
    }

    // The bottle, with a real add to cart, sitting IN the verdict rather than
    // under the photograph in the side column. Someone who has just been told
    // which bottle to buy should not have to go looking for it.
    if (product && buyEl) {
      var addLabel = buyEl.getAttribute('data-add-label') || 'Add';
      buyEl.innerHTML =
        '<a class="non-pair__buyimg" href="' + product.url + '">' +
        (product.image ? '<img src="' + product.image + '" alt="" loading="lazy">' : '') +
        '</a>' +
        '<span class="non-pair__buymeta">' +
        '<span class="non-mono non-pair__buycode">' + code + '</span>' +
        '<a class="non-pair__buyname" href="' + product.url + '">' + product.title + '</a>' +
        '<span class="non-pair__buyprice">' + product.price + '</span>' +
        '</span>' +
        (product.variantId
          ? '<button type="button" class="non-pair__add" data-non-add data-variant-id="' +
            product.variantId + '">' + addLabel + '</button>'
          : '<a class="non-pair__add" href="' + product.url + '">' + addLabel + '</a>');
      buyEl.hidden = false;
    }
  }

  // What each axis currently contributes, so re-answering REPLACES rather than
  // stacks. With one question on screen at a time you could only ever answer
  // each axis once; now that all six are visible, clicking a second option in
  // the same axis used to add its scores on top of the first — two answers to
  // one question, silently double-counted.
  var chosen = {};

  function removeAxis(axisIndex) {
    var prev = chosen[axisIndex];
    if (!prev) return;
    Object.keys(prev.delta).forEach(function (code) {
      scores[code] = (scores[code] || 0) - prev.delta[code];
    });
    var at = trace.indexOf(prev.line);
    if (prev.line && at !== -1) trace.splice(at, 1);
    delete chosen[axisIndex];
  }

  // Which later questions this answer retires. Authored in the block as a 4th
  // pipe field of question numbers as displayed ("Dessert & cheese | ... | 2"),
  // stored 0-based here.
  function parseSkip(str) {
    return (str || '')
      .split(/[,\s]+/)
      .map(function (s) { return parseInt(s, 10); })
      .filter(function (n) { return !isNaN(n) && n > 0; })
      .map(function (n) { return n - 1; });
  }

  function applyAxis(axisIndex, opt) {
    removeAxis(axisIndex);

    var delta = parseScores(opt.getAttribute('data-scores') || '');
    Object.keys(delta).forEach(function (code) {
      scores[code] = (scores[code] || 0) + delta[code];
    });

    var line = opt.getAttribute('data-trace');
    if (line) trace.push(line);

    chosen[axisIndex] = { delta: delta, line: line, skip: parseSkip(opt.getAttribute('data-skip')) };
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

      if (window.NON && NON.started) {
        NON.started('pairing', { axis: axisIndex, first_answer: !chosen[axisIndex] });
      }

      applyAxis(axisIndex, opt);

      // No step counter to advance. refresh() works out what is now relevant,
      // what is answered, and whether that leaves anything left to ask —
      // which is the only thing that can survive an earlier answer changing.
      refresh();
      return;
    }

    if (e.target.closest('[data-non-pair-reset]')) {
      chosen = {};
      root.querySelectorAll('[data-non-pair-opt]').forEach(function (o) {
        o.setAttribute('aria-pressed', 'false');
      });
      scores = {};
      trace = [];
      if (buyEl) { buyEl.hidden = true; buyEl.innerHTML = ''; }
      resultEl.hidden = true;
      if (picksEl) picksEl.hidden = true;
      lastRevealed = 0;
      refresh();
    }
  });

  refresh();
})();
