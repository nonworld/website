/* ==========================================================================
   "Pour it with" — three plates on a phone, and what each one is doing there.

   The strip shows the bottle's three pairings as photographs with the pairing
   name over each. Tapping one reveals the two sentences that explain it — copy
   that is already on the page, already approved, and already rendered as the
   prose cards below the strip.

   THE EXPANSION IS THOSE CARDS. Not a copy of them, not a request to the Somm,
   not a navigation. The card is moved directly under the strip so the
   explanation appears where the eye already is, and moved back when it closes.

   Why not ask the Somm: the answer is a fact the page is holding. Going to a
   language model for it would be slower, could fail, and could word it
   differently on two consecutive taps — three ways to be worse than reading
   the sentence that is already written.

   Why not navigate: the brief is explicit, and it is right. A customer looking
   at a pairing on a product page is one tap from buying; sending them to a
   pairing page to read two sentences is a detour with a bounce at the end.

   Above the mobile breakpoint this file does nothing. The desktop band is
   three cards, as it always has been.
   ========================================================================== */
(function () {
  'use strict';

  var MOBILE = window.matchMedia('(max-width: 859px)');

  document.querySelectorAll('[data-non-pair-trip]').forEach(function (trip) {
    /* The cards live in the same section, after the strip. Scoped to that
       section rather than to the document so a page with two of these — which
       the theme editor can produce — does not cross-wire them. */
    var scope = trip.closest('.non-section') || document;
    var cards = {};
    scope.querySelectorAll('[data-non-pair-card]').forEach(function (card) {
      cards[card.getAttribute('data-pair-index')] = card;
    });

    var open = null;

    /* Where an expanded card is put: a slot immediately under the strip, so
       the explanation reads as belonging to the picture rather than as the
       start of the next band. */
    var slot = document.createElement('div');
    slot.className = 'non-pair-slot';
    trip.parentNode.insertBefore(slot, trip.nextSibling);

    function close() {
      if (!open) return;
      open.tile.setAttribute('aria-expanded', 'false');
      /* Home again. The card returns to the list it came from, in its original
         position, so closing leaves the DOM exactly as it was found — which is
         what makes crossing the breakpoint safe. */
      open.home.parentNode.insertBefore(open.card, open.home);
      open.card.classList.remove('is-expanded');
      open = null;
    }

    trip.addEventListener('click', function (e) {
      var tile = e.target.closest('[data-non-pair-tile]');
      if (!tile || !MOBILE.matches) return;

      var index = tile.getAttribute('data-pair-index');
      var card = cards[index];
      if (!card) return;

      var wasOpen = open && open.card === card;
      close();
      if (wasOpen) return;                       // a second tap closes it

      /* A marker left in the card's place, so it can be put back exactly where
         it was rather than appended to the end of the list. */
      var home = document.createComment('pair-' + index);
      card.parentNode.insertBefore(home, card);

      slot.appendChild(card);
      card.classList.add('is-expanded');
      tile.setAttribute('aria-expanded', 'true');
      open = { tile: tile, card: card, home: home };

      if (window.NON && NON.sommTrack) {
        NON.sommTrack('pairing_tile_selected', {
          surface: 'product_pairing',
          position: Number(index)
        });
      }
    });

    /* Crossing back to desktop puts everything down. Otherwise a resize leaves
       one card sitting under the strip and two in the row below it — a layout
       nobody designed and nobody would be able to explain. */
    function onChange() {
      if (!MOBILE.matches) close();
    }
    if (MOBILE.addEventListener) MOBILE.addEventListener('change', onChange);
    else if (MOBILE.addListener) MOBILE.addListener(onChange);
  });
})();
