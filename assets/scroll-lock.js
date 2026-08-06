/* ==========================================================================
   THE PAGE BEHIND AN OVERLAY STAYS PUT.

   One helper for the three things that cover the screen: the cart drawer, the
   mobile menu and the Somm sheet. Each of them had its own copy of this, and
   two of the three had a version that did not work.

   WHY `overflow: hidden` IS NOT ENOUGH. iOS Safari ignores it for touch
   scrolling. The overlay sits still while the storefront slides underneath it,
   and closing it leaves the customer somewhere they never navigated to. Both
   the cart drawer and the menu shipped with that; measured at 402, the window
   scrolled 700px behind an open menu without complaint.

   Fixing the body is what actually holds it — but `position: fixed` collapses
   the document to the top the instant it applies, so the offset has to be taken
   before and put back after, by hand. That is the whole trick, and it is why
   this is worth having in one place rather than three.

   WHY IT COUNTS OWNERS RATHER THAN TOGGLING.

   This is the part the three copies could not do, and the reason to share it
   rather than merely deduplicate it. Overlays do overlap: the Somm sheet stands
   aside when the cart drawer opens, the lotto outranks both, and a resize can
   close one while another is up. With independent lock/unlock pairs, the second
   overlay to open captures a scrollY of 0 — the page is already pinned — and
   the first to close unlocks the body while something is still covering it.
   The customer is then returned to the top of the page they were halfway down.

   Counting owners fixes both: the position is captured on the first lock only,
   and restored on the last release only. Locking twice with the same owner is
   idempotent, because a Set is.
   ========================================================================== */
(function () {
  'use strict';

  var NON = (window.NON = window.NON || {});
  if (NON.scrollLock) return;

  var owners = new Set();
  var scrollY = 0;

  function lock(owner) {
    /* An owner is required and must be stable — the same string on the way in
       and out. Anonymous locks cannot be released reliably, and a lock that
       cannot be released leaves the page frozen with nothing on top of it. */
    if (!owner) return;
    if (owners.has(owner)) return;

    var first = owners.size === 0;
    owners.add(owner);
    if (!first) return;

    scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = -scrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlock(owner) {
    if (!owner || !owners.has(owner)) return;
    owners.delete(owner);
    if (owners.size) return;

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollY);
  }

  NON.scrollLock = {
    lock: lock,
    unlock: unlock,
    /* Exposed for the same reason the sheet exposes isOpen: something else may
       need to know, and reading a private Set from outside is worse. */
    isLocked: function () { return owners.size > 0; }
  };
})();
