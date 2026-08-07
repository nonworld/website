/* ==========================================================================
   NON — the spinning globe.

   Ported from the standalone design prototype. The prototype ran inside a
   component framework with a props object and a 100vh flex wrapper; here it is
   a plain module that hydrates any [data-non-globe] element, reads its options
   off data attributes, and cleans up after itself.

   The geometry is unchanged, deliberately. The wireframe is a stack of rotated
   CSS circles, the tracking lines and the courier are drawn on a canvas in the
   globe's own 100-unit space, and the labels are DOM nodes positioned from the
   same projection. Only the plumbing around it is new.

   Two things it does that the prototype did not:

     - Stops when off screen. An IntersectionObserver pauses the rAF loop, so a
       globe scrolled past costs nothing. This one runs on a marketing page
       that people scroll through, not on a dedicated canvas.

     - Honours prefers-reduced-motion. It renders one static frame and stops.
       A perpetually spinning object is exactly what that setting is for.
   ========================================================================== */
(function () {
  'use strict';

  // The appearance's ink, read from the stylesheet rather than burned in.
  // One source of truth: the same --non-* token the CSS paints with, so a
  // canvas cannot drift out of step with the page it sits on.
  function themeRgb(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  var GLOBE_INK = themeRgb('--non-globe-glow-rgb', '255,255,255');


  var CITIES = [
    { n: 'SAN FRANCISCO', lat: 41.77, lon: -126.42 },
    { n: 'LOS ANGELES', lat: 31.05, lon: -113.24 },
    { n: 'LAS VEGAS', lat: 42.17, lon: -108.14 },
    { n: 'AUSTIN', lat: 12.27, lon: -99.74 },
    { n: 'CHICAGO', lat: 44.88, lon: -89.63 },
    { n: 'NEW YORK', lat: 38.71, lon: -71.01 },
    { n: 'LONDON', lat: 52.51, lon: -8.13 },
    { n: 'ANTWERP', lat: 57.22, lon: 5.4 },
    { n: 'PARIS', lat: 44.86, lon: 15.35 },
    { n: 'BANGKOK', lat: 13.76, lon: 100.5 },
    { n: 'SINGAPORE', lat: 1.35, lon: 103.82 },
    { n: 'HONG KONG', lat: 22.32, lon: 114.17 },
    { n: 'SHANGHAI', lat: 24.23, lon: 121.47 },
    { n: 'SEOUL', lat: 40.57, lon: 129.98 },
    { n: 'TOKYO', lat: 33.68, lon: 141.69 },
    { n: 'MELBOURNE', lat: -37.81, lon: 144.96 },
    { n: 'SYDNEY', lat: -18.87, lon: 158.21 },
    { n: 'AUCKLAND', lat: -40.85, lon: 177.76 }
  ];

  // Meridian rings, then the equator and the parallels either side of it.
  var MERIDIANS = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5];

  var D = Math.PI / 180;

  function project(lat, lon, r, spin) {
    var la = lat * D;
    var lo = (lon + spin) * D;
    var x = r * Math.cos(la) * Math.sin(lo);
    var y = -r * Math.sin(la);
    var z = r * Math.cos(la) * Math.cos(lo);
    // Axial tilt, then a small lean toward the viewer. Matches the CSS
    // transform on the wireframe exactly, which is what keeps the canvas
    // overlay and the DOM rings in register.
    var rx = -14 * D;
    var rz = -23.4 * D;
    var y1 = y * Math.cos(rx) - z * Math.sin(rx);
    var z1 = y * Math.sin(rx) + z * Math.cos(rx);
    return {
      x: x * Math.cos(rz) - y1 * Math.sin(rz),
      y: x * Math.sin(rz) + y1 * Math.cos(rz),
      z: z1
    };
  }

  function wrap180(d) {
    var v = d % 360;
    if (v > 180) v -= 360;
    if (v < -180) v += 360;
    return v;
  }

  function ring(style) {
    var el = document.createElement('div');
    el.className = 'non-globe__ring';
    el.setAttribute('style', style);
    return el;
  }

  function build(root) {
    var size = Number(root.getAttribute('data-size')) || 520;
    var lapSeconds = Number(root.getAttribute('data-lap')) || 34;
    var logoLapSeconds = Number(root.getAttribute('data-logo-lap')) || 9;
    var logoSrc = root.getAttribute('data-logo') || '';

    var stage = document.createElement('div');
    stage.className = 'non-globe__stage';
    // The globe is authored in a 100x100 box and scaled, so every offset in
    // the geometry below is in those same units and never has to be rewritten
    // for a different display size.
    // Sized to whichever is smaller: the chosen size, or the box it is standing
    // in. data-size was applied unconditionally, so a 420-unit globe rendered a
    // 420px stage inside a 331px column on a phone and overflow: hidden sliced
    // 89px off it — the globe looked cropped rather than small. Re-run on
    // resize because the crop only appears at widths the first paint may not
    // have been at (rotation, or a desktop window dragged narrow).
    function fitStage() {
      var avail = root.clientWidth || size;
      var s = Math.min(size, avail);
      stage.style.transform = 'scale(' + (s / 100).toFixed(3) + ')';
    }
    stage.style.transform = 'scale(' + (size / 100).toFixed(3) + ')';

    var glow = document.createElement('div');
    glow.className = 'non-globe__glow';
    stage.appendChild(glow);

    var tilt = document.createElement('div');
    tilt.className = 'non-globe__tilt';

    var spinner = document.createElement('div');
    spinner.className = 'non-globe__spin';

    MERIDIANS.forEach(function (deg, i) {
      spinner.appendChild(
        ring(
          'position:absolute;inset:0;border:0.4px solid rgba(' + GLOBE_INK + ',' +
            (i === 0 ? 0.7 : 0.4) +
            ');border-radius:50%;transform:rotateY(' + deg + 'deg);'
        )
      );
    });
    spinner.appendChild(ring('position:absolute;left:0;top:0;width:100px;height:100px;border:0.4px solid rgba(' + GLOBE_INK + ',0.4);border-radius:50%;transform:rotateX(90deg);'));
    spinner.appendChild(ring('position:absolute;left:6.7px;top:6.7px;width:86.6px;height:86.6px;border:0.4px solid rgba(' + GLOBE_INK + ',0.38);border-radius:50%;transform:rotateX(90deg) translateZ(25px);'));
    spinner.appendChild(ring('position:absolute;left:6.7px;top:6.7px;width:86.6px;height:86.6px;border:0.4px solid rgba(' + GLOBE_INK + ',0.38);border-radius:50%;transform:rotateX(90deg) translateZ(-25px);'));
    spinner.appendChild(ring('position:absolute;left:25px;top:25px;width:50px;height:50px;border:0.4px solid rgba(' + GLOBE_INK + ',0.3);border-radius:50%;transform:rotateX(90deg) translateZ(43.3px);'));
    spinner.appendChild(ring('position:absolute;left:25px;top:25px;width:50px;height:50px;border:0.4px solid rgba(' + GLOBE_INK + ',0.3);border-radius:50%;transform:rotateX(90deg) translateZ(-43.3px);'));

    tilt.appendChild(spinner);
    stage.appendChild(tilt);

    var canvas = document.createElement('canvas');
    canvas.className = 'non-globe__trace';
    canvas.width = 800;
    canvas.height = 800;
    stage.appendChild(canvas);

    var labelWrap = document.createElement('div');
    labelWrap.className = 'non-globe__labels';
    var labels = CITIES.map(function (c) {
      var el = document.createElement('div');
      el.className = 'non-globe__label';
      el.textContent = c.n;
      labelWrap.appendChild(el);
      return el;
    });
    stage.appendChild(labelWrap);

    var logo = null;
    if (logoSrc) {
      logo = document.createElement('img');
      logo.className = 'non-globe__logo';
      logo.src = logoSrc;
      logo.alt = '';
      logo.setAttribute('aria-hidden', 'true');
      stage.appendChild(logo);
    }

    root.appendChild(stage);
    fitStage();
    window.addEventListener('resize', fitStage);

    var ctx = canvas.getContext('2d');
    var visited = {};
    var start = null;
    var raf = null;
    var running = false;

    function frame(now) {
      if (start === null) start = now;
      var t = now - start;

      // The rotation IS the journey: whichever longitude is live faces the
      // viewer, so the globe is always showing the leg being flown.
      var frontLon = 144.96 + (t / (lapSeconds * 1000)) * 360;
      var spin = -frontLon;

      spinner.style.transform = 'rotateY(' + (spin % 360).toFixed(2) + 'deg)';

      ctx.setTransform(8, 0, 0, 8, 0, 0);
      ctx.clearRect(0, 0, 100, 100);
      ctx.lineCap = 'round';

      var pending = [];

      CITIES.forEach(function (c, k) {
        var d = wrap180(frontLon - c.lon);
        var near = Math.max(0, 1 - Math.abs(d) / 20);
        if (Math.abs(d) < 8) visited[k] = 1;

        var base = project(0, c.lon, 50, spin);
        var top = project(c.lat, c.lon, 50, spin);
        var front = top.z > 0;
        var dep = front ? 0.5 + (top.z / 50) * 0.5 : 0;
        var v = front ? Math.max(near, visited[k] ? 0.5 : 0) : 0;

        if (v > 0.02) {
          // The tracking line climbs the meridian from the equator to the city.
          for (var s = 1; s <= 16; s++) {
            var p0 = project(c.lat * ((s - 1) / 16), c.lon, 50, spin);
            var p1 = project(c.lat * (s / 16), c.lon, 50, spin);
            var zz = (p0.z + p1.z) / 2;
            var a = (zz > 0 ? 0.35 + (zz / 50) * 0.45 : 0.07) * v * (visited[k] ? 0.55 : 1);
            ctx.strokeStyle = 'rgba(' + GLOBE_INK + ',' + a.toFixed(3) + ')';
            ctx.lineWidth = 0.28;
            ctx.beginPath();
            ctx.moveTo(50 + p0.x, 50 + p0.y);
            ctx.lineTo(50 + p1.x, 50 + p1.y);
            ctx.stroke();
          }

          if (front) {
            ctx.fillStyle = 'rgba(' + GLOBE_INK + ',' + (dep * v).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(50 + top.x, 50 + top.y, 0.55 * dep, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(' + GLOBE_INK + ',' + (dep * v * 0.6).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(50 + base.x, 50 + base.y, 0.3 * dep, 0, Math.PI * 2);
            ctx.fill();

            if (near > 0.7) {
              ctx.strokeStyle =
                'rgba(' + GLOBE_INK + ',' + (((near - 0.7) / 0.3) * 0.6 * dep).toFixed(3) + ')';
              ctx.lineWidth = 0.26;
              ctx.beginPath();
              ctx.arc(50 + top.x, 50 + top.y, 1.2 + (1 - near) * 9, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }

        var el = labels[k];
        var op = top.z > 14 ? near : 0;
        el.style.opacity = op.toFixed(3);
        if (op > 0.02) pending.push({ el: el, x: top.x, y: top.y });
        else el.style.transform = 'translate3d(' + top.x.toFixed(2) + 'px,' + top.y.toFixed(2) + 'px,0)';
      });

      // Collisions are resolved from the actual projected positions rather
      // than fixed slots, so labels separate only when they genuinely overlap.
      pending.sort(function (m, n) { return m.y - n.y; });
      for (var k2 = 1; k2 < pending.length; k2++) {
        var prev = pending[k2 - 1];
        var cur = pending[k2];
        if (Math.abs(cur.x - prev.x) < 26 && cur.y - prev.y < 4.2) cur.y = prev.y + 4.2;
      }
      pending.forEach(function (m) {
        m.el.style.transform = 'translate3d(' + m.x.toFixed(2) + 'px,' + m.y.toFixed(2) + 'px,0)';
      });

      drawCourier(frontLon, spin);

      if (logo) {
        // The logo sweeps across the front face only; it never rounds the far
        // side, so the mark is never seen mirrored.
        var sweep = (t / (logoLapSeconds * 1000)) * Math.PI * 2;
        var q = project(0, frontLon + 58 * Math.sin(sweep), 54, spin);
        var ldep = Math.max(0, q.z) / 54;
        logo.style.transform =
          'translate3d(' + q.x.toFixed(2) + 'px,' + q.y.toFixed(2) + 'px,' + q.z.toFixed(2) + 'px) ' +
          'scale(' + (0.75 + ldep * 0.5).toFixed(3) + ')';
        logo.style.opacity = (0.7 + ldep * 0.3).toFixed(3);
      }
    }

    // The courier rides whichever leg is facing the viewer, so it is always on
    // the front of the globe rather than disappearing behind it.
    function drawCourier(frontLon, spin) {
      var fl = (((frontLon + 180) % 360) + 360) % 360 - 180;
      var i = 0;
      for (var k = 0; k < CITIES.length; k++) {
        var curLon = CITIES[k].lon;
        var nxt = CITIES[(k + 1) % CITIES.length].lon + (k + 1 === CITIES.length ? 360 : 0);
        var f = fl < curLon && k === 0 ? fl + 360 : fl;
        if (f >= curLon && f < nxt) { i = k; break; }
        if (k === CITIES.length - 1) i = k;
      }

      var j = (i + 1) % CITIES.length;
      var a = CITIES[i];
      var b = CITIES[j];
      var lonA = a.lon;
      var lonB = b.lon + (j === 0 ? 360 : 0);
      var flAdj = fl < lonA ? fl + 360 : fl;

      var p = Math.min(1, Math.max(0, (flAdj - lonA) / (lonB - lonA)));
      p = p * p * (3 - 2 * p); // ease, so arrivals and departures settle

      var dlon = wrap180(b.lon - a.lon);
      function at(u) {
        return project(
          a.lat + (b.lat - a.lat) * u,
          a.lon + dlon * u,
          50 * (1 + 0.16 * Math.sin(Math.PI * u)), // lift off the surface mid-leg
          spin
        );
      }

      for (var s = 1; s <= 22; s++) {
        var u1 = Math.max(0, p - 0.16 * (s / 22));
        var u0 = Math.max(0, p - 0.16 * ((s - 1) / 22));
        var q0 = at(u0);
        var q1 = at(u1);
        if (q0.z < 0 && q1.z < 0) continue;
        ctx.strokeStyle = 'rgba(' + GLOBE_INK + ',' + (0.55 * (1 - s / 22)).toFixed(3) + ')';
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(50 + q0.x, 50 + q0.y);
        ctx.lineTo(50 + q1.x, 50 + q1.y);
        ctx.stroke();
      }

      var head = at(p);
      ctx.fillStyle = 'rgba(' + GLOBE_INK + ',0.95)';
      ctx.beginPath();
      ctx.arc(50 + head.x, 50 + head.y, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + GLOBE_INK + ',0.3)';
      ctx.lineWidth = 0.24;
      ctx.beginPath();
      ctx.arc(50 + head.x, 50 + head.y, 1.9, 0, Math.PI * 2);
      ctx.stroke();
    }

    function loop(now) {
      frame(now);
      raf = requestAnimationFrame(loop);
    }

    function play() {
      if (running) return;
      running = true;
      // Re-base the clock on resume so the globe picks up where it stopped
      // rather than jumping forward by however long it was off screen.
      var pausedFor = start === null ? 0 : performance.now() - lastSeen;
      if (start !== null) start += pausedFor;
      raf = requestAnimationFrame(loop);
    }

    var lastSeen = 0;
    function pause() {
      if (!running) return;
      running = false;
      lastSeen = performance.now();
      cancelAnimationFrame(raf);
    }

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // One frame, then nothing. The globe is still legible as an object.
      frame(performance.now());
      return;
    }

    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) play();
          else pause();
        });
      }, { rootMargin: '120px' }).observe(root);
    } else {
      play();
    }
  }

  function init() {
    document.querySelectorAll('[data-non-globe]').forEach(function (root) {
      if (root.getAttribute('data-non-globe-ready')) return;
      root.setAttribute('data-non-globe-ready', 'true');
      build(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // The theme editor re-renders a section into a fresh DOM node.
  document.addEventListener('shopify:section:load', init);
})();
