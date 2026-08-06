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
  var scrollY = 0;

  /* THE PAGE BEHIND STAYS PUT.
   *
   * `.non-menu-lock { overflow: hidden }` was doing this alone, and iOS Safari
   * ignores that for touch scrolling — the panel sits still while the
   * storefront slides underneath it, and closing it leaves the customer
   * somewhere they never navigated to. Measured with the menu open: the window
   * scrolled to 700 without complaint.
   *
   * Fixing the body is what actually holds it. The class stays — it is what
   * everything else keys off — and this adds the part that works, with the
   * offset carried and restored by hand because `position: fixed` collapses
   * the page to the top the moment it applies.
   *
   * The same fix as cart.js and somm-sheet.js. Three overlays, three copies of
   * this; worth folding into one helper the next time one of them is touched. */
  function lockBody() {
    scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = -scrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockBody() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollY);
  }

  function open() {
    lastFocus = document.activeElement;
    panel.hidden = false;
    /* Next frame, so the element is laid out before the class that transitions
       it — setting both in one tick paints the end state with no transition. */
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
    openBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('non-menu-lock');
    lockBody();
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    panel.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('non-menu-lock');
    unlockBody();

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
