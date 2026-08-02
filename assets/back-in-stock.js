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

  /* Not a <form>. This block lives inside the product's add-to-cart form, and
     HTML forbids nested forms — the parser drops the inner start tag and keeps
     its children, so the element the script wants is simply not in the DOM
     while the markup looks right in the source. So: a div, a plain button, and
     Enter on the field wired by hand. */
  document.querySelectorAll('[data-non-bis]').forEach(function (form) {
    var key = form.getAttribute('data-bis-key');
    var variantId = form.getAttribute('data-bis-variant');
    var input = form.querySelector('[data-non-bis-input]');
    var msg = form.querySelector('[data-non-bis-msg]');
    var submit = form.querySelector('[data-non-bis-submit]');

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

    function send(e) {
      if (e && e.preventDefault) e.preventDefault();

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
    }

    if (submit) submit.addEventListener('click', send);

    /* Enter in the field would otherwise SUBMIT THE CART FORM this block sits
       inside — the customer types an email, presses Enter, and adds a sold-out
       product to the cart instead of subscribing. Stopping the default is the
       whole point of catching it here. */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        send(e);
      }
    });
  });
})();
