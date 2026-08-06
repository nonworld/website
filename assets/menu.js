/* Mobile menu panel.
 *
 * Opened by the header's Menu button, which is the only nav on a phone — the
 * six-link strip is hidden below 860. So this must not be able to get stuck
 * shut: every close path is wired, and every optional target is guarded,
 * because a thrown handler here is indistinguishable from a dead button and
 * would leave a customer with no navigation at all.
 */
(function () {
  var panel = document.querySelector('[data-non-menu]');
  var openBtn = document.querySelector('[data-non-menu-open]');
  if (!panel || !openBtn) return;

  var closeBtn = panel.querySelector('[data-non-menu-close]');
  var links = panel.querySelectorAll('a');
  var lastFocus = null;

  /* Guarded, not called straight through. If scroll-lock.js ever fails to load,
     a bare `NON.scrollLock.lock()` throws inside the open handler — and a
     thrown handler here is indistinguishable from a dead button. The overlay
     opening without a lock is a degraded page; the overlay refusing to open is
     a broken one. */
  function holdPage(on) {
    var s = window.NON && window.NON.scrollLock;
    if (s) s[on ? 'lock' : 'unlock']('menu');
  }


  /* The page behind is held by NON.scrollLock — see assets/scroll-lock.js.
     This used `body { overflow: hidden }`, which iOS ignores for touch.
     The owner string must match on both sides; it is what lets two overlays
     overlap without one releasing the other's lock. */

  function open() {
    lastFocus = document.activeElement;
    panel.hidden = false;
    /* Next frame, so the element is laid out before the class that transitions
       it — setting both in one tick paints the end state with no transition.
     *
     * BACKED BY A TIMER, because rAF is not guaranteed to fire.
     *
     * It does not run in a background or throttled tab, and `is-open` is what
     * carries this panel from `opacity: 0; translateY(-8px)` to visible. Without
     * it the menu is open by every measure that matters — `hidden` cleared, body
     * locked, focus moved into it — and completely invisible. Measured exactly
     * that way: classes "non-menu", opacity 0, and a customer holding a frozen
     * page with no navigation on it.
     *
     * somm-sheet.js hit this and documented it; the menu had the same single-rAF
     * pattern and no fallback, which matters more here because this IS the
     * navigation on a phone. Whichever arrives first wins and the other is a
     * no-op, because adding a class twice does nothing. */
    var reveal = function () { panel.classList.add('is-open'); };
    requestAnimationFrame(reveal);
    setTimeout(reveal, 60);
    openBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('non-menu-lock');
    holdPage(true);
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    panel.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('non-menu-lock');
    holdPage(false);

    /* hidden goes back on after the transition so the panel is out of the
       accessibility tree and off the tab order, not merely invisible. The
       timeout is a fallback for when transitionend does not fire — a panel
       that stays hidden=false would swallow taps on the page beneath it. */
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      panel.hidden = true;
    }
    panel.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 400);

    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);

  /* Tapping a link navigates, but same-page anchors and the current page would
     otherwise leave the panel open over the destination. */
  links.forEach(function (a) { a.addEventListener('click', close); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  /* Above the breakpoint the button is display:none, so a panel left open
     while a window is dragged wide would be unclosable. */
  window.addEventListener('resize', function () {
    if (!panel.hidden && window.innerWidth >= 860) close();
  });
})();
