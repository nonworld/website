/* ==========================================================================
   "How it's made" — five stages, compact on a phone.

   The band is right on a desktop: five numbered steps down a column beside a
   full-bleed film, and the copy is genuinely worth reading. On a 375px screen
   the same five steps are 517px of prose between the spec strip and the
   pairings, and it is prose that answers a question most customers have not
   asked yet.

   So on a phone the STAGE NAMES stay visible — Fruit, Tannin, Salinity,
   Acidity, Balance is itself the argument, and the brief requires them to show
   immediately — and the explanation is one tap away.

   WHY THIS IS A SCRIPT AND NOT LIQUID.

   The desktop markup has to be untouched, and this section renders its steps
   through three different code paths (blocks, a JSON metafield, and prose
   split on keywords). A mobile variant in Liquid would mean duplicating all
   three, and the risk of the two rendering paths drifting is exactly the class
   of bug this file's own history is full of.

   Enhancing the one existing markup instead means there is one source of
   truth. Above the breakpoint this file does nothing at all — no attributes,
   no listeners, no classes — so the desktop DOM is byte-identical to what it
   was. And if the script never loads, a phone gets five expanded steps: longer
   than intended, and completely readable.

   ACCESSIBILITY. The toggle is a real <button> carrying aria-expanded and
   aria-controls, and the body it controls carries a matching id and is hidden
   with the `hidden` attribute rather than with CSS — so it is out of the
   accessibility tree when closed rather than merely invisible.
   ========================================================================== */
(function () {
  'use strict';

  var MOBILE = window.matchMedia('(max-width: 859px)');
  var uid = 0;

  function enhance(step) {
    if (step.__nonAccordion) return;

    var body = step.querySelector('.non-step__b');
    var title = step.querySelector('.non-step__t');
    /* A step with no title has nothing to collapse UNDER — the keyword parser
       produces those when a bottle's process prose has no "HEADING - body"
       shape. Left alone rather than given an empty summary. */
    if (!body || !title) return;

    step.__nonAccordion = true;
    uid++;
    var id = 'non-step-body-' + uid;
    body.id = id;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'non-step__toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);
    /* The title element is moved INSIDE the button rather than replaced by it,
       so its class, its type scale and anything else styling it come along.
       Rebuilding the label would mean keeping two copies of that styling in
       step. */
    title.parentNode.insertBefore(btn, title);
    btn.appendChild(title);

    var caret = document.createElement('span');
    caret.className = 'non-step__caret';
    caret.setAttribute('aria-hidden', 'true');
    btn.appendChild(caret);

    body.hidden = true;
    step.classList.add('non-step--collapsible');

    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.hidden = open;
      step.classList.toggle('is-open', !open);
    });

    /* Kept so the desktop state can be restored exactly, rather than
       approximately, if the viewport crosses back over the breakpoint. */
    step.__nonRestore = function () {
      btn.parentNode.insertBefore(title, btn);
      btn.remove();
      body.hidden = false;
      body.removeAttribute('id');
      step.classList.remove('non-step--collapsible', 'is-open');
      step.__nonAccordion = false;
      step.__nonRestore = null;
    };
  }

  function apply() {
    var steps = document.querySelectorAll('.non-steps .non-step');
    Array.prototype.forEach.call(steps, function (step) {
      if (MOBILE.matches) enhance(step);
      else if (step.__nonRestore) step.__nonRestore();
    });
  }

  apply();
  /* A resize across the boundary re-decides it. Without this, a devtools
     resize or a rotated tablet leaves a desktop layout wearing collapsed
     accordions — five headings and no copy, which reads as missing content
     rather than as a collapsed control. */
  if (MOBILE.addEventListener) MOBILE.addEventListener('change', apply);
  else if (MOBILE.addListener) MOBILE.addListener(apply);
})();
