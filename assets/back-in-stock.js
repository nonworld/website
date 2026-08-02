/* Back in stock — Klaviyo client endpoint.
 *
 * The client API takes the PUBLIC site id as company_id. That key is public by
 * design; it is the same one Klaviyo's own onsite script puts in the page, so
 * there is nothing here worth a Worker or a server round trip.
 *
 * The variant is addressed in Klaviyo's catalog form:
 *   $shopify:::$default:::<numeric variant id>
 * Not the Shopify GID and not the product id — a subscription bound to the
 * wrong identifier is accepted by the API and then never sends anything, which
 * is the worst possible failure for this feature because it looks like it
 * worked.
 *
 * A 202 means accepted, and Klaviyo returns NO body for it. Anything that
 * parses the response as JSON will throw on success.
 */
(function () {
  var ENDPOINT = 'https://a.klaviyo.com/client/back-in-stock-subscriptions/';
  var REVISION = '2024-10-15';

  document.querySelectorAll('[data-non-bis]').forEach(function (form) {
    var key = form.getAttribute('data-bis-key');
    var variantId = form.getAttribute('data-bis-variant');
    var input = form.querySelector('[data-non-bis-input]');
    var msg = form.querySelector('[data-non-bis-msg]');
    var submit = form.querySelector('button[type="submit"]');

    /* Every optional target is guarded. A thrown click is indistinguishable
       from a dead button, and this theme has been bitten by that once. */
    if (!key || !variantId || !input) return;

    function say(text, ok) {
      if (!msg) return;
      msg.textContent = text;
      msg.hidden = false;
      msg.classList.toggle('is-ok', ok === true);
      msg.classList.toggle('is-bad', ok === false);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var email = (input.value || '').trim();
      if (!email) return;

      if (submit) submit.disabled = true;
      say(form.getAttribute('data-bis-sending') || 'Adding you…');

      fetch(ENDPOINT + '?company_id=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json', revision: REVISION },
        body: JSON.stringify({
          data: {
            type: 'back-in-stock-subscription',
            attributes: {
              channels: ['EMAIL'],
              profile: { data: { type: 'profile', attributes: { email: email } } }
            },
            relationships: {
              variant: {
                data: {
                  type: 'catalog-variant',
                  id: '$shopify:::$default:::' + variantId
                }
              }
            }
          }
        })
      })
        .then(function (res) {
          /* 202 is the success case and carries no body — do not res.json(). */
          if (res.ok || res.status === 202) {
            form.classList.add('is-done');
            say(form.getAttribute('data-bis-ok') || "Done. We'll email you the moment it's back.", true);
            input.value = '';
            return;
          }
          throw new Error('klaviyo ' + res.status);
        })
        .catch(function (err) {
          console.error('[bis]', err);
          say(form.getAttribute('data-bis-fail') || 'That did not go through. Try again in a moment.', false);
        })
        .then(function () {
          if (submit) submit.disabled = false;
        });
    });
  });
})();
