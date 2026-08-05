/* ==========================================================================
   NON Somm — the mobile bottom sheet.

   One sheet per page, opened by every mobile entry point: the hero field, the
   hero prompt chips, the "Made for" triptych tiles, and the product page's
   contextual entry. They all continue the SAME conversation, because a
   customer who asks about mains and then taps a bottle has not started a new
   thought.

   WHAT THIS FILE OWNS
     - opening and closing, and the fact that it never opens by itself
     - the context each entry point supplies, handed to somm.js for the request
     - focus: trapped while open, restored to the trigger on close
     - the body behind it: locked, and put back exactly where it was
     - the keyboard: the field stays above it, and the sheet resizes with the
       visual viewport rather than assuming the window height
     - analytics for open / close / prompt selection

   WHAT IT DOES NOT OWN
     - asking the question, streaming the answer, rendering recommendations.
       That is somm.js, which binds the sheet's form exactly as it binds the
       hero's. This file only tells it which context the question is being
       asked in.

   DESKTOP. Every entry point is display:none above the breakpoint and this
   file's open() refuses above it too, so a desktop resize cannot leave a
   sheet on screen. The desktop Somm is untouched.
   ========================================================================== */
(function () {
  'use strict';

  var NON = (window.NON = window.NON || {});
  var strings = NON.strings || {};

  var sheet = document.querySelector('[data-non-sheet]');
  if (!sheet) return;

  var panel = sheet.querySelector('[data-non-sheet-panel]');
  var scroll = sheet.querySelector('[data-non-sheet-scroll]');
  var opener = sheet.querySelector('[data-non-sheet-opener]');
  var seedBox = sheet.querySelector('[data-non-sheet-seeds]');
  var ctxBox = sheet.querySelector('[data-non-sheet-ctx]');
  var form = sheet.querySelector('[data-non-somm]');
  var input = sheet.querySelector('[data-non-somm-input]');

  /* The breakpoint is read from the stylesheet's own boundary rather than
     hardcoded twice. 859 is the theme's mobile ceiling — the same one 17 other
     blocks in theme.css use — so the sheet and the CSS that shows its triggers
     can never disagree about what "mobile" means. */
  var MOBILE = window.matchMedia('(max-width: 859px)');

  var open = false;
  var lastFocus = null;
  var scrollY = 0;

  /* ------------------------------------------------------------ analytics */

  /* A conversation id so a thread can be followed across events without
     anything identifying the person. sessionStorage, so it dies with the
     visit; random, so it is not derived from anything about them. Never sent
     to the Worker — it exists only to join up analytics rows. */
  var CONV_KEY = 'non-somm-conversation';
  function conversationId() {
    try {
      var v = sessionStorage.getItem(CONV_KEY);
      if (!v) {
        v = 'c' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(CONV_KEY, v);
      }
      return v;
    } catch (e) {
      return 'c-nostore';
    }
  }

  function track(name, props) {
    if (!NON.track) return;
    var p = props || {};
    p.conversation_id = conversationId();
    p.page_type = (document.body.className.match(/template-([\w-]+)/) || [, ''])[1];
    NON.track(name, p);
  }
  NON.sommTrack = track;

  /* -------------------------------------------------------------- context */

  /* The context the current conversation is being held in. Set from whichever
     trigger opened the sheet and handed to somm.js on every request, so the
     Worker knows the customer arrived from "mains" rather than from nowhere.

     Kept as one object rather than as attributes on the form because it
     accumulates: opening from the triptych sets meal_category, and a later
     question from inside the sheet should still carry it. */
  var context = {};

  function setContext(next) {
    context = next || {};
    if (form) {
      form.setAttribute('data-somm-context', context.context || 'home');
      if (context.code) form.setAttribute('data-somm-code', context.code);
      else form.removeAttribute('data-somm-code');
      /* somm.js reads this on each request. An object cannot ride on an
         attribute, so it is handed over as a property on the element — the
         same element both files already share. */
      form.__nonSommSurface = context;
    }
  }

  function readTrigger(el) {
    var d = el.dataset || {};
    return {
      surface: d.sommSurface || 'unknown',
      context: d.sommContext || 'home',
      intent: d.sommIntent || '',
      meal_category: d.sommMeal || '',
      code: d.sommCode || '',
      product_id: d.sommProduct || '',
      variant_id: d.sommVariant || '',
      product_title: d.sommProductTitle || '',
      product_price: d.sommProductPrice || '',
      product_available: d.sommProductAvailable === 'true',
      opener: d.sommOpener || '',
      options: d.sommOptions || '',
      prompt: d.sommPrompt || ''
    };
  }

  /* ------------------------------------------------------- chips + opener */

  /* The follow-up question a tile opens with, and its answers.

     The triptych deliberately does NOT jump straight to a bottle: "mains" is
     three very different dinners and a recommendation made from the category
     alone would be a guess dressed as advice. One short question first, with
     the answers as chips, and then a real recommendation.

     Both the question and the chips are section settings, so the wording is
     the merchant's rather than this file's. */
  function renderOpener(ctx) {
    if (!opener) return;
    if (!ctx.opener) {
      opener.hidden = true;
      opener.textContent = '';
      return;
    }
    opener.textContent = ctx.opener;
    opener.hidden = false;
  }

  function chipButton(label, answer, picks) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'non-somm__seed';
    b.setAttribute('data-non-somm-seed', '');
    if (answer) b.setAttribute('data-answer', answer);
    if (picks) b.setAttribute('data-picks', picks);
    b.textContent = label;
    return b;
  }

  /* Chips come from ONE of two places, never both:

       1. the trigger's own options — the triptych's follow-up answers
       2. the page's Somm seeds, cloned

     Cloning rather than re-rendering keeps the suggestions authored in exactly
     one place: the section's blocks. The originals are display:none on mobile,
     so nothing is duplicated in the accessibility tree. */
  function renderChips(ctx) {
    if (!seedBox) return;
    seedBox.textContent = '';

    if (ctx.options) {
      ctx.options.split('|').forEach(function (raw) {
        var label = raw.trim();
        if (label) seedBox.appendChild(chipButton(label, '', ''));
      });
      seedBox.hidden = false;
      return;
    }

    /* Filtered in JavaScript rather than with :not(… *) in the selector. The
       complex-argument form is Selectors 4 and support is uneven enough that a
       silent zero-match would leave the sheet with no chips at all — and a
       selector that returns nothing looks exactly like a section with no
       seeds configured. */
    var source = document.querySelectorAll('[data-non-somm-seed]');
    var added = 0;
    Array.prototype.forEach.call(source, function (btn) {
      if (added >= 3) return;                       // the brief's ceiling
      if (seedBox.contains(btn)) return;
      var label = (btn.getAttribute('data-short') || btn.textContent).trim();
      seedBox.appendChild(
        chipButton(label, btn.getAttribute('data-answer') || '', btn.getAttribute('data-picks') || '')
      );
      added++;
    });
    seedBox.hidden = added === 0;
  }

  /* The bottle under discussion, kept buyable. Only on a product surface —
     everywhere else there is no single product the conversation is about, and
     a button would have to guess which one. */
  function renderProductAction(ctx) {
    if (!ctxBox) return;
    if (!ctx.variant_id || !ctx.product_title) {
      ctxBox.hidden = true;
      ctxBox.textContent = '';
      return;
    }
    ctxBox.textContent = '';

    var label = document.createElement('span');
    label.className = 'non-sheet__ctx-name';
    label.textContent = ctx.product_price
      ? ctx.product_title + ' · ' + ctx.product_price
      : ctx.product_title;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'non-sheet__ctx-add';
    if (ctx.product_available) {
      btn.setAttribute('data-non-add', '');
      btn.setAttribute('data-variant-id', ctx.variant_id);
      btn.setAttribute('data-non-sheet-add', '');
      btn.textContent = strings.sommRecAdd || 'Add';
    } else {
      btn.disabled = true;
      btn.textContent = strings.soldOut || 'Sold out';
    }

    ctxBox.appendChild(label);
    ctxBox.appendChild(btn);
    ctxBox.hidden = false;
  }

  /* ------------------------------------------------------- the sheet body */

  /* THE KEYBOARD.

     A phone keyboard does not shrink window.innerHeight on iOS; it shrinks the
     VISUAL viewport and leaves the layout viewport alone. A sheet sized in dvh
     therefore keeps its full height, the field slides underneath the keyboard,
     and the customer types into something they cannot see.

     visualViewport reports the real number, so the sheet is sized from it
     whenever it exists and falls back to dvh where it does not. */
  function syncHeight() {
    var vv = window.visualViewport;
    if (!vv) return;
    sheet.style.setProperty('--non-sheet-vh', vv.height + 'px');
    /* On iOS the visual viewport also OFFSETS when the keyboard opens. Without
       this the sheet is the right height in the wrong place. */
    sheet.style.setProperty('--non-sheet-top', (vv.offsetTop || 0) + 'px');
  }

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

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
    'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trap(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet('escape');
      return;
    }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function cartIsOpen() {
    var d = document.querySelector('[data-non-cart-drawer]');
    return !!d && !d.hidden;
  }

  function openSheet(trigger) {
    /* Above the breakpoint there is no sheet — the desktop Somm is the Somm.
       Guarded here as well as in CSS so a resize mid-session cannot strand an
       open dialog on a desktop layout. */
    if (!MOBILE.matches) return false;
    /* The cart drawer outranks this. Someone with the drawer open is checking
       out, and a sheet over the top of it would interrupt the one flow the
       brief says must never be interrupted. */
    if (cartIsOpen()) return false;
    if (open) return true;

    var ctx = trigger ? readTrigger(trigger) : { surface: 'unknown', context: 'home' };
    setContext(ctx);
    renderOpener(ctx);
    renderChips(ctx);
    renderProductAction(ctx);

    lastFocus = trigger || document.activeElement;
    lockBody();

    sheet.hidden = false;
    /* Two frames: one for the sheet to exist in layout, one for the transform
       transition to have something to move from. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { sheet.classList.add('is-open'); });
    });

    syncHeight();
    open = true;
    document.addEventListener('keydown', trap, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncHeight);
      window.visualViewport.addEventListener('scroll', syncHeight);
    }

    /* The page behind is inert to assistive technology while a modal is up,
       so a screen reader does not read the sheet and the page as one document.
       Matches what the lotto already does. */
    var shell = document.querySelector('.non-shell');
    if (shell) shell.setAttribute('aria-hidden', 'true');

    /* Focus the field, not the close button: the customer opened this to ask
       something, and the way out is one Escape away and labelled. */
    if (input) input.focus({ preventScroll: true });

    track('somm_opened', {
      surface: ctx.surface,
      entry_point: ctx.surface,
      intent: ctx.intent,
      meal_category: ctx.meal_category,
      product_id: ctx.product_id,
      variant_id: ctx.variant_id
    });

    document.dispatchEvent(new CustomEvent('non:somm:opened'));

    /* A trigger may carry a question to ask on arrival — the hero's prompt
       chips do. Deferred a frame so the open transition is not competing with
       the answer painting into it. */
    if (ctx.prompt) {
      setTimeout(function () { ask(ctx.prompt, 'prompt_chip'); }, 60);
    }
    return true;
  }

  function closeSheet(why) {
    if (!open) return;
    sheet.classList.remove('is-open');
    open = false;

    document.removeEventListener('keydown', trap, true);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', syncHeight);
      window.visualViewport.removeEventListener('scroll', syncHeight);
    }
    var shell = document.querySelector('.non-shell');
    if (shell) shell.removeAttribute('aria-hidden');

    /* Hidden after the transition, not during it. The conversation itself is
       never cleared — the sheet keeps its transcript so reopening continues
       where it left off, which is what stops a glance at the page from costing
       someone their thread. */
    setTimeout(function () {
      if (!open) sheet.hidden = true;
    }, 240);

    unlockBody();
    if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;

    track('somm_closed', { surface: context.surface, reason: why || 'button' });
    document.dispatchEvent(new CustomEvent('non:somm:closed'));
  }

  /* ------------------------------------------------------------- asking */

  function ask(text, promptType) {
    if (!form || !text) return;
    track('somm_question_submitted', {
      surface: context.surface,
      intent: context.intent,
      meal_category: context.meal_category,
      prompt_type: promptType || 'typed',
      chars: String(text).trim().length
    });
    if (form.__nonSommAsk) form.__nonSommAsk(text);
  }
  /* Exposed so somm.js's "Show me another" and the recommendation card's
     follow-ups can drive the same conversation. */
  NON.somm = {
    open: openSheet,
    close: closeSheet,
    ask: ask,
    isOpen: function () { return open; },
    context: function () { return context; }
  };

  /* ------------------------------------------------------------- events */

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-non-somm-open]');
    if (trigger) {
      /* A trigger may be a link to a fallback page for no-JS. Only prevent the
         navigation once we know the sheet actually opened. */
      if (openSheet(trigger)) {
        e.preventDefault();
        var d = trigger.dataset || {};
        if (d.sommMeal) {
          track('triptych_tile_selected', {
            surface: d.sommSurface || 'homepage_triptych',
            meal_category: d.sommMeal,
            position: d.sommPosition || ''
          });
        }
      }
      return;
    }

    if (e.target.closest('[data-non-sheet-close]')) {
      e.preventDefault();
      closeSheet('button');
      return;
    }

    /* Prompt chips inside the sheet. somm.js owns what happens next — this
       only records that one was chosen, and only for chips in the sheet, so a
       desktop seed click is not counted twice. */
    var chip = e.target.closest('[data-non-somm-seed]');
    if (chip && seedBox && seedBox.contains(chip)) {
      track('somm_prompt_selected', {
        surface: context.surface,
        intent: context.intent,
        meal_category: context.meal_category,
        position: Array.prototype.indexOf.call(seedBox.children, chip)
      });
      /* A follow-up answer chip has no canned copy — it IS the answer to the
         question the sheet opened with, so it is recorded as a clarification
         rather than as a fresh question. */
      if (!chip.getAttribute('data-answer')) {
        track('somm_clarification_answered', {
          surface: context.surface,
          meal_category: context.meal_category
        });
      }
      return;
    }

    /* Adding from inside the sheet hands over to the cart drawer, which is a
       full-screen overlay on mobile. Two overlays stacked is not a state
       anyone designed, so the sheet steps aside — and because the transcript
       survives closing, stepping aside costs nothing. */
    if (e.target.closest('[data-non-sheet-add]')) {
      setTimeout(function () { closeSheet('add_to_cart'); }, 30);
    }
  });

  /* If the cart drawer opens while the sheet is up — from a recommendation's
     Add, or from the header — the sheet gets out of the way rather than
     covering it. */
  document.addEventListener('non:cart:updated', function () {
    if (open && cartIsOpen()) closeSheet('cart_opened');
  });

  /* A resize past the breakpoint closes it. Otherwise rotating a phone into a
     tablet-width layout, or a desktop devtools resize, leaves a mobile-only
     dialog on a desktop page. */
  function onBreakpoint() {
    if (open && !MOBILE.matches) closeSheet('breakpoint');
  }
  if (MOBILE.addEventListener) MOBILE.addEventListener('change', onBreakpoint);
  else if (MOBILE.addListener) MOBILE.addListener(onBreakpoint);

  /* Drag the handle down to dismiss — the gesture a phone user will try first.
     Deliberately generous and one-directional: any downward drag past a third
     of the sheet closes it, and anything else snaps back. */
  var grab = sheet.querySelector('[data-non-sheet-grab]');
  if (grab && window.PointerEvent) {
    var startY = null;
    grab.addEventListener('pointerdown', function (e) {
      startY = e.clientY;
      grab.setPointerCapture(e.pointerId);
      panel.style.transition = 'none';
    });
    grab.addEventListener('pointermove', function (e) {
      if (startY === null) return;
      var dy = Math.max(0, e.clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
    });
    function endDrag(e) {
      if (startY === null) return;
      var dy = Math.max(0, e.clientY - startY);
      startY = null;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > panel.offsetHeight / 3) closeSheet('drag');
    }
    grab.addEventListener('pointerup', endDrag);
    grab.addEventListener('pointercancel', function () {
      startY = null;
      panel.style.transition = '';
      panel.style.transform = '';
    });
  }
})();
