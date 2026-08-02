/* "How it's made" — bottle switching and the draw-on reveal.
 *
 * No framework and no dependency. The whole behaviour is: set one CSS custom
 * property, swap five caption strings, and add a class when the rail comes
 * into view.
 *
 * Every optional target is guarded. This band is decorative — if anything here
 * throws, the drawings and copy are already in the HTML and stay legible; only
 * the animation and the switcher are lost. A thrown handler must never leave a
 * dead-looking control, which this project has been bitten by before.
 */
(function () {
  var root = document.querySelector('[data-non-proc]');
  if (!root) return;

  var steps = [].slice.call(root.querySelectorAll('[data-non-proc-step]'));
  var caps = [].slice.call(root.querySelectorAll('[data-non-proc-cap]'));
  var bottles = [].slice.call(root.querySelectorAll('[data-non-proc-bottle]'));

  /* ---- captions -------------------------------------------------------- */

  function applyBottle(btn) {
    if (!btn) return;

    var accent = btn.getAttribute('data-accent');
    if (accent) root.style.setProperty('--non-proc-accent', accent);

    /* Split on newlines, then pair POSITIONALLY with the steps. A caption list
       shorter than the rail leaves the tail blank rather than sliding a line
       onto a scene it does not describe. */
    var lines = (btn.getAttribute('data-caps') || '')
      .split('\n')
      .map(function (l) { return l.trim(); });

    caps.forEach(function (cap, i) {
      cap.textContent = lines[i] || '';
    });

    bottles.forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  bottles.forEach(function (b) {
    b.addEventListener('click', function () { applyBottle(b); });
  });

  // Fill the captions for whichever chip starts selected.
  applyBottle(bottles.filter(function (b) { return b.classList.contains('is-on'); })[0] || bottles[0]);

  /* ---- reveal ---------------------------------------------------------- */

  /* Staggered by index so the sequence reads left to right — it is a process,
     and five scenes appearing at once says nothing about order.

     Reduced motion is honoured by the CSS, which paints the finished state and
     skips the keyframes; this still adds the class so nothing depends on the
     animation having run. */
  function reveal() {
    steps.forEach(function (step, i) {
      step.style.setProperty('--non-proc-delay', (i * 140) + 'ms');
      step.classList.add('is-in');
    });
  }

  if (!('IntersectionObserver' in window)) {
    reveal();
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      reveal();
      io.disconnect();
    });
  }, { rootMargin: '0px 0px -12% 0px' });

  io.observe(root);

  /* A band that never enters the viewport under an observer that never fires
     must not stay half-drawn. Same belt-and-braces as reveal.js. */
  setTimeout(reveal, 2500);
})();
