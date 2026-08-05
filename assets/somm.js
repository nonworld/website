/* ==========================================================================
   NON Somm

   One controller for every somm surface: the homepage hero, the product page
   chat, and the shop filter's prose line.

   ── API contract ─────────────────────────────────────────────────────────
   The endpoint is set in Theme settings → NON Somm. It is expected to be a
   Cloudflare Worker (hosted separately, NOT part of this theme).

     POST <endpoint>
     Content-Type: application/json

     Request  { "query":   "roast chicken, friday night",
                "context": "home" | "product" | "collection",
                "page":    "/products/non3",
                "code":    "NON3",            // product pages only
                "history": [{ "role": "user" | "assistant", "text": "…" }] }

     Response { "answer": "Roast chicken wants grip…",
                "picks":  ["NON3", "NON1"] }   // codes, resolved to real
                                               // products by the catalogue

   Streaming: if the response is text/event-stream, each `data:` frame is
   treated as a token and appended. Otherwise the JSON body is typed out
   locally at settings.sommTypeSpeed.

   With no endpoint configured the controller falls back to the canned seed
   answers carried over from the design, so the section is never dead.
   ========================================================================== */
(function () {
  'use strict';

  var NON = window.NON || {};
  var settings = NON.settings || {};
  var ENDPOINT = settings.sommEndpoint || '';

  /* --- catalogue: code → live Shopify product ---------------------------- */

  var catalogue = {};
  document.querySelectorAll('[data-non-catalogue]').forEach(function (node) {
    try {
      Object.assign(catalogue, JSON.parse(node.textContent));
    } catch (e) {
      /* A malformed catalogue must not take the somm down — but it must not
         pass unnoticed either. Without it every pick card resolves to nothing
         and the panel renders empty, which looks like the somm failing to
         answer rather than a data fault. */
      console.warn('[NON somm] catalogue JSON failed to parse — pick cards will not render. Fix [data-non-catalogue] in the section rendering this page.', e);
    }
  });
  if (!Object.keys(catalogue).length) {
    console.warn('[NON somm] no product catalogue found on this page. The somm will answer, but it cannot show which bottle it means. Every surface that renders [data-non-somm] must also render [data-non-catalogue].');
  }

  function pickCard(code) {
    var p = catalogue[String(code).toUpperCase()];
    if (!p) {
      /* Returning '' here is what made the picks panel look broken: the somm
         names a bottle in prose and then shows no card, with nothing anywhere
         saying why. Usually the product is absent from THIS MARKET's catalog,
         which is exactly how the Not drinks row lost two products. */
      console.warn('[NON somm] "' + code + '" is not in this page\'s catalogue, so no card can be shown. Most often the product is not published to the current market.');
      return '';
    }
    return (
      '<a class="non-somm__pick" href="' + p.url + '">' +
      (p.image ? '<img src="' + p.image + '" alt="" loading="lazy">' : '') +
      '<span class="non-somm__pick-meta">' +
      '<span class="non-somm__pick-code">' + code + '</span>' +
      '<span class="non-somm__pick-name">' + p.title + '</span>' +
      '<span class="non-somm__pick-note">' +
      (p.note ? p.note + ' &middot; ' : '') + p.price +
      '</span></span></a>'
    );
  }

  /* --- the shoppable recommendation card --------------------------------- */

  /* The mobile card, and ONLY the mobile card.
   *
   * Desktop keeps `pickCard` above, unchanged, because the brief's one
   * non-negotiable is that the desktop storefront does not move. The two
   * differ in what they are for: the desktop row sits under an answer someone
   * is already reading on a wide page, while this is the end of a conversation
   * on a phone and has to be able to finish the job — price, availability and
   * a real Add, without leaving the sheet.
   *
   * EVERY FIELD COMES FROM THE LIQUID CATALOGUE. The Worker answers in bottle
   * codes and nothing else; the price, the variant, the availability and the
   * image are all resolved here from Shopify's own data rendered into the
   * page. That is the whole reason the Somm cannot invent a price: it is never
   * given one to repeat. */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function t(key, fallback) {
    return (NON.strings && NON.strings[key]) || fallback;
  }

  function recommendationCard(code, index) {
    var p = catalogue[String(code).toUpperCase()];
    if (!p) {
      console.warn('[NON somm] "' + code + '" is not in this page\'s catalogue, so no card can be shown. Most often the product is not published to the current market.');
      return '';
    }

    /* SOLD OUT IS A STATE, NOT A HIDDEN CARD. Dropping an unavailable bottle
       would leave the prose naming a wine with nothing under it — the exact
       silent gap that made the picks panel look broken before. It is shown,
       it is honest about being unavailable, and the Add is replaced rather
       than left there to fail. */
    var buyable = p.available !== false && p.variantId;

    var action = buyable
      ? '<button type="button" class="non-rec__add" data-non-somm-add ' +
        'data-variant-id="' + esc(p.variantId) + '" ' +
        'data-code="' + esc(code) + '">' +
        esc(t('sommRecAdd', 'Add')) + ' &mdash; ' + esc(p.price) +
        '</button>'
      : '<span class="non-rec__add non-rec__add--out">' + esc(t('soldOut', 'Sold out')) + '</span>';

    return (
      '<article class="non-rec" data-non-rec data-code="' + esc(code) + '">' +
      (p.image
        ? '<a class="non-rec__media" href="' + esc(p.url) + '" data-non-somm-view data-code="' + esc(code) + '" tabindex="-1" aria-hidden="true">' +
          '<img src="' + esc(p.image) + '" alt="" loading="lazy" width="120" height="120">' +
          '</a>'
        : '') +
      '<div class="non-rec__body">' +
      '<div class="non-mono non-rec__code">' + esc(code) + '</div>' +
      '<h3 class="non-rec__name">' +
      '<a href="' + esc(p.url) + '" data-non-somm-view data-code="' + esc(code) + '">' + esc(p.title) + '</a>' +
      '</h3>' +
      (p.note ? '<p class="non-rec__note">' + esc(p.note) + '</p>' : '') +
      '<div class="non-rec__actions">' +
      action +
      '<a class="non-rec__see" href="' + esc(p.url) + '" data-non-somm-view data-code="' + esc(code) + '">' +
      esc(t('sommRecSee', 'See bottle')) + '</a>' +
      '</div>' +
      '<div class="non-rec__more">' +
      '<button type="button" class="non-rec__ask" data-non-somm-why data-code="' + esc(code) + '">' +
      esc(t('sommRecWhy', 'Why this one?')) + '</button>' +
      '<button type="button" class="non-rec__ask" data-non-somm-another data-code="' + esc(code) + '">' +
      esc(t('sommRecAnother', 'Show me another')) + '</button>' +
      '</div>' +
      '<p class="non-rec__msg" data-non-rec-msg role="status" aria-live="polite" hidden></p>' +
      '</div>' +
      '</article>'
    );
  }

  /* --- fallback seeds ---------------------------------------------------- */

  function seedsFor(root) {
    return Array.prototype.map.call(root.querySelectorAll('[data-non-somm-seed]'), function (btn) {
      return {
        label: btn.textContent.trim(),
        answer: btn.getAttribute('data-answer') || '',
        picks: (btn.getAttribute('data-picks') || '')
          .split(',')
          .map(function (s) { return s.trim(); })
          .filter(Boolean)
      };
    });
  }

  // Word-overlap match, same shape as the design's seed lookup.
  function matchSeed(seeds, query) {
    var q = query.trim().toLowerCase();
    if (!q) return null;
    return (
      seeds.find(function (s) {
        return s.label
          .toLowerCase()
          .split(/[ ,'?]+/)
          .some(function (w) { return w.length > 3 && q.indexOf(w) !== -1; });
      }) || null
    );
  }

  /* --- controller -------------------------------------------------------- */

  // Parsed per request rather than once at load: the theme editor can replace a
  // section's markup without a page reload, and a stale closure would then be
  // describing a bottle that is no longer on screen.
  function readFacts() {
    var el = document.querySelector('[data-non-somm-facts]');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function Somm(form) {
    var root = form.closest('[data-non-somm-root]') || document;
    var input = form.querySelector('[data-non-somm-input]');
    var answerBox = root.querySelector('[data-non-somm-answer]');
    var stream = root.querySelector('[data-non-somm-stream]');
    var picksBox = root.querySelector('[data-non-somm-picks]');
    var submit = form.querySelector('[type="submit"]');
    var context = form.getAttribute('data-somm-context') || 'home';
    var code = form.getAttribute('data-somm-code') || '';
    var seeds = seedsFor(root);
    var history = [];
    var timer = null;
    var lastQuery = '';
    var slowTimer = null;

    function show() {
      if (answerBox) answerBox.hidden = false;
      // The stream too, not just the box around it. On the product page they
      // are DIFFERENT elements: the transcript paragraph sits in
      // .non-sommbox__body (main-product.liquid:235) carrying a `hidden`
      // attribute, while [data-non-somm-answer] is a separate div further down
      // holding the picks. Unhiding only the box meant every answer was written
      // into a still-hidden paragraph — the request succeeded, the somm
      // replied, and the page showed nothing at all. On the hero the two are
      // nested, so this is a no-op there.
      if (stream) stream.hidden = false;
    }

    /* The working state, per the NON Somm identity: the mark is the full stop
       lifted out of "NON.", locked bottom-left and never centred — "the offset
       is the whole idea". Thinking is that full stop multiplied, three dots
       reading left to right, which is also the states row in the identity doc.

       It is built here rather than in Liquid so the hero and the product page
       get the same mark without either template knowing about it. */
    var thinkingEl = null;
    var thinkingSince = 0;

    // A response can land in 150ms. Showing the mark and pulling it straight
    // back reads as a glitch, not as thought — so once it is up it stays up
    // for a beat, and the answer waits for it rather than the other way round.
    var MIN_THINK = 550;

    function endThinking(then) {
      var elapsed = Date.now() - thinkingSince;
      var wait = Math.max(0, MIN_THINK - elapsed);
      setTimeout(function () { thinking(false); if (then) then(); }, wait);
    }

    function thinking(on, failed) {
      if (!stream) return;

      if (!on) {
        // The reset belongs BEFORE the return, and did not use to be.
        // `if (!on) thinkingSince = 0` sat after this early return, so it was
        // unreachable: thinkingSince never went back to zero once the dots had
        // been shown. That is harmless while the answer arrives as JSON, and
        // fatal once it streams, because the paint below is guarded on
        // `!thinkingSince` — streamed text accumulated and was never written
        // to the panel. Pick cards rendered, the words never did.
        thinkingSince = 0;
        // The slow-response note belongs to this wait and nothing else. Left
        // armed it would fire onto the NEXT question's dots four seconds early.
        clearTimeout(slowTimer);
        if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
        return;
      }

      if (!thinkingSince) thinkingSince = Date.now();

      if (!thinkingEl) {
        thinkingEl = document.createElement('div');
        thinkingEl.className = 'non-think';
        thinkingEl.setAttribute('role', 'status');
        // Screen readers get words; the dots are decoration to them.
        thinkingEl.setAttribute('aria-label', 'The somm is thinking');
        thinkingEl.innerHTML =
          '<span class="non-think__tile" aria-hidden="true">' +
          '<i class="non-think__dot"></i>' +
          '<i class="non-think__dot"></i>' +
          '<i class="non-think__dot"></i>' +
          '</span>';
        stream.parentNode.insertBefore(thinkingEl, stream);
      }

      thinkingEl.classList.toggle('is-failed', !!failed);
    }

    function type(text, picks) {
      clearInterval(timer);
      show();

      // Every target is optional. Each surface wires up a different subset —
      // the hero has stream + picks, the product page splits the two across
      // separate elements, the pairing page had picks and no stream at all —
      // and an unguarded write to a missing one throws mid-handler. A thrown
      // click is indistinguishable from a dead button, which is exactly how the
      // pairing chips presented: correct markup, correct styling, nothing
      // happening. Falling back to plain text is the right failure: the answer
      // still arrives, it just does not animate.
      if (picksBox) {
        picksBox.hidden = true;
        picksBox.innerHTML = '';
      }
      if (!stream) return renderPicks(picks);

      if (!settings.sommStream) {
        stream.textContent = text;
        return renderPicks(picks);
      }

      var i = 0;
      var speed = settings.sommTypeSpeed || 12;
      stream.innerHTML = '';
      var cursor = document.createElement('span');
      cursor.className = 'non-somm__cursor';

      timer = setInterval(function () {
        i += 3;
        if (i >= text.length) {
          clearInterval(timer);
          stream.textContent = text;
          renderPicks(picks);
        } else {
          stream.textContent = text.slice(0, i);
          stream.appendChild(cursor);
        }
      }, speed);
    }

    function renderPicks(picks) {
      if (window.NON && NON.answered) {
        /* Reported here rather than on fetch success, because an answer the
           reader never sees is not an answer. This fires when it is on screen. */
        NON.answered('somm', { picks: (picks || []).length, has_box: !!picksBox });
      }

      /* The named-event dictionary the brief asks for, alongside the
         started/answered/failed triple that already exists. The two measure
         different things and both are wanted: the triple answers "is the
         feature alive", these answer "did it sell anything". */
      if (NON.sommTrack) {
        NON.sommTrack('somm_recommendation_returned', {
          surface: (form.__nonSommSurface || {}).surface || context,
          count: (picks || []).length,
          recommended_product_id: (picks || [])[0] || '',
          recommendation_id: (picks || []).join('+')
        });
      }

      if (!picksBox || !picks || !picks.length) return;

      /* Which card. The sheet gets the shoppable one; every other surface
         keeps the row it has today. Decided from where the panel IS rather
         than from a viewport query, so a desktop-width theme editor preview of
         the sheet still renders the sheet's card. */
      var inSheet = !!picksBox.closest('[data-non-sheet]');
      var html = picks
        .map(function (code, i) { return inSheet ? recommendationCard(code, i) : pickCard(code); })
        .filter(Boolean)
        .join('');
      if (!html) return;
      picksBox.innerHTML = html;
      picksBox.hidden = false;
    }


    /* ------------------------------------------------------- ask a human */

    /* Some questions deserve a person: an allergy the ingredient list cannot
       clear, a wholesale enquiry, a journalist. The Worker marks those and
       returns a drafted email; this renders it.

       NOTHING IS SENT WITHOUT THE CUSTOMER PRESSING SEND. The draft is a
       starting point in an editable field, not an outbox — a message sent in
       someone's name that they never read is worse than no feature. The email
       field is theirs so a reply can reach them.

       It posts through Shopify's own contact form, the same endpoint the
       contact page uses, so it lands in the store's contact inbox with no new
       credential, no third-party sender and no deliverability setup of its
       own. */
    function renderEscalation(esc) {
      if (!esc) return;
      /* The card is Shopify's own contact form, rendered by ask-form.liquid
         and sitting in the DOM from page load. This only fills it in and shows
         it — it does not build a form and it never submits one.

         Everything else was tried: a hand-built payload to /contact (400), the
         same inside a hidden iframe (400), and a scripted .submit() on the real
         form, which Shopify answered with a page titled "Missing CAPTCHA
         token". The token is issued when a human interacts with a form Shopify
         rendered. So the human does. */
      var card = document.querySelector('[data-non-ask-card]');
      if (!card) return;
      /* A card already showing a sent or failed state is the result of a
         submit the customer just made. Asking another question must not
         overwrite the confirmation they came back to read. */
      if (card.querySelector('.non-ask__msg--sent, .non-ask__msg--bad')) return;

      var body = card.querySelector('[data-non-ask-message]');
      var subject = card.querySelector('[data-non-ask-subject]');
      var name = card.querySelector('[data-non-ask-name]');

      // Never overwrite something the customer has already started editing.
      // An answer arriving while they type would otherwise wipe it.
      if (body && !body.value.trim()) body.value = esc.body || '';
      if (subject) subject.value = esc.subject || 'Question from the NON site';
      if (name) name.value = 'NON Somm' + (esc.about ? ' \u2014 ' + esc.about : '');

      card.hidden = false;
    }

    /* THE SERVICE IS DOWN, AND SAYS SO.
     *
     * The canned fallback below is a good answer when a seed genuinely matches
     * what was asked. When none does, it used to serve seeds[0] — so someone
     * asking about allergens got the roast chicken answer, confidently, with
     * nothing anywhere saying the Somm never saw the question. The file's own
     * comment noticed: "a worker that is down looks exactly like one that is
     * up."
     *
     * On the sheet that becomes this panel instead: it says the Somm is away,
     * it does not block shopping, and it offers the two things worth offering.
     * Desktop keeps the old path untouched — changing how the desktop Somm
     * behaves is one of the brief's explicit regressions.
     */
    function failurePanel(query) {
      if (!picksBox) return false;
      show();
      if (stream) stream.textContent = t('sommFailHead', 'The Somm is away from the table.');
      picksBox.innerHTML =
        '<div class="non-rec-fail">' +
        '<p class="non-rec-fail__b">' + esc(t('sommFailBody', 'Browse the range or try again.')) + '</p>' +
        '<div class="non-rec-fail__actions">' +
        '<button type="button" class="non-rec__add" data-non-somm-retry>' +
        esc(t('sommRetry', 'Try again')) + '</button>' +
        '<a class="non-rec__see" href="/collections/the-range">' +
        esc(t('sommShopRange', 'Shop the range')) + '</a>' +
        '</div></div>';
      picksBox.hidden = false;
      lastQuery = query;
      return true;
    }

    function fallback(query) {
      var hit = matchSeed(seeds, query);

      /* In the sheet, an unmatched question during an outage is a failure, not
         an excuse to read out an unrelated canned answer. */
      if (!hit && picksBox && picksBox.closest('[data-non-sheet]')) {
        thinking(false);
        failurePanel(query);
        return;
      }

      var first = seeds[0];
      var answer = hit ? hit.answer : (first ? first.answer : NON.strings.sommError);
      var picks = hit ? hit.picks : (first ? first.picks : []);

      // Even a canned answer gets the beat. An answer that appears the instant
      // you ask reads as a lookup; the same answer after a moment reads as a
      // somm thinking about it. The wait is honest either way — it is not
      // pretending to compute, it is pacing a conversation.
      show();
      if (stream) stream.textContent = '';
      thinking(true);
      endThinking(function () { type(answer, picks); });
    }

    function ask(query) {
      if (!query.trim()) return;

      /* Length and surface only — never the question itself. Capturing what a
         customer typed is a data-collection decision with a privacy-policy
         consequence, and that is task #14. */
      if (window.NON && NON.started) {
        NON.started('somm', { chars: query.trim().length, context: context, has_endpoint: !!ENDPOINT });
      }

      history.push({ role: 'user', text: query });
      lastQuery = query;

      if (!ENDPOINT) return fallback(query);

      if (submit) submit.disabled = true;
      show();
      if (stream) stream.textContent = '';
      thinking(true);

      /* A WORD AFTER THE WAIT STOPS BEING SHORT.
       *
       * The dots are the right answer for a second or two and the wrong one at
       * eight — at that point an animation with no words is indistinguishable
       * from a hang, and the brief rules out an indefinite typing animation
       * for exactly that reason. This does not replace the mark; it puts a
       * sentence beside it so the wait is accounted for.
       *
       * 4.5s, because the Worker's own p95 is comfortably inside that and this
       * should be the exception rather than a caption everyone reads. */
      clearTimeout(slowTimer);
      slowTimer = setTimeout(function () {
        if (!thinkingEl) return;
        var note = thinkingEl.querySelector('.non-think__slow');
        if (note) return;
        note = document.createElement('span');
        note.className = 'non-think__slow';
        note.textContent = t('sommSlow', 'The Somm is still considering the table…');
        thinkingEl.appendChild(note);
      }, 4500);

      askOnce({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Ask for the stream. The Worker answers with SSE on the two
          // single-call paths and plain JSON everywhere else; the handler
          // below already switches on the response content-type, so both
          // shapes are handled and neither is assumed.
          //
          // Sent as a header rather than a body flag so the Worker can keep
          // serving JSON to every other caller — the audit harnesses and
          // /somm/suggestions read res.json(), and a Worker that streamed at
          // everyone would break all of them to save a second here.
          Accept: 'text/event-stream, application/json'
        },
        body: JSON.stringify({
          query: query,
          context: context,
          page: window.location.pathname,
          code: code,
          // The Somm's answers are generated, so they cannot be translated
          // after the fact — the language has to travel with the question.
          // theme.liquid already sets <html lang> from request.locale, so the
          // storefront's own locale is the source and nothing new is plumbed.
          // The Worker treats 'en' and anything it does not know as English.
          locale: document.documentElement.lang || 'en',
          // The bottle's own spec sheet, when the page publishes one. The
          // request used to carry a code and nothing else, so anything not
          // derivable from the code — storage, serving, ingredients — had no
          // source and the Somm could only decline or guess. Sent as facts
          // rather than prose so the Worker can quote them rather than
          // paraphrase.
          facts: readFacts(),
          // WHERE THE QUESTION CAME FROM.
          //
          // The Worker already knew WHAT was asked and, on a product page,
          // which bottle. It did not know that this question arrived by
          // tapping "Mains" on the homepage triptych — so a customer who had
          // already told the site they were cooking a main course had to say
          // it again in words, and the first answer was a general one.
          //
          // Additive: an object the Worker can ignore entirely and still
          // behave exactly as it does today. Nothing here is required for a
          // reply, and nothing here is free text the customer typed.
          surface: form.__nonSommSurface || null,
          history: history.slice(-8)
        })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('somm ' + res.status);

          var type_ = res.headers.get('content-type') || '';
          if (type_.indexOf('text/event-stream') !== -1) return readStream(res);

          return res.json().then(function (data) {
            endThinking(function () {
              type(data.answer || '', data.picks || []);
              renderEscalation(data.escalate);
              history.push({ role: 'assistant', text: data.answer || '' });
            });
          });
        })
        .catch(function (err) {
          // Endpoint down or CORS-blocked: fall back rather than show nothing.
          // The mark goes red for a beat first — the identity doc has a red
          // state and this is what it is for — then the fallback answers.
          //
          // Reported, because the fallback is convincing: the reader still
          // gets an answer, so a worker that is down looks exactly like one
          // that is up. Without this the somm could fail for days in silence.
          if (window.NON && NON.failed) {
            NON.failed('somm', { reason: 'endpoint_unreachable', context: context });
          }
          if (NON.sommTrack) {
            NON.sommTrack('somm_recommendation_failed', {
              surface: (form.__nonSommSurface || {}).surface || context,
              reason: 'endpoint_unreachable'
            });
          }
          console.warn('[NON somm] endpoint unreachable — serving the canned fallback. The customer still sees an answer, so this will not look broken.', err);
          thinking(true, true);
          setTimeout(function () { thinking(false); fallback(query); }, 700);
        })
        .finally(function () {
          submit.disabled = false;
        });
    }

    // SSE: append tokens as they arrive; a trailing {"picks":[…]} frame sets picks.
    /* One retry, and only on a NETWORK failure.
     *
     * The 204-question mega-test had one request return `fetch failed` after
     * seventy seconds. There was no retry, so that customer got a dead box —
     * 0.5% of questions, but 100% of that person's experience.
     *
     * Deliberately narrow:
     *  - a rejected promise only. An HTTP response, including a 500, is the
     *    Worker answering, and its own fallback is better than asking twice.
     *  - once. A Worker that is down stays down, and a second failure should
     *    reach the canned fallback quickly rather than after three timeouts.
     *  - a short pause first, because the failure mode this exists for is a
     *    dropped connection rather than a busy server.
     */
    function askOnce(init) {
      return fetch(ENDPOINT, init).catch(function (err) {
        console.warn('[NON somm] request failed, retrying once', err);
        return new Promise(function (resolve) { setTimeout(resolve, 400); })
          .then(function () { return fetch(ENDPOINT, init); });
      });
    }

    function readStream(res) {
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var text = '';

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) {
            // A stream shorter than MIN_THINK would otherwise finish with the
            // dots still up and nothing painted.
            thinking(false);
            if (stream && text) stream.textContent = text;
            history.push({ role: 'assistant', text: text });
            return;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          var frames = buffer.split('\n\n');
          buffer = frames.pop();

          frames.forEach(function (frame) {
            var line = frame.replace(/^data:\s*/, '').trim();
            if (!line || line === '[DONE]') return;
            try {
              var parsed = JSON.parse(line);
              if (parsed.token) {
                text += parsed.token;
              } else {
                /* THE TAIL FRAME. Everything that is not a token is the final
                   payload, and it is handled as one thing rather than as a
                   picks frame that happens to be first.

                   It used to `return` on picks, which would have silently
                   dropped an escalation riding the same frame — and the
                   escalation always rides the same frame.

                   Its `answer` is also authoritative over the tokens we
                   accumulated. The Worker suppresses the stream from the
                   first '[[' so the ask-a-human marker cannot type itself
                   across the screen, which means on an escalated answer the
                   token stream is deliberately short. Repainting from the
                   tail is what completes the sentence. */
                if (parsed.answer) {
                  text = parsed.answer;
                  if (stream) stream.textContent = text;
                }
                if (parsed.picks) renderPicks(parsed.picks);
                if (parsed.escalate) renderEscalation(parsed.escalate);
                return;
              }
            } catch (e) {
              text += line;
            }
            // The dots hand over on the FIRST token, not at the end of the
            // stream. Leaving them up while text arrives underneath would say
            // "still thinking" while it is plainly already answering.
            // Streaming hands over on the first token, but not before the
            // minimum — otherwise a fast first token defeats the whole point.
            if (text && thinkingSince && Date.now() - thinkingSince >= MIN_THINK) thinking(false);
            if (!thinkingSince && stream) stream.textContent = text;
          });

          return pump();
        });
      }

      show();
      return pump();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(input.value);
    });

    /* The hero's "Ask the Somm" button. It scrolls the field into view and
       focuses it rather than navigating anywhere — the Somm is on this page,
       and a button that reloads the page to reach something six inches down
       would be theatre.

       Bound here rather than in the section so it shares the controller that
       already knows which input belongs to which surface; the product page has
       its own, and a document-wide selector would focus the wrong one. */
    /* --- the recommendation card's own controls -------------------------- */

    /* Delegated on the root for the same reason the seeds are: these buttons
     * are written into the panel by renderPicks long after this runs, and they
     * are replaced wholesale on every new answer. */
    if (!root.__nonSommRec) {
      root.__nonSommRec = true;

      root.addEventListener('click', function (e) {
        var surface = (form.__nonSommSurface || {}).surface || context;

        /* ADD TO CART.
         *
         * Goes through NON.cart.add, which is Shopify's own AJAX API, and
         * therefore reports success only when Shopify has said so. The button
         * is disabled for the whole round trip, so a double tap cannot post
         * twice, and the label never claims "Added" on the strength of the
         * click alone — the brief is explicit that nothing may claim an item
         * was added until Shopify confirms it. */
        var add = e.target.closest('[data-non-somm-add]');
        if (add) {
          e.preventDefault();
          if (add.disabled) return;
          var variant = add.getAttribute('data-variant-id');
          var code = add.getAttribute('data-code') || '';
          if (!variant || !NON.cart) return;

          var card = add.closest('[data-non-rec]');
          var msg = card && card.querySelector('[data-non-rec-msg]');
          var label = add.textContent;

          add.disabled = true;
          add.textContent = t('sommRecAdding', 'Adding…');
          if (msg) { msg.hidden = true; msg.textContent = ''; }

          NON.cart
            .add(variant, 1)
            .then(function (cart) {
              add.textContent = t('sommRecAdded', 'Added');
              /* Only here. Everything before this point is an intention. */
              if (NON.sommTrack) {
                NON.sommTrack('somm_add_to_cart', {
                  surface: surface,
                  recommended_product_id: code,
                  recommended_variant_id: variant,
                  currency: (cart && cart.currency) || '',
                  position: card ? Array.prototype.indexOf.call(card.parentNode.children, card) : 0
                });
              }
            })
            .catch(function (err) {
              add.disabled = false;
              add.textContent = label;
              if (msg) {
                msg.textContent = (err && err.message) || t('sommRecAddFailed', 'That didn’t add. Try again.');
                msg.hidden = false;
              }
              if (NON.sommTrack) {
                NON.sommTrack('somm_add_to_cart_failed', {
                  surface: surface,
                  recommended_product_id: code,
                  recommended_variant_id: variant,
                  reason: (err && err.message) || 'unknown'
                });
              }
            });
          return;
        }

        /* Following a card through to the bottle. Recorded on the way out so
           recommendation-to-PDP can be measured against recommendation-to-cart
           — the two rates the brief asks to compare. */
        var view = e.target.closest('[data-non-somm-view]');
        if (view) {
          if (NON.sommTrack) {
            NON.sommTrack('somm_product_viewed', {
              surface: surface,
              recommended_product_id: view.getAttribute('data-code') || ''
            });
          }
          return;
        }

        /* "Why this one?" and "Show me another" are questions, not controls.
           They go back through ask() so the answer arrives the same way every
           other answer does, and so the Worker keeps the thread. */
        var why = e.target.closest('[data-non-somm-why]');
        if (why) {
          e.preventDefault();
          ask(t('sommRecWhy', 'Why this one?') + ' ' + (why.getAttribute('data-code') || ''));
          return;
        }

        var another = e.target.closest('[data-non-somm-another]');
        if (another) {
          e.preventDefault();
          if (NON.sommTrack) {
            NON.sommTrack('somm_product_compared', {
              surface: surface,
              recommended_product_id: another.getAttribute('data-code') || ''
            });
          }
          ask(t('sommRecAnother', 'Show me another') + ' — not ' + (another.getAttribute('data-code') || ''));
          return;
        }

        /* Retry after a failure asks the SAME question again rather than
           clearing the box and waiting for it to be retyped. */
        var retry = e.target.closest('[data-non-somm-retry]');
        if (retry) {
          e.preventDefault();
          if (lastQuery) ask(lastQuery);
        }
      });
    }

    var focusBtn = root.querySelector('[data-non-somm-focus]');
    if (focusBtn && input) {
      focusBtn.addEventListener('click', function () {
        // Focus first, then scroll: focus() alone jumps abruptly on some
        // engines, and preventScroll lets the smooth scroll own the movement.
        input.focus({ preventScroll: true });
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    /* DELEGATED, not bound per button.
     *
     * Two reasons, and the second is the one that forced it. Binding each
     * button meant a chip added AFTER load was dead — and the mobile sheet
     * clones its chips out of this section at open time, so every one of them
     * would have been. It also meant a Shopify section reload re-bound every
     * surviving button a second time, which is the duplicate-listener problem
     * the brief calls out: one click, two requests, two analytics rows.
     *
     * A listener on the root has neither problem: it is installed once and it
     * sees buttons that did not exist when it was installed. */
    if (!root.__nonSommSeeds) {
      root.__nonSommSeeds = true;
      root.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-non-somm-seed]');
        if (!btn || !root.contains(btn)) return;

        var label = btn.textContent.trim();
        if (input) input.value = label;
        // Seeds answer from their own vetted copy rather than the model, but
        // they go through the same thinking beat — this path was the reason
        // the working state was never seen, since the chips are what most
        // people press first.
        var answer = btn.getAttribute('data-answer') || '';
        var picks = (btn.getAttribute('data-picks') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);

        // No canned answer means ASK FOR A REAL ONE. The pairing page's dish
        // chips set data-answer to the dish name itself, so this path typed the
        // label straight back at you — the click worked, the request never
        // happened, and it read as a dead button. A seed without vetted copy is
        // a question, not an answer.
        if (!answer) return ask(label);

        show();
        if (stream) stream.textContent = '';
        thinking(true);
        endThinking(function () { type(answer, picks); });
      });
    }

    /* The way in from outside this file. The mobile sheet's prompt chips, its
     * "Show me another", and the triptych's follow-up answers all need to put
     * a question to THIS controller — the one that owns the surface they are
     * displayed on — rather than to whichever one happens to be first in the
     * document. */
    form.__nonSommAsk = function (text) {
      if (input) input.value = text;
      ask(text);
    };
  }

  document.querySelectorAll('[data-non-somm]').forEach(Somm);
})();
