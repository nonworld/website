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
    /* Copy AND shapes swap together — this is the whole point of the chips.
     *
     * The first build only swapped the accent and the caption, so pressing
     * NON2 left NON1's step copy on screen. The source drives titles, bodies,
     * captions and both scene shapes per bottle, so all of it moves at once:
     * NON2 reads "Pears cooked until their sugars darken", NON1 reads
     * "48 hours of freeze-dried Tasmanian raspberries".
     *
     * Every list is positional and read defensively — a short list leaves the
     * tail blank rather than sliding a line onto the wrong step. */
    var split = function (attr) {
      return (btn.getAttribute(attr) || '').split('\n').map(function (l) { return l.trim(); });
    };
    var lines = split('data-caps');
    var titles = split('data-titles');
    var bodies = split('data-bodies');

    caps.forEach(function (cap, i) { cap.textContent = lines[i] || ''; });
    steps.forEach(function (step, i) {
      var t = step.querySelector('[data-non-proc-title]');
      var b = step.querySelector('[data-non-proc-body]');
      if (t && titles[i]) t.textContent = titles[i];
      if (b && bodies[i]) b.textContent = bodies[i];
    });

    /* The scene shapes are drawn in the SVG and selected by these attributes,
       so switching a bottle changes the drawing without touching the DOM. */
    var fruit = btn.getAttribute('data-fruit');
    var bot = btn.getAttribute('data-bot');
    if (fruit) root.setAttribute('data-fruit-shape', fruit);
    if (bot) root.setAttribute('data-bot-shape', bot);

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
    startCycle();
  }

  /* Auto-play.
   *
   * The rail drew itself once and then sat still, which is a diagram that
   * animated rather than an animation. This walks the five steps on a loop:
   * each one is re-triggered in turn, so the sequence reads as a process
   * running rather than five finished pictures.
   *
   * The class is removed and re-added on the next frame because a CSS
   * animation only restarts when the element re-enters the matching state —
   * simply leaving the class on does nothing the second time round.
   */
  var cycleTimer = null;
  var cursor = 0;

  function replayStep(step) {
    if (!step) return;
    step.classList.remove('is-playing');
    // Force a reflow so the browser sees the class actually leave.
    void step.offsetWidth;
    step.classList.add('is-playing');
  }

  function startCycle() {
    if (cycleTimer) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    replayStep(steps[0]);
    cycleTimer = setInterval(function () {
      cursor = (cursor + 1) % steps.length;
      replayStep(steps[cursor]);
    }, 1600);
  }

  function stopCycle() {
    if (!cycleTimer) return;
    clearInterval(cycleTimer);
    cycleTimer = null;
    cursor = 0;
    steps.forEach(function (s) { s.classList.remove('is-playing'); });
  }

  if (!('IntersectionObserver' in window)) {
    reveal();
    return;
  }

  /* Replays. The first version called io.disconnect() after one pass, so the
     sequence drew itself once per page load and never again — scroll past it
     and back and you got five finished drawings with no animation, which reads
     as "the animation is broken" rather than "you already saw it".

     Now the band resets when it leaves the viewport and draws again on the way
     back in. The class is removed rather than the animation restarted, because
     a CSS animation only re-runs when the element re-enters the matching
     state. */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        reveal();
      } else {
        steps.forEach(function (step) { step.classList.remove('is-in'); });
        stopCycle();
      }
    });
  }, { rootMargin: '0px 0px -12% 0px' });

  io.observe(root);

  /* A band that never enters the viewport under an observer that never fires
     must not stay half-drawn. Same belt-and-braces as reveal.js. */
  setTimeout(reveal, 2500);
})();
