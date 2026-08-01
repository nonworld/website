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
      /* a malformed catalogue must not take the somm down */
    }
  });

  function pickCard(code) {
    var p = catalogue[String(code).toUpperCase()];
    if (!p) return '';
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
      picksBox.hidden = true;
      picksBox.innerHTML = '';

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
      if (!picks || !picks.length) return;
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

      history.push({ role: 'user', text: query });

      if (!ENDPOINT) return fallback(query);

      submit.disabled = true;
      show();
      stream.textContent = '';
      thinking(true);

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          context: context,
          page: window.location.pathname,
          code: code,
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
        .catch(function () {
          // Endpoint down or CORS-blocked: fall back rather than show nothing.
          // The mark goes red for a beat first — the identity doc has a red
          // state and this is what it is for — then the fallback answers.
          thinking(true, true);
          setTimeout(function () { thinking(false); fallback(query); }, 700);
        })
        .finally(function () {
          submit.disabled = false;
        });
    }

    // SSE: append tokens as they arrive; a trailing {"picks":[…]} frame sets picks.
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
            if (!thinkingSince) stream.textContent = text;
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
        show();
        if (stream) stream.textContent = '';
        thinking(true);
        endThinking(function () { type(answer, picks); });
      });
    });
  }

  document.querySelectorAll('[data-non-somm]').forEach(Somm);
})();
