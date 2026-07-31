/* ==========================================================================
   NON Lotto — scratch and reveal

   The foil, the brushed grain and the tiled NON wordmark are ported verbatim
   from the design's canvas painter. What changed is where the prize comes from.

   ── API contract ─────────────────────────────────────────────────────────
   Endpoint set in Theme settings → NON Lotto. Hosted separately (Cloudflare
   Worker), because issuing a discount code is not something a browser may do.

     POST <endpoint>/draw
     → { "ref": "N° 4821",
         "prize": { "title": "15% off your first case",
                    "code":  "NON15-4F2A9C",
                    "terms": "Use it at checkout." } }

     The Worker should mint a single-use code via the Shopify Admin API
     (discountCodeBasicCreate) and rate-limit by IP/session. Weighting lives
     server-side — the odds table must not be readable from the page.

     POST <endpoint>/claim   { "ref": "N° 4821", "email": "you@email.com" }
     → { "ok": true }

     The claim call is where the email should be pushed to Klaviyo. Doing it
     server-side keeps the list-write key out of the theme.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-non-lotto]');
  if (!root) return;

  var ENDPOINT = (root.getAttribute('data-endpoint') || '').replace(/\/$/, '');
  var COOLDOWN_DAYS = Number(root.getAttribute('data-cooldown-days')) || 0;
  var REVEAL_AT = Number(root.getAttribute('data-reveal-at')) || 0.55;
  var DELAY = Number(root.getAttribute('data-delay')) || 1400;
  var AUTO = root.getAttribute('data-auto-open') === 'true';
  var KEY = 'non-lotto-seen';

  var canvas = root.querySelector('[data-non-lotto-foil]');
  var refEl = root.querySelector('[data-non-lotto-ref]');
  var winEl = root.querySelector('[data-non-lotto-win]');
  var codeEl = root.querySelector('[data-non-lotto-code]');
  var copyBtn = root.querySelector('[data-non-lotto-copy]');
  var copyLabel = root.querySelector('[data-non-lotto-copy-label]');
  var termsEl = root.querySelector('[data-non-lotto-terms]');
  var claimForm = root.querySelector('[data-non-lotto-claim]');

  var ctx = null;
  var drawing = false;
  var last = null;
  var ticks = 0;
  var revealed = false;
  var current = null;

  /* --- foil -------------------------------------------------------------- */

  function paintFoil() {
    if (!canvas || !canvas.parentElement) return;
    var rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    var c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = rect.width;
    var h = rect.height;

    var g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#e9e9ec');
    g.addColorStop(0.34, '#c2c2c8');
    g.addColorStop(0.5, '#eef0f2');
    g.addColorStop(0.68, '#b4b4bb');
    g.addColorStop(1, '#d2d2d7');
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // brushed grain
    c.save();
    c.globalAlpha = 0.14;
    c.strokeStyle = '#8f8f97';
    c.lineWidth = 1;
    for (var i = -h; i < w + h; i += 6) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + h, h);
      c.stroke();
    }
    c.restore();

    // tiled NON wordmark
    c.save();
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.font = '600 15px NONHelvetica, "Helvetica Neue", Helvetica, Arial, sans-serif';
    for (var y = 22; y < h + 24; y += 34) {
      var offset = (y / 34) % 2 === 0 ? 0 : -30;
      for (var x = 10 + offset; x < w + 60; x += 68) c.fillText('NON', x, y);
    }
    c.restore();

    c.save();
    c.globalCompositeOperation = 'multiply';
    var v = c.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, h * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(66,66,74,.26)');
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
    c.restore();

    c.globalCompositeOperation = 'destination-out';
    ctx = c;
    ticks = 0;
  }

  function scratchAt(e, moving) {
    if (!ctx || revealed) return;
    var r = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    var x = t.clientX - r.left;
    var y = t.clientY - r.top;
    var R = 19;

    if (moving && last) {
      var dist = Math.hypot(x - last[0], y - last[1]);
      var steps = Math.max(1, Math.floor(dist / 6));
      for (var i = 0; i <= steps; i++) {
        ctx.beginPath();
        ctx.arc(last[0] + (x - last[0]) * i / steps, last[1] + (y - last[1]) * i / steps, R, 0, 6.283);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, R, 0, 6.283);
      ctx.fill();
    }

    last = [x, y];
    if (++ticks % 5 === 0 && cleared() > REVEAL_AT) reveal();
  }

  function cleared() {
    if (!ctx) return 0;
    var img;
    try {
      img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) {
      return 0;
    }
    var d = img.data;
    var step = 32 * 4;
    var total = 0;
    var gone = 0;
    for (var i = 3; i < d.length; i += step) {
      total++;
      if (d[i] === 0) gone++;
    }
    return total ? gone / total : 0;
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (claimForm) claimForm.hidden = false;
  }

  /* --- draw -------------------------------------------------------------- */

  function draw() {
    if (!ENDPOINT) {
      // No endpoint: nothing to win. Say so rather than fake a code.
      winEl.textContent = window.NON.strings.lottoUnavailable;
      copyBtn.hidden = true;
      return Promise.reject(new Error('no endpoint'));
    }

    return fetch(ENDPOINT + '/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: window.location.pathname })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('draw ' + res.status);
        return res.json();
      })
      .then(function (data) {
        current = data;
        refEl.textContent = data.ref || '';
        winEl.textContent = (data.prize && data.prize.title) || '';
        codeEl.textContent = (data.prize && data.prize.code) || '';
        termsEl.textContent = (data.prize && data.prize.terms) || '';
        copyBtn.hidden = !(data.prize && data.prize.code);
      });
  }

  /* --- open / close ------------------------------------------------------ */

  // The panel animates in (cardIn scales from .98), so a single rAF measures it
  // mid-animation — or, if layout has not flushed at all, at the canvas's
  // default 300x150. Either way the foil ends up a different resolution to its
  // display box, and because scratch coordinates come from getBoundingClientRect
  // while the arcs are drawn in canvas space, every scratch lands offset.
  //
  // A ResizeObserver repaints whenever the panel's box actually settles, which
  // covers the open animation, orientation changes and window resizes alike.
  var observer = null;
  function watchFoil() {
    if (observer || typeof ResizeObserver === 'undefined' || !canvas.parentElement) return;
    observer = new ResizeObserver(function () {
      if (!root.hidden && !revealed) paintFoil();
    });
    observer.observe(canvas.parentElement);
  }

  function open() {
    root.hidden = false;
    revealed = false;
    if (claimForm) claimForm.hidden = true;
    watchFoil();
    requestAnimationFrame(function () { requestAnimationFrame(paintFoil); });

    draw().catch(function () {
      /* message already rendered */
    });
  }

  function close(remember) {
    if (remember) {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch (e) {}
    }
    root.hidden = true;
  }

  function suppressed() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      if (raw === '1') {
        localStorage.setItem(KEY, String(Date.now()));
        return true;
      }
      return (Date.now() - Number(raw)) / 86400000 < COOLDOWN_DAYS;
    } catch (e) {
      return false;
    }
  }

  /* --- events ------------------------------------------------------------ */

  canvas.addEventListener('mousedown', function (e) { last = null; drawing = true; scratchAt(e, false); e.preventDefault(); });
  canvas.addEventListener('mousemove', function (e) { if (drawing) scratchAt(e, true); });
  canvas.addEventListener('mouseup', function () { drawing = false; if (cleared() > REVEAL_AT) reveal(); });
  canvas.addEventListener('mouseleave', function () { drawing = false; });
  canvas.addEventListener('touchstart', function (e) { last = null; drawing = true; scratchAt(e, false); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { if (drawing) scratchAt(e, true); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', function () { drawing = false; if (cleared() > REVEAL_AT) reveal(); });

  // Keyboard and pointer-less access: scratching is decorative, so let anyone
  // who can't drag simply open the prize.
  canvas.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); }
  });
  canvas.setAttribute('tabindex', '0');

  copyBtn.addEventListener('click', function () {
    var code = codeEl.textContent;
    if (!code) return;
    try {
      navigator.clipboard.writeText(code);
      copyLabel.textContent = 'Copied';
    } catch (e) {}
  });

  if (claimForm) {
    claimForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = claimForm.querySelector('input').value;
      var btn = claimForm.querySelector('[data-non-lotto-send]');
      if (!ENDPOINT || !current) return;

      btn.disabled = true;
      fetch(ENDPOINT + '/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: current.ref, email: email })
      })
        .then(function () { btn.textContent = 'Saved ✓'; })
        .catch(function () { btn.textContent = 'Try again'; btn.disabled = false; });
    });
  }

  root.querySelector('[data-non-lotto-close]').addEventListener('click', function () { close(true); });

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-non-lotto-open]')) {
      e.preventDefault();
      open();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !root.hidden) close(true);
  });

  window.addEventListener('resize', function () {
    if (!root.hidden && !revealed) paintFoil();
  });

  /* --- auto-open --------------------------------------------------------- */

  if (AUTO && ENDPOINT && !suppressed()) {
    setTimeout(open, DELAY);
  }

  window.NON.lotto = { open: open, close: close };
})();
