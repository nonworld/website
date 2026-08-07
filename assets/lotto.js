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
  var teaserEl = root.querySelector('[data-non-lotto-teaser]');
  var realEl = root.querySelector('[data-non-lotto-real]');
  var hintEl = root.querySelector('[data-non-lotto-hint]');
  var REVEAL_PATH = root.getAttribute('data-reveal-path') || '/lotto/reveal';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var claimed = false;

  var ctx = null;
  var drawing = false;
  var last = null;
  var ticks = 0;
  var revealed = false;
  var current = null;

  // The real letterform, from the design's scratch card. Filled twice per tile
  // to emboss it — see paintFoil. Path2D is not in every browser we support, so
  // the wordmark degrades to nothing rather than throwing; the foil without its
  // watermark is still a foil.
  var NON_AR = 131.26 / 367.43;
  var NON_PATH = null;
  try {
    NON_PATH = new Path2D(
      'M285.19,3l66.07,101.74h.35V3h15.82V128.45H349.15L283.61,27.76h-.35V128.45H267.44V3ZM127.31,41a62,62,0,0,1,11.33-21,55.4,55.4,0,0,1,18.8-14.58Q168.69,0,183.63,0t26.18,5.45A55.4,55.4,0,0,1,228.61,20a62.15,62.15,0,0,1,11.33,21,82.52,82.52,0,0,1,0,49.38,62.15,62.15,0,0,1-11.33,21,54.43,54.43,0,0,1-18.8,14.49q-11.25,5.35-26.18,5.36t-26.19-5.36a54.43,54.43,0,0,1-18.8-14.49,62,62,0,0,1-11.33-21,82.52,82.52,0,0,1,0-49.38m15.37,43.4A50.93,50.93,0,0,0,150.41,101a39.66,39.66,0,0,0,13.53,11.86q8.26,4.48,19.69,4.48t19.68-4.48A39.66,39.66,0,0,0,216.84,101a50.93,50.93,0,0,0,7.73-16.61,72.38,72.38,0,0,0,0-37.42,50.93,50.93,0,0,0-7.73-16.61,39.66,39.66,0,0,0-13.53-11.86q-8.26-4.48-19.68-4.48t-19.69,4.48A39.66,39.66,0,0,0,150.41,30.4,50.93,50.93,0,0,0,142.68,47a72.38,72.38,0,0,0,0,37.42M17.75,3,83.82,104.73h.35V3H100V128.45H81.71L16.17,27.76h-.36V128.45H0V3Z'
    );
  } catch (e) {
    NON_PATH = null;
  }

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

    // Brushed grain — WIDE ALTERNATING BANDS, white against grey, not hairlines.
    //
    // This is what makes it read as foil rather than as flat grey card. The
    // gradient underneath was already right; the previous pass drew the grain
    // as uniform 1px #8f8f97 strokes every 6px, which is a screen door laid
    // over the gradient. It removes the highlights instead of creating them —
    // every sixth pixel darkened, nothing ever lightened. The design alternates
    // 20px-wide white and grey parallelograms on a 40px pitch, so the surface
    // catches light in broad strips. That is the vibrancy.
    c.save();
    c.globalAlpha = 0.14;
    for (var x = -h; x < w; x += 40) {
      c.fillStyle = ((x / 40) | 0) % 2 ? '#ffffff' : '#8f8f97';
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 20, 0);
      c.lineTo(x + 20 - h, h);
      c.lineTo(x - h, h);
      c.closePath();
      c.fill();
    }
    c.restore();

    // Tiled NON wordmark, EMBOSSED — the real letterform filled twice, a white
    // highlight offset by 0.8px under a grey body. It was fillText() in flat
    // white, which is why it read as a watermark printed on the foil rather
    // than as something stamped into it.
    var logoW = 46;
    var s = logoW / 367.43;
    var logoH = logoW * NON_AR;
    var stepX = logoW + 24;
    var stepY = logoH + 20;
    var row = 0;
    for (var y = 8; NON_PATH && y < h + logoH; y += stepY) {
      var offX = row % 2 ? -(stepX / 2) : 0;
      for (var lx = offX; lx < w; lx += stepX) {
        c.save();
        c.translate(lx + 0.8, y + 0.8);
        c.scale(s, s);
        c.fillStyle = 'rgba(255,255,255,.42)';
        c.fill(NON_PATH);
        c.restore();

        c.save();
        c.translate(lx, y);
        c.scale(s, s);
        c.fillStyle = 'rgba(92,92,100,.5)';
        c.fill(NON_PATH);
        c.restore();
      }
      row++;
    }

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
    // No `unlocked` check any more. The foil is scratchable the moment the card
    // opens — it was gated on the email, so the one thing on screen that looks
    // interactive did nothing until you filled in a field above it.
    if (!ctx || revealed) return;
    if (hintEl && !hintEl.hidden) hintEl.hidden = true;
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

  // The foil comes off, and THAT is what brings up the claim. The ask lands on
  // a prize already won rather than in front of one.
  function clearFoil() {
    if (revealed) return;
    revealed = true;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (hintEl) hintEl.hidden = true;
    if (canvas) canvas.classList.add('is-off');

    // No endpoint means no prize to claim. Say so instead of taking an email
    // for something that cannot be delivered.
    if (!ENDPOINT) {
      showTeaser(false);
      winEl.textContent = window.NON.strings.lottoUnavailable;
      copyBtn.hidden = true;
      return;
    }

    if (gateForm && !claimed) {
      gateForm.hidden = false;
      var field = gateForm.querySelector('input');
      if (field) field.focus({ preventScroll: true });
    }
  }

  function showTeaser(on) {
    if (teaserEl) teaserEl.hidden = !on;
    if (realEl) realEl.hidden = on;
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

  // Email in, code back. The foil is already off by the time this runs, so what
  // this does is swap the teaser under it for the real prize. The code still
  // does not exist in the document until the API has issued one — re-ordering
  // the flow gave nothing away, because there was never anything there to give.
  function claim(email) {
    if (!ENDPOINT) {
      showTeaser(false);
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

        /* "No thanks" is the wrong word once the prize is theirs. Relabel the
         * footer button to a plain dismissal so the way out stops reading as
         * a refusal of the thing they just claimed. */
        var noBtn = root.querySelector('.non-lotto__no');
        if (noBtn) noBtn.textContent = noBtn.getAttribute('data-done-label') || 'Done';

        /* And the footer line, for the same reason one line up. "While stocks
         * last" is a stock caveat that belongs on the three faces BEFORE the
         * reveal; printed under a code the customer has just been given, it
         * answers a question nobody asked and reads as a condition on the
         * prize. Swapped only here, at the point a code actually exists, so
         * the unscratched and claim faces keep the caveat that is true of
         * them. */
        var footEl = root.querySelector('[data-non-lotto-foot]');
        if (footEl) footEl.textContent = footEl.getAttribute('data-won-label') || 'You won';

        if (sentEl) {
          sentEl.hidden = false;
          sentEl.textContent = data.emailed
            ? (data.alreadyRevealed ? 'Already yours. Sent again to ' + email : 'Sent to ' + email)
            : 'Copy it down, the email did not go through';
        }

        // Remember the prize so the cart can show it. A code that only ever
        // existed in a dismissed modal is a code nobody uses — the moment it
        // matters is checkout, which is exactly when the card is long gone.
        /* Both, or neither. Storing a code with an empty description is what
           produced a cart panel reading "YOU WON" above a blank line: the
           record satisfied every guard downstream while describing nothing.
           If the API did not name the prize, there is nothing for the cart to
           show and nothing worth remembering. */
        if (data.code && data.description && String(data.description).trim()) {
          try {
            localStorage.setItem(PRIZE_KEY, JSON.stringify({
              code: data.code,
              description: String(data.description).trim(),
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

        claimed = true;
        showTeaser(false);
        if (gateForm) gateForm.hidden = true;
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

  var lastFocus = null;

  /* Tab stays inside the card while it is open. A modal that lets focus walk
     out into the page behind it is, to a keyboard or screen-reader user, not a
     modal at all — they tab into content that is visually covered and cannot
     tell what has focus. */
  function trapTab(e) {
    if (e.key !== 'Tab' || root.hidden) return;
    var card = root.querySelector('.non-lotto__card');
    if (!card) return;
    var focusable = card.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open() {
    // Remembered so it can be handed back on close. Dismissing a modal should
    // return a keyboard user to where they were, not to the top of the page.
    lastFocus = document.activeElement;
    root.hidden = false;
    revealed = false;
    claimed = false;
    showTeaser(true);
    if (gateForm) gateForm.hidden = true;
    if (hintEl) hintEl.hidden = false;
    if (canvas) canvas.classList.remove('is-off');
    if (sentEl) sentEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    watchFoil();
    requestAnimationFrame(function () { requestAnimationFrame(paintFoil); });

    // Focus the close control, not the foil: the first thing a screen-reader
    // user needs from an unrequested overlay is the way out of it.
    var x = root.querySelector('.non-lotto__x');
    if (x) x.focus({ preventScroll: true });
    document.addEventListener('keydown', trapTab, true);
    // The page behind is inert while this is up, so a screen reader does not
    // read a card and a product page as one document.
    var shell = document.querySelector('.non-shell');
    if (shell) shell.setAttribute('aria-hidden', 'true');
  }

  function close(remember) {
    if (remember) {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch (e) {}
    }
    root.hidden = true;
    document.removeEventListener('keydown', trapTab, true);
    var shell = document.querySelector('.non-shell');
    if (shell) shell.removeAttribute('aria-hidden');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
      lastFocus = null;
    }
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

  /* Pointer events with CAPTURE, replacing separate mouse and touch handlers.
   *
   * The bug this fixes: mouseleave set drawing = false, and nothing set it back
   * except a fresh mousedown. So holding the button, drifting off the foil and
   * coming back left a dead cursor — you had to click again to carry on. On a
   * small panel you cross that edge constantly, which made the card feel
   * broken rather than fiddly.
   *
   * setPointerCapture retargets every later pointermove and pointerup to this
   * canvas until release, so the stroke continues off the element and resumes
   * on the way back in — the same contract a native slider has. It also
   * collapses mouse, touch and pen into one path instead of two that had to be
   * kept in step.
   *
   * pointercancel matters on touch: the OS takes the pointer away for a
   * gesture and no pointerup ever arrives, which would otherwise leave drawing
   * stuck true and the next tap scratching from wherever the last one ended.
   */
  canvas.addEventListener('pointerdown', function (e) {
    last = null;
    drawing = true;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* non-fatal */ }
    }
    scratchAt(e, false);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (drawing) scratchAt(e, true);
  });

  function endStroke(e) {
    if (!drawing) return;
    drawing = false;
    last = null;
    if (e && e.pointerId != null && canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    }
    if (cleared() > REVEAL_AT) clearFoil();
  }

  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // Keyboard and pointer-less access: scratching is decorative, so let anyone
  // who can't drag simply open the prize.
  canvas.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clearFoil(); }
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

      claim(email)
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

  /* Every close control, not just the one.
   *
   * There used to be a single exit — the "No thanks" button in the footer —
   * plus Escape. A phone has no Escape key, so on mobile that button was the
   * only way out, and after someone claims a prize a button reading "No
   * thanks" reads as handing it back. People would not press it, and there was
   * nothing else to press.
   *
   * querySelectorAll, so the new × in the card is wired by the same line. */
  /* DELEGATED, not bound per element. Both controls were wired by the line
     that used to be here, and "No thanks" still did not close the card in
     testing while the x did. A per-element listener depends on the element
     existing and surviving unchanged at bind time; delegation on the root
     cannot miss one, whatever happens to the markup in between. Since the
     symptom was one control working and its twin not, the fix is to stop
     having two bindings that can diverge. */
  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-non-lotto-close]')) {
      e.preventDefault();
      close(true);
    }
  });

  /* Tap the scrim to dismiss. The root IS the scrim — position: fixed, inset 0
   * — so anything outside the card counts, which is the behaviour every modal
   * on a phone is expected to have. */
  root.addEventListener('click', function (e) {
    if (!e.target.closest('.non-lotto__card')) close(true);
  });

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

  /* The Somm sheet outranks this for the same reason the cart drawer does: it
   * is a modal the customer opened on purpose, and this is an offer nobody
   * asked for. Dropping a scratch card over a conversation someone is having
   * about which bottle to buy interrupts the exact intent the offer exists to
   * encourage. */
  function sommIsOpen() {
    return !!(window.NON && NON.somm && NON.somm.isOpen && NON.somm.isOpen());
  }

  /* And not while an Add to Cart is in flight. The window is short — a few
   * hundred milliseconds — but it is precisely the moment when a full-screen
   * overlay is most expensive, because the customer is mid-purchase and the
   * card lands between their tap and the drawer opening. */
  var adding = 0;
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-non-add], [data-non-somm-add], .non-atc, [data-non-upsell-add]')) {
      adding = Date.now();
    }
  }, true);
  function midPurchase() {
    return Date.now() - adding < 4000;
  }

  function autoOpen() {
    if (suppressed()) return;
    if (cartIsOpen() || sommIsOpen() || midPurchase()) {
      /* Wait for whichever it was rather than dropping the offer entirely —
         try again once, after the coast is clear. Both events are listened for
         because either could be the thing in the way, and `once` removes both
         so a later close cannot fire a second attempt. */
      var retry = function () {
        document.removeEventListener('non:cart:closed', retry);
        document.removeEventListener('non:somm:closed', retry);
        if (suppressed()) return;
        setTimeout(function () {
          if (!cartIsOpen() && !sommIsOpen() && !midPurchase()) open();
        }, 600);
      };
      document.addEventListener('non:cart:closed', retry);
      document.addEventListener('non:somm:closed', retry);
      /* Nothing is open — we are only inside the add-to-cart window — so no
         close event is coming. Come back after it lapses. */
      if (!cartIsOpen() && !sommIsOpen()) setTimeout(retry, 4200);
      return;
    }
    open();
  }

  /* --- WHEN IT IS ALLOWED TO APPEAR ----------------------------------------
   *
   * It used to be `setTimeout(autoOpen, 1400)` — 1.4 seconds into the FIRST
   * page a visitor ever sees. On a phone it covered the product image and the
   * buy button before anyone had read what NON is, which means the strongest
   * thing on the site was competing with a scratch card and losing.
   *
   * Now it waits for a reason to believe the person is interested:
   *
   *   - never on the first page view of a session. A second page is itself the
   *     signal — they came back for more.
   *   - on that second page, still not immediately: either real scroll depth
   *     (half the page), real dwell (25s), or exit intent.
   *   - never while the cart is open, which was already true and still is.
   *
   * Whichever fires first wins, and it fires once. The page-view count is
   * sessionStorage, so it resets with the visit rather than following someone
   * around for a fortnight — the point is "engaged NOW", not "has been here
   * before".
   */
  var VIEWS_KEY = 'non-lotto-views';

  function bumpViews() {
    try {
      var n = Number(sessionStorage.getItem(VIEWS_KEY) || 0) + 1;
      sessionStorage.setItem(VIEWS_KEY, String(n));
      return n;
    } catch (e) {
      // Private browsing: treat every view as the first, which errs towards
      // not interrupting. Showing nothing is the safe failure here.
      return 1;
    }
  }

  function armTriggers() {
    var fired = false;
    var timers = [];

    function go(why) {
      if (fired || suppressed()) return;
      fired = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mouseout', onExit);
      if (window.NON && NON.track) NON.track('lotto_trigger', { why: why });
      autoOpen();
    }

    function onScroll() {
      var h = document.documentElement;
      var depth = (h.scrollTop + window.innerHeight) / Math.max(h.scrollHeight, 1);
      if (depth >= 0.5) go('scroll');
    }

    // Exit intent, desktop only in practice: the pointer leaving through the
    // top of the window. relatedTarget null means it left the document rather
    // than moving between elements.
    function onExit(e) {
      if (!e.relatedTarget && e.clientY <= 0) go('exit');
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mouseout', onExit);
    timers.push(setTimeout(function () { go('dwell'); }, 25000));
  }

  if (AUTO && ENDPOINT && !suppressed()) {
    if (bumpViews() >= 2) armTriggers();
  }

  window.NON.lotto = { open: open, close: close };
})();
