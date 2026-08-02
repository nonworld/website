/* ==========================================================================
   NON — contact field

   The dash field from the supplied Contact Field export, ported off its design
   tool. The export shipped a `DCLogic` subclass plus a 69KB `support.js`
   runtime to provide it; none of that is needed to draw on a canvas, and
   shipping a framework to run one draw loop on one page would have cost more
   than the graphic.

   Ported faithfully — same geometry, same envelope, same ring and proximity
   maths — with four things the export did not have:

     1. prefers-reduced-motion. The export runs an unconditional
        requestAnimationFrame loop forever. Under reduced motion this now draws
        a single static frame and stops. The graphic still exists; it just
        holds still.
     2. Off-screen pausing. An IntersectionObserver stops the loop when the
        canvas scrolls out of view. A permanent rAF on a page someone has
        scrolled past is battery spent on nothing.
     3. Tab pausing. visibilitychange stops it in a background tab, where rAF
        is throttled rather than stopped and the work is entirely wasted.
     4. Theme ink. The export hardcoded rgba(255,255,255,…) on #000. The theme
        is #0c0c0c with #f2f0ea ink, so the colour comes in as a data attribute
        rather than being burned in.

   The pointer follow is the whole idea — the field leans toward the cursor, so
   the page reacts to you before you have typed anything. Without a pointer it
   orbits on its own, which is what a touch device gets.
   ========================================================================== */
(function () {
  'use strict';

  // Every instance on the page, not just the first. The field started life
  // bound to the one on Contact; putting it behind the Shop grid as well means
  // more than one can exist, and a single querySelector would silently animate
  // whichever happened to come first in the document.
  var fields = document.querySelectorAll('[data-non-contact-field]');
  if (!fields.length) return;
  Array.prototype.forEach.call(fields, Field);

  function Field(wrap) {
  var cv = wrap.querySelector('canvas');
  if (!cv || !cv.getContext) return;

  var ctx = cv.getContext('2d');
  var step = Math.max(8, Math.min(60, parseInt(wrap.getAttribute('data-density'), 10) || 20));
  var ink = wrap.getAttribute('data-ink') || '242,240,234';
  // Offset rather than centred: at 0.5 the envelope sits under the form column.
  var envX = parseFloat(wrap.getAttribute('data-envelope-x'));
  if (!(envX > 0 && envX < 1)) envX = 0.7;
  var envScale = parseFloat(wrap.getAttribute('data-envelope-scale'));

  // Brightness multiplier. The alpha below is mostly carried by the envelope
  // term, so switching the envelope off — as the pairing verdict does — takes
  // most of the light with it and the field reads as an empty box. gain lets
  // an instance without an envelope sit at the same visual weight.
  var gain = parseFloat(wrap.getAttribute('data-gain'));
  if (!(gain > 0)) gain = 1;
  if (!(envScale > 0)) envScale = 1.4;

  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var w = 0, h = 0, dpr = 1;
  var raf = null;
  var visible = false;
  var t0 = performance.now();
  var mouse = { x: 0, y: 0, on: false };

  function size() {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width;
    h = r.height;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    if (!raf) draw(performance.now() - t0);
  }

  function draw(t) {
    if (!w || !h) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Without a pointer the focus orbits, so a touch device still gets motion.
    var auto = {
      x: w / 2 + Math.cos(t * 0.0006) * w * 0.3,
      y: h / 2 + Math.sin(t * 0.00093) * h * 0.28
    };
    var px = mouse.on ? mouse.x : auto.x;
    var py = mouse.on ? mouse.y : auto.y;

    // The envelope, scaled to the panel rather than fixed, so it holds its
    // proportions in the narrow aside column as well as full width.
    var scale = Math.min(1, Math.min(w / 760, h / 520)) * envScale;
    var ew = 250 * scale, eh = 158 * scale;
    var ex = w * envX, ey = h / 2;

    // Keep it inside the canvas whatever the offset and scale say. A half-drawn
    // envelope hanging off the edge reads as a rendering fault, not a crop.
    ex = Math.max(ew / 2 + 8, Math.min(w - ew / 2 - 8, ex));

    function inEnv(x, y) {
      var dx = Math.abs(x - ex), dy = Math.abs(y - ey);
      if (dx > ew / 2 || dy > eh / 2) return 0;
      var edge = Math.min(ew / 2 - dx, eh / 2 - dy);
      var flapY = ey - eh / 2 + (dx / (ew / 2)) * (eh * 0.52);
      var onFlap = Math.abs(y - flapY) < 3.5 && y < ey + 6;
      return Math.min(1, edge / 5) * (onFlap ? 0.35 : 1);
    }

    for (var x = step; x < w; x += step) {
      for (var y = step; y < h; y += step) {
        var dx = x - px, dy = y - py;
        var d = Math.sqrt(dx * dx + dy * dy);
        var ring = Math.max(0, 1 - Math.abs(d - ((t * 0.055) % 320)) / 90);
        var near = Math.max(0, 1 - d / 190);
        var env = inEnv(x, y);
        var push = near * 9;
        var ux = d > 0.01 ? dx / d : 0;
        var uy = d > 0.01 ? dy / d : 0;
        var cxp = x + ux * push, cyp = y + uy * push;
        var len = 3 + near * 5 + ring * 3 + env * 4;
        var a = (0.1 + near * 0.45 + ring * 0.18 + env * 0.5) * gain;

        ctx.strokeStyle = 'rgba(' + ink + ',' + Math.min(0.95, a).toFixed(3) + ')';
        ctx.lineWidth = env > 0.5 ? 1 : 0.7;
        ctx.beginPath();
        ctx.moveTo(cxp - len / 2, cyp);
        ctx.lineTo(cxp + len / 2, cyp);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(' + ink + ',0.28)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(ex - ew / 2, ey - eh / 2, ew, eh);
    ctx.beginPath();
    ctx.moveTo(ex - ew / 2, ey - eh / 2);
    ctx.lineTo(ex, ey + eh * 0.02);
    ctx.lineTo(ex + ew / 2, ey - eh / 2);
    ctx.stroke();
  }

  function tick() {
    draw(performance.now() - t0);
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (raf || reduced) return;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = null;
  }

  window.addEventListener(
    'mousemove',
    function (e) {
      var r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.on =
        mouse.x > 0 && mouse.x < r.width && mouse.y > 0 && mouse.y < r.height;
    },
    { passive: true }
  );
  document.addEventListener('mouseleave', function () { mouse.on = false; });

  if (window.ResizeObserver) {
    new ResizeObserver(size).observe(wrap);
  } else {
    window.addEventListener('resize', size);
  }

  // Only run while on screen. The export looped forever regardless.
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    }, { threshold: 0 }).observe(wrap);
  } else {
    visible = true;
    start();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (visible) start();
  });

  size();
  // Reduced motion gets one frame and nothing further.
  if (reduced) draw(0);
  }
})();
