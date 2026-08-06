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

  /* Guarded, not called straight through. If scroll-lock.js ever fails to load,
     a bare `NON.scrollLock.lock()` throws inside the open handler — and a
     thrown handler here is indistinguishable from a dead button. The overlay
     opening without a lock is a degraded page; the overlay refusing to open is
     a broken one. */
  function holdPage(on) {
    var s = window.NON && window.NON.scrollLock;
    if (s) s[on ? 'lock' : 'unlock']('somm-sheet');
  }

  var lastFocus = null;

  /* MODAL ON A PHONE, A PANEL ON A DESKTOP.
   *
   * Above the breakpoint the sheet's own field is hidden (see theme.css): the
   * page already has a Somm bar, and a dialog holding a second one is two boxes
   * asking the same question. That only works if the bar underneath stays
   * usable — so a desktop open does not lock the body, does not trap focus and
   * does not mark the page inert. It is a panel showing the conversation, not a
   * dialog holding it.
   *
   * Below the breakpoint nothing changes. There is no room for a bar and a
   * panel at once, the sheet owns the screen, and every modal affordance stays
   * exactly as it was.
   *
   * Captured at open rather than read at close, so a resize mid-conversation
   * cannot unlock a body that was never locked. */
  var modal = true;

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
      surface: d.sommSurface || 'homepage_hero',
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
    /* FALLS BACK TO THE HOUSE LINE rather than to nothing.
     *
     * This used to hide the element whenever a trigger supplied no opener,
     * which is every trigger except a triptych tile — so opening the Somm from
     * the hero bar or the orb produced a black band, three chips and nothing
     * saying what any of it was. The default now lives on the element as a data
     * attribute, so the copy stays in the theme editor and this only chooses
     * between it and a trigger's more specific question. */
    var fallback = opener.getAttribute('data-non-sheet-opener-default') || '';
    var text = ctx.opener || fallback;
    opener.textContent = text;
    opener.hidden = !text;
    /* The shimmer is the resting state. A tile's follow-up question is a
       question being asked, not the Somm idling, so it does not shimmer. */
    opener.classList.toggle('non-sheet__opener--idle', !ctx.opener);
  }

  /* Parsed on demand rather than once at load: the theme editor can replace a
     section's markup without a reload, and a stale copy would offer prompts
     that no longer exist. Exposed on NON so somm.js's offline fallback reads
     exactly the same list. */
  function readSeeds() {
    var out = [];
    document.querySelectorAll('[data-non-somm-seeds]').forEach(function (node) {
      try {
        var parsed = JSON.parse(node.textContent);
        if (parsed && parsed.length) out = out.concat(parsed);
      } catch (e) {
        console.warn('[NON somm] seed JSON failed to parse — the sheet will open with no suggested prompts.', e);
      }
    });
    return out;
  }
  NON.sommSeeds = readSeeds;

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

    /* THE SEEDS ARE DATA, NOT HIDDEN BUTTONS.
     *
     * This used to clone [data-non-somm-seed] elements out of the hero's
     * inline form. That form is gone — there is one Somm now — so the
     * suggestions travel as a JSON payload the section renders instead. Same
     * single source of truth (the section's blocks), without a form full of
     * controls that exist only to be copied and never to be pressed.
     *
     * Seeds ticked "Show on mobile" win, so the sheet offers the same three
     * the hero does; document order otherwise. Three, which is the ceiling
     * everywhere. */
    var seeds = readSeeds();
    var flagged = seeds.filter(function (x) { return x.mobile; });
    var source = flagged.length ? flagged : seeds;

    var added = 0;
    source.forEach(function (seed) {
      /* Four, matching the hero. The sheet offers the same suggestions the
         page does; a different number is a different component. */
      if (added >= 4) return;
      seedBox.appendChild(
        chipButton(seed.short || seed.label, seed.answer || '', (seed.picks || []).join(','))
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
      /* data-non-somm-add, NOT data-non-add.
       *
       * Both end at NON.cart.add, but they are counted differently and this
       * one is a Somm conversion: the customer opened the sheet, had a
       * conversation, and bought the bottle it was about. Routed through
       * cart.js's generic handler it landed in the cart and in no report —
       * somm_add_to_cart never fired, so the one number the brief exists to
       * produce would have been missing exactly the purchases it is for.
       *
       * Only one of the two attributes, ever: both would be two handlers on
       * one click and two units in the cart. */
      btn.setAttribute('data-non-somm-add', '');
      btn.setAttribute('data-variant-id', ctx.variant_id);
      btn.setAttribute('data-code', ctx.code || '');
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


  /* ------------------------------------------------------- panel placement */

  /* IT OPENS UNDER THE BAR, NOT OVER THE PAGE.
   *
   * Centred in the viewport it reads as a popup — something that has arrived on
   * top of the site and has to be dismissed. It is not: it is the answer to the
   * question just typed, and it belongs where the question was asked.
   *
   * So on a desktop the panel is pinned to the left edge and bottom of whatever
   * Somm block was used, and sized to that block. The trigger is the form
   * itself for a typed question, a chip inside it, or the orb; all of them
   * resolve upwards to the same `.non-somm` or `.non-somm-entry`. Anything that
   * cannot be resolved — the header, a triptych tile — falls back to centred,
   * which is the right answer for a trigger with no bar of its own.
   *
   * Written as custom properties rather than inline top/left so the stylesheet
   * keeps the transition, the max-height and the reduced-motion rule in one
   * place, and so the fallback is a CSS default rather than a branch here.
   *
   * fixed positioning is measured from the viewport, so this follows scroll and
   * resize while it is open. */
  var anchorEl = null;

  function anchorTo(trigger) {
    anchorEl = trigger ? trigger.closest('.non-somm, .non-somm-entry') : null;
    placePanel();
  }

  function placePanel() {
    if (modal || !anchorEl || !document.contains(anchorEl)) {
      sheet.classList.remove('is-anchored');
      return;
    }
    var r = anchorEl.getBoundingClientRect();

    /* ONLY IF THERE IS ROOM UNDER IT.
     *
     * The hero's bar sits low in a 900px window — measured, its bottom edge is
     * at 768 — which leaves about 130px beneath. Anchored there the panel
     * clamped to 96px: an answer, two recommendation cards and a chip row in
     * the height of a single button. A panel that opens where the question was
     * asked is better than a centred one, and a 96px panel is worse than
     * either.
     *
     * So the anchor is conditional on the space actually existing, and falls
     * back to the centred placement when it does not. 320 is the smallest
     * height that shows the opening line and one whole recommendation card. */
    var room = (window.innerHeight || 0) - r.bottom - 36;
    if (room < 320) {
      sheet.classList.remove('is-anchored');
      return;
    }

    sheet.style.setProperty('--non-sheet-anchor-x', Math.round(r.left) + 'px');
    sheet.style.setProperty('--non-sheet-anchor-y', Math.round(r.bottom + 12) + 'px');
    sheet.style.setProperty('--non-sheet-anchor-w', Math.round(r.width) + 'px');
    sheet.classList.add('is-anchored');
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

  /* The page behind is held by NON.scrollLock — see assets/scroll-lock.js.
     Only when modal: as a desktop panel the page must stay usable.
     The owner string must match on both sides; it is what lets two overlays
     overlap without one releasing the other's lock. */

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
    /* No width guard. There is ONE Somm and this is it, at every size — the
       hero's inline form is gone, so refusing to open above the breakpoint
       would leave a desktop customer with a button and nothing behind it.
       The sheet presents as a bottom sheet on a phone and a centred dialog on
       a desktop; that is styling, not two components.

       The cart drawer outranks this. Someone with the drawer open is checking
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

    modal = MOBILE.matches;
    if (modal) holdPage(true);

    sheet.hidden = false;
    sheet.classList.toggle('is-panel', !modal);
    if (!modal) anchorTo(trigger);

    /* VISIBILITY MUST NOT DEPEND ON A FRAME BEING PAINTED.
     *
     * `is-open` is what moves the panel up from translateY(100%), so if the
     * class never lands the sheet is open, focused, body-locked — and off
     * screen. Two nested requestAnimationFrames are the usual way to let a
     * transition have a starting point to move from, and they are correct
     * right up until the tab is not painting: rAF does not fire in a
     * background tab, and the sheet then opens into nothing.
     *
     * Seen exactly that way while testing. So the frames stay — they are what
     * makes the animation smooth — but a timer backs them up, and the class is
     * idempotent so whichever arrives first wins and the other is a no-op. */
    var reveal = function () { sheet.classList.add('is-open'); };
    requestAnimationFrame(function () { requestAnimationFrame(reveal); });
    setTimeout(reveal, 60);

    syncHeight();
    open = true;
    if (!modal) {
      window.addEventListener('scroll', placePanel, { passive: true });
      window.addEventListener('resize', placePanel);
    }
    /* Escape still closes it as a panel; only the focus RING is modal. */
    document.addEventListener('keydown', trap, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncHeight);
      window.visualViewport.addEventListener('scroll', syncHeight);
    }

    /* The page behind is inert to assistive technology while a modal is up,
       so a screen reader does not read the sheet and the page as one document.
       Matches what the lotto already does. */
    var shell = document.querySelector('.non-shell');
    if (modal && shell) shell.setAttribute('aria-hidden', 'true');

    /* Focus the field, not the close button: the customer opened this to ask
       something, and the way out is one Escape away and labelled. */
    /* Only when the sheet owns the input. As a panel the field is hidden and
       the customer is already in the page's own bar — moving focus into a
       hidden control would drop it to the document. */
    if (modal && input) input.focus({ preventScroll: true });

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
    window.removeEventListener('scroll', placePanel);
    window.removeEventListener('resize', placePanel);
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

    if (modal) holdPage(false);

    /* THE EVENT FIRST, THEN THE FOCUS — and the order is the whole fix.
     *
     * The orb hides itself while the sheet is open, because two things asking
     * for attention is one too many. It un-hides on `non:somm:closed`. So when
     * this dispatched LAST, the focus restore ran while the opener was still
     * `hidden`, and a hidden element cannot take focus: opening the Somm from
     * the orb and pressing Escape dropped focus to the top of the document.
     *
     * Announcing the close first lets every listener put its control back, and
     * only then is focus handed to it. */
    document.dispatchEvent(new CustomEvent('non:somm:closed'));

    if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;

    track('somm_closed', { surface: context.surface, reason: why || 'button' });
  }

  /* ------------------------------------------------------------- asking */

  function ask(text, promptType) {
    if (!form || !text) return;
    /* The question is counted in somm.js, where EVERY surface's questions pass
       through one function. Counting it here as well would double every
       question the sheet initiates and single-count the ones a customer types,
       which is worse than not counting either. The prompt type travels with
       the call so the one counter can still tell them apart. */
    if (form.__nonSommAsk) form.__nonSommAsk(text, promptType || 'prompt_chip');
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

  /* THE HERO'S BAR.
   *
   * It is the pairing page's markup so that it looks like the pairing page,
   * but it does NOT answer inline — there is one Somm and it is the sheet.
   * It carries no [data-non-somm] hook, so somm.js never binds a controller to
   * it; this forwards it instead.
   *
   * Submitting hands the typed text over. Focusing opens the sheet empty and
   * moves the caret into ITS field, because a customer who has clicked into a
   * text box expects to type into the thing they clicked — leaving them typing
   * into a field whose answer appears somewhere else would be worse than not
   * opening at all.
   */
  var heroForm = document.querySelector('[data-non-somm-hero]');
  if (heroForm) {
    var heroInput = heroForm.querySelector('[data-non-somm-hero-input]');

    heroForm.addEventListener('submit', function (e) {
      /* ABOVE THE BREAKPOINT THIS IS NOT OURS.
       *
       * The hero's bar is a real Somm on a desktop — somm.js binds it and the
       * answer renders under it, in the page. Forwarding to the sheet as well
       * would preventDefault twice and ask twice, and would put the answer back
       * in a panel over the page, which is the thing being removed. */
      if (!MOBILE.matches) return;
      e.preventDefault();
      var text = heroInput ? heroInput.value.trim() : '';
      if (!openSheet(heroForm)) return;
      if (text) {
        if (heroInput) heroInput.value = '';
        setTimeout(function () { ask(text, 'typed'); }, 60);
      }
    });

    if (heroInput) {
      heroInput.addEventListener('focus', function () {
        /* Same split. On a desktop the field answers where it is; there is
           nothing to open. */
        if (!MOBILE.matches) return;
        /* Only when the sheet is not already up — refocusing after it closes
           would reopen it immediately and trap the customer in it. */
        if (open) return;
        openSheet(heroForm);
      });
    }
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-non-somm-open]');
    /* A chip inside the page's own Somm bar carries BOTH hooks so it can serve
       either width. Above the breakpoint the bar answers inline, so the sheet
       must not also open — otherwise one click asks twice, in two places. */
    if (trigger && !MOBILE.matches && trigger.closest('[data-non-somm-inline]')) return;
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
