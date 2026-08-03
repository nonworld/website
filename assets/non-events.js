/* ==========================================================================
   NON — feature events.

   WHY THIS EXISTS. The pairing dish chips were dead for weeks. Aaron reported
   it fifteen times. Sessions, pageviews, conversion and Triple Whale all
   looked completely normal the whole time, because a click that does nothing
   still registers as a click. Every metric NON had measured whether people
   ARRIVED, not whether the thing they touched WORKED.

   So this measures the second thing. Each feature reports three states:

     _started    someone asked it for something
     _answered   it gave them something back
     _failed     it tried and could not

   The gap between started and answered is where dead ends live. A feature
   whose started count holds steady while answered falls to zero is broken,
   and that is visible within a day rather than whenever somebody complains.

   TRANSPORT. Pushes to window.dataLayer, which is already on the site via
   Google Tag Manager, so events land wherever GTM is already configured to
   send them with no extra script. Also dispatches a DOM CustomEvent so
   anything else on the page can listen without coupling to GTM, and mirrors
   to console.debug so a developer can watch it live.

   NO PERSONAL DATA. Free text the customer typed is NEVER sent — only its
   length and whether it matched. The somm's questions are the highest-value
   dataset NON has, but capturing them is a data-collection decision with a
   privacy-policy consequence, and that is task #14, not this.
   ========================================================================== */
(function () {
  'use strict';

  var NON = (window.NON = window.NON || {});
  if (NON.track) return; // never double-install

  window.dataLayer = window.dataLayer || [];

  /* Strip anything that could carry what a person typed. Belt and braces:
     the call sites already avoid it, but a future one might not. */
  var BANNED = /^(query|question|text|value|email|name|message|answer)$/i;

  function clean(props) {
    var out = {};
    Object.keys(props || {}).forEach(function (k) {
      if (BANNED.test(k)) return;
      var v = props[k];
      if (v === null || v === undefined) return;
      if (typeof v === 'string' && v.length > 60) v = v.slice(0, 60);
      out[k] = v;
    });
    return out;
  }

  /**
   * @param {string} name  feature_state, e.g. 'somm_answered'
   * @param {object} props small, non-identifying detail
   */
  NON.track = function (name, props) {
    var payload = clean(props);
    payload.event = 'non_' + name;
    payload.non_surface = document.body ? (document.body.className || '').slice(0, 60) : '';
    payload.non_path = location.pathname;

    try { window.dataLayer.push(payload); } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent('non:track', { detail: payload }));
    } catch (e) {}

    /* Visible while developing, silent-ish in production — console.debug is
       filtered out of the default console view. */
    try { console.debug('[NON event]', payload.event, payload); } catch (e) {}
  };

  /* Convenience wrappers so call sites read as prose. */
  NON.started  = function (feature, props) { NON.track(feature + '_started', props); };
  NON.answered = function (feature, props) { NON.track(feature + '_answered', props); };
  NON.failed   = function (feature, props) { NON.track(feature + '_failed', props); };
})();
