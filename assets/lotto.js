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
  var PRIZE_KEY = 'non-lotto-prize';

  var canvas = root.querySelector('[data-non-lotto-foil]');
  var refEl = root.querySelector('[data-non-lotto-ref]');
  var winEl = root.querySelector('[data-non-lotto-win]');
  var codeEl = root.querySelector('[data-non-lotto-code]');
  var copyBtn = root.querySelector('[data-non-lotto-copy]');
  var copyLabel = root.querySelector('[data-non-lotto-copy-label]');
  var termsEl = root.querySelector('[data-non-lotto-terms]');
  var gateForm = root.querySelector('[data-non-lotto-gate]');
  var panel = root.querySelector('[data-non-lotto-panel]');
  var errorEl = root.querySelector('[data-non-lotto-error]');
  var sentEl = root.querySelector('[data-non-lotto-sent]');
  var REVEAL_PATH = root.getAttribute('data-reveal-path') || '/lotto/reveal';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var unlocked = false;

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
    if (!ctx || revealed || !unlocked) return;
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
    if (++ticks % 5 === 0 && cleared() > REVEAL_AT) clearFoil();
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

  function clearFoil() {
    if (revealed) return;
    revealed = true;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /* --- draw -------------------------------------------------------------- */

  // One session id per browser session, so the Worker can correlate a reveal
  // with a visit. It is NOT the anti-farming key — that is the email, because
  // a session id is one private window away from being worthless.
  function sessionId() {
    try {
      var k = 'non-lotto-session';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = (crypto.randomUUID && crypto.randomUUID()) ||
            String(Date.now()) + Math.random().toString(16).slice(2);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return null;
    }
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }

  // Email in, code back, foil unlocked. Nothing is scratchable before this
  // resolves, so there is no state where a code exists on screen unclaimed.
  function reveal(email) {
    if (!ENDPOINT) {
      winEl.textContent = window.NON.strings.lottoUnavailable;
      copyBtn.hidden = true;
      return Promise.reject(new Error('no endpoint'));
    }

    return fetch(ENDPOINT + REVEAL_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, sessionId: sessionId() })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'reveal ' + res.status);
          return data;
        });
      })
      .then(function (data) {
        current = data;
        winEl.textContent = data.description || '';
        codeEl.textContent = data.code || '';
        termsEl.textContent = data.terms || '';
        copyBtn.hidden = !data.code;

        if (sentEl) {
          sentEl.hidden = false;
          sentEl.textContent = data.emailed
            ? (data.alreadyRevealed ? 'Already yours. Sent again to ' + email : 'Sent to ' + email)
            : 'Copy it down, the email did not go through';
        }

        // Remember the prize so the cart can show it. A code that only ever
        // existed in a dismissed modal is a code nobody uses — the moment it
        // matters is checkout, which is exactly when the card is long gone.
        if (data.code) {
          try {
            localStorage.setItem(PRIZE_KEY, JSON.stringify({
              code: data.code,
              description: data.description || '',
              terms: data.terms || '',
              at: Date.now()
            }));
            document.dispatchEvent(new CustomEvent('non:lotto:won', { detail: data }));
          } catch (e) {
            // Private browsing, or storage full. The code is on screen and in
            // the customer's inbox either way; losing the cart reminder is not
            // worth failing the reveal over.
          }
        }

        unlocked = true;
        if (panel) panel.classList.remove('is-locked');
        if (gateForm) gateForm.hidden = true;
        requestAnimationFrame(function () { requestAnimationFrame(paintFoil); });
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
    unlocked = false;
    if (panel) panel.classList.add('is-locked');
    if (gateForm) gateForm.hidden = false;
    if (sentEl) sentEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    watchFoil();
    requestAnimationFrame(function () { requestAnimationFrame(paintFoil); });

    // No endpoint means no prize. Say so up front rather than take an email
    // for something that cannot be delivered.
    if (!ENDPOINT) {
      winEl.textContent = window.NON.strings.lottoUnavailable;
      copyBtn.hidden = true;
      if (gateForm) gateForm.hidden = true;
    }
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
  canvas.addEventListener('mouseup', function () { drawing = false; if (cleared() > REVEAL_AT) clearFoil(); });
  canvas.addEventListener('mouseleave', function () { drawing = false; });
  canvas.addEventListener('touchstart', function (e) { last = null; drawing = true; scratchAt(e, false); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { if (drawing) scratchAt(e, true); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', function () { drawing = false; if (cleared() > REVEAL_AT) clearFoil(); });

  // Keyboard and pointer-less access: scratching is decorative, so let anyone
  // who can't drag simply open the prize.
  canvas.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && unlocked) { e.preventDefault(); clearFoil(); }
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

  if (gateForm) {
    gateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = gateForm.querySelector('input');
      var email = (input.value || '').trim();
      var btn = gateForm.querySelector('[data-non-lotto-reveal]');

      if (!EMAIL_RE.test(email)) {
        showError('That does not look like an email address.');
        input.focus();
        return;
      }

      if (errorEl) errorEl.hidden = true;
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'One moment';

      reveal(email)
        .catch(function (err) {
          showError(
            err.message === 'closed'
              ? window.NON.strings.lottoUnavailable
              : 'Could not reach the cellar door. Try again in a moment.'
          );
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = label;
        });
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

  // Never over the cart. The lotto is a full-viewport overlay at z-index 100
  // and the cart drawer sits at 95, so a timer that fires while someone is
  // checking out drops an invisible sheet over the Checkout button — the modal
  // is mid-fade and reads as nothing at all, so the page simply stops
  // responding. Buying always outranks a scratch card.
  function cartIsOpen() {
    var d = document.querySelector('[data-non-cart-drawer]');
    return !!d && !d.hidden;
  }

  function autoOpen() {
    if (suppressed()) return;
    if (cartIsOpen()) {
      // Wait for the drawer rather than dropping the offer entirely — try
      // again once, after it closes.
      document.addEventListener('non:cart:closed', function once() {
        document.removeEventListener('non:cart:closed', once);
        if (!suppressed()) setTimeout(open, 600);
      });
      return;
    }
    open();
  }

  if (AUTO && ENDPOINT && !suppressed()) {
    setTimeout(autoOpen, DELAY);
  }

  window.NON.lotto = { open: open, close: close };
})();
