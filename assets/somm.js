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
        if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
        return;
      }

      if (on && !thinkingSince) thinkingSince = Date.now();
      if (!on) thinkingSince = 0;

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
      if (!picksBox || !picks || !picks.length) return;
      var html = picks.map(pickCard).filter(Boolean).join('');
      if (!html) return;
      picksBox.innerHTML = html;
      picksBox.hidden = false;
    }

    function fallback(query) {
      var hit = matchSeed(seeds, query);
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

      if (!ENDPOINT) return fallback(query);

      if (submit) submit.disabled = true;
      show();
      if (stream) stream.textContent = '';
      thinking(true);

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
              if (parsed.picks) return renderPicks(parsed.picks);
              if (parsed.token) text += parsed.token;
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

    root.querySelectorAll('[data-non-somm-seed]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (input) input.value = btn.textContent.trim();
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
        if (!answer) return ask(btn.textContent.trim());

        show();
        if (stream) stream.textContent = '';
        thinking(true);
        endThinking(function () { type(answer, picks); });
      });
    });
  }

  document.querySelectorAll('[data-non-somm]').forEach(Somm);
})();
