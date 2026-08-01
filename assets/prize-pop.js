/* ==========================================================================
   NON — the cork pop on a won prize.

   A cork launches out of the panel and the pop scatters. Monochrome, because
   the brand is: ink on paper, no confetti colours. What makes it read as
   celebration is the motion and the spin, not a palette.

   Fires ONCE per prize per browser. A burst every time the drawer opens stops
   being a celebration by the third viewing and starts being a tic.
   ========================================================================== */
(function () {
  'use strict';

  var FIRED_KEY = 'non-lotto-popped';

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function alreadyPopped(code) {
    try { return localStorage.getItem(FIRED_KEY) === code; } catch (e) { return false; }
  }

  function markPopped(code) {
    try { localStorage.setItem(FIRED_KEY, code); } catch (e) { /* private window */ }
  }

  /**
   * @param {HTMLElement} host  the prize panel — the burst is drawn over it
   */
  function pop(host) {
    var canvas = document.createElement('canvas');
    canvas.className = 'non-pop';
    host.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0;
    var h = 0;

    function size() {
      var r = host.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();

    // Launch point: the left of the panel, where the "You won" label sits, so
    // the cork appears to come off the words rather than the middle of nowhere.
    var ox = Math.min(70, w * 0.18);
    var oy = h * 0.5;

    var INK = '35,31,32';
    var bits = [];

    // The cork itself — one heavier, slower body that arcs and tumbles.
    bits.push({
      cork: true,
      x: ox, y: oy,
      vx: 3.4 + Math.abs(Math.sin(1)) * 1.2,
      vy: -6.2,
      rot: 0, vr: 0.32,
      life: 1,
    });

    // The pop. Angles fan up and to the right, weighted upward, because a cork
    // leaves the bottle rather than falling out of it.
    for (var i = 0; i < 26; i++) {
      var a = (-Math.PI / 2) + (i / 26) * Math.PI * 0.9 - Math.PI * 0.12;
      var speed = 2.2 + (i % 5) * 0.85;
      bits.push({
        x: ox, y: oy,
        vx: Math.cos(a) * speed * 1.15,
        vy: Math.sin(a) * speed,
        rot: i, vr: (i % 2 ? 0.22 : -0.28),
        len: 3 + (i % 3),
        life: 1,
      });
    }

    var GRAV = 0.22;
    var DRAG = 0.985;
    var raf = null;

    function frame() {
      ctx.clearRect(0, 0, w, h);
      var alive = 0;

      for (var i = 0; i < bits.length; i++) {
        var b = bits[i];
        if (b.life <= 0) continue;

        b.vy += GRAV;
        b.vx *= DRAG;
        b.vy *= DRAG;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;
        b.life -= b.cork ? 0.012 : 0.018;

        if (b.y > h + 20) b.life = 0;
        if (b.life <= 0) continue;
        alive++;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, b.life));

        if (b.cork) {
          // A cork, not a rectangle: slightly tapered, with a band.
          ctx.fillStyle = 'rgba(' + INK + ',0.9)';
          ctx.fillRect(-3.5, -6, 7, 12);
          ctx.fillStyle = 'rgba(' + INK + ',0.55)';
          ctx.fillRect(-3.5, -1.5, 7, 2);
        } else {
          ctx.strokeStyle = 'rgba(' + INK + ',0.75)';
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-b.len, 0);
          ctx.lineTo(b.len, 0);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (alive) {
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        canvas.remove();
      }
    }

    host.classList.add('is-popping');
    raf = requestAnimationFrame(frame);

    // Belt and braces: if the tab is hidden the rAF loop never advances and the
    // canvas would sit there forever over the panel.
    setTimeout(function () {
      if (canvas.isConnected) { cancelAnimationFrame(raf); canvas.remove(); }
      host.classList.remove('is-popping');
    }, 6000);
  }

  function maybePop() {
    var box = document.querySelector('[data-non-cart-prize]');
    if (!box || box.hidden) return;

    var codeEl = box.querySelector('[data-non-cart-prize-code]');
    var code = codeEl ? codeEl.textContent.trim() : '';
    if (!code || alreadyPopped(code)) return;

    markPopped(code);
    if (reduced()) return; // the panel still appears, it just does not perform
    pop(box);
  }

  document.addEventListener('non:cart:updated', function () { setTimeout(maybePop, 60); });
  document.addEventListener('non:lotto:won', function () { setTimeout(maybePop, 400); });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(maybePop, 600); });

  window.NON = window.NON || {};
  window.NON.prizePop = maybePop;
})();
