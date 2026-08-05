/* ==========================================================================
   NON — cart
   Shopify's native AJAX Cart API. The static design tracked `cart: 0` in
   component state and never left the page; nothing from that logic survives
   here beyond the header count, which is now derived from /cart.js.
   ========================================================================== */
(function () {
  'use strict';

  var NON = window.NON || {};
  var routes = NON.routes || {};
  var settings = NON.settings || {};
  var strings = NON.strings || {};

  /* --- money ------------------------------------------------------------ */

  // Money in an explicit symbol rather than the shop's format. `moneyFormat`
  // is `shop.money_format`, which is the SHOP's currency, not the market's —
  // under Shopify Markets a GBP cart still formats with the shop's symbol.
  // The free-shipping line carries its own symbol from free-shipping.liquid
  // so the threshold and the amount agree with each other.
  function formatIn(symbol, cents) {
    var value = (cents / 100).toFixed(2);
    var parts = value.split('.');
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return symbol + whole + '.' + parts[1];
  }

  function formatMoney(cents) {
    var format = settings.moneyFormat || '${{amount}}';
    var value = (cents / 100).toFixed(2);
    var parts = value.split('.');
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return format
      .replace(/\{\{\s*amount\s*\}\}/, whole + '.' + parts[1])
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, whole)
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, whole + ',' + parts[1])
      .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/, whole);
  }

  /* --- fetch helpers ---------------------------------------------------- */

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.description || data.message || 'Cart error');
        return data;
      });
    });
  }

  function getCart() {
    return fetch(routes.cart, { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json();
    });
  }

  /* --- rendering -------------------------------------------------------- */

  var drawer = document.querySelector('[data-non-cart-drawer]');

  function itemNode(item) {
    var wrap = document.createElement('div');
    wrap.className = 'non-drawer__item';

    var img = item.image
      ? '<img src="' + item.image.replace(/(\.[a-z]+)(\?|$)/i, '_160x$1$2') + '" alt="" loading="lazy">'
      : '<span class="non-drawer__item-noimg"></span>';

    wrap.innerHTML =
      img +
      '<div style="flex:1">' +
      '<a href="' + item.url + '" style="font-size:14px;display:block">' + item.product_title + '</a>' +
      (item.variant_title && item.variant_title !== 'Default Title'
        ? '<span class="non-mono non-eyebrow" style="display:block;margin-top:5px">' + item.variant_title + '</span>'
        : '') +
      '<div class="non-drawer__qty">' +
      '<button type="button" data-non-qty="' + item.key + '" data-delta="-1" aria-label="Decrease">&minus;</button>' +
      '<span>' + item.quantity + '</span>' +
      '<button type="button" data-non-qty="' + item.key + '" data-delta="1" aria-label="Increase">+</button>' +
      '<button type="button" data-non-remove="' + item.key + '" class="non-drawer__rm" ' +
      'style="margin-left:auto;background:none;border:0;color:var(--non-fg-mute);' +
      'font-family:var(--non-mono);font-size:10.5px;cursor:pointer;text-decoration:underline">' +
      'Remove</button>' +
      '</div>' +
      '</div>' +
      '<strong style="font-size:13px">' + formatMoney(item.final_line_price) + '</strong>';

    return wrap;
  }

  function render(cart) {
    // header count — every header instance, in case of sticky duplicates
    document.querySelectorAll('[data-non-cart-count]').forEach(function (el) {
      el.textContent = 'Cart (' + cart.item_count + ')';
    });

    if (!drawer) return;

    var items = drawer.querySelector('[data-non-cart-items]');
    var subtotal = drawer.querySelector('[data-non-cart-subtotal]');
    var checkout = drawer.querySelector('[data-non-cart-checkout]');
    var shipping = drawer.querySelector('[data-non-cart-shipping]');

    items.innerHTML = '';

    if (!cart.item_count) {
      var empty = document.createElement('p');
      empty.className = 'non-drawer__empty';
      empty.textContent = NON.strings.cartEmpty;
      items.appendChild(empty);
      checkout.disabled = true;
    } else {
      cart.items.forEach(function (item) {
        items.appendChild(itemNode(item));
      });
      checkout.disabled = false;
    }

    subtotal.textContent = formatMoney(cart.total_price);

    // Display-only progress line. The real rate lives in Shopify Shipping —
    // which is exactly why this is resolved per market in snippets/free-shipping.liquid
    // and renders nothing where no free rate is confirmed. A threshold of 0
    // means "this market has no rate we can promise", not "no threshold set".
    var freeShipping = settings.freeShipping || { threshold: 0, symbol: '' };
    if (freeShipping.threshold > 0 && cart.item_count) {
      var remaining = freeShipping.threshold - cart.total_price;
      shipping.hidden = false;
      shipping.textContent =
        remaining > 0
          ? (strings.freeShippingProgress || '[amount] away from free shipping').replace(
              '[amount]',
              formatIn(freeShipping.symbol, remaining)
            )
          : strings.freeShippingMet || 'Free shipping unlocked';
    } else if (shipping) {
      shipping.hidden = true;
    }

    renderUpsell(cart);
  }

  /* --- drawer open/close ------------------------------------------------ */

  var lastFocus = null;

  function open() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    var close = drawer.querySelector('[data-non-cart-close]');
    if (close) close.focus();
  }

  function close() {
    if (!drawer) return;
    drawer.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
    // The lotto waits on this before auto-opening — it is a full-viewport
    // overlay that outranks the drawer, so it holds off while someone is
    // actually checking out.
    document.dispatchEvent(new CustomEvent('non:cart:closed'));
  }

  /* --- actions ---------------------------------------------------------- */

  function add(variantId, quantity, properties) {
    var payload = { items: [{ id: Number(variantId), quantity: quantity || 1 }] };
    if (properties) payload.items[0].properties = properties;

    return postJSON(routes.cart_add, payload)
      .then(getCart)
      .then(function (cart) {
        render(cart);
        if (settings.cartDrawer) open();
        else window.location.href = routes.cart_page;
        document.dispatchEvent(new CustomEvent('non:cart:updated', { detail: cart }));
        return cart;
      });
  }

  function change(key, quantity) {
    return postJSON(routes.cart_change, { id: key, quantity: quantity })
      .then(function (cart) {
        render(cart);
        document.dispatchEvent(new CustomEvent('non:cart:updated', { detail: cart }));
        return cart;
      });
  }

  /* --- delegated events -------------------------------------------------- */

  document.addEventListener('click', function (e) {
    var addBtn = e.target.closest('[data-non-add]');
    if (addBtn) {
      e.preventDefault();
      var id = addBtn.getAttribute('data-variant-id');
      if (!id) return;
      var original = addBtn.textContent;
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      add(id, Number(addBtn.getAttribute('data-quantity')) || 1)
        .then(function () {
          addBtn.textContent = 'Added ✓';
        })
        .catch(function (err) {
          addBtn.textContent = err.message || 'Unavailable';
        })
        .finally(function () {
          setTimeout(function () {
            addBtn.disabled = false;
            addBtn.textContent = original;
          }, 1600);
        });
      return;
    }

    if (e.target.closest('[data-non-cart-open]')) {
      e.preventDefault();
      getCart().then(render).then(open);
      return;
    }

    if (e.target.closest('[data-non-cart-close]')) {
      e.preventDefault();
      close();
      return;
    }

    var qty = e.target.closest('[data-non-qty]');
    if (qty) {
      e.preventDefault();
      var row = qty.parentElement.querySelector('span');
      var next = Number(row.textContent) + Number(qty.getAttribute('data-delta'));
      change(qty.getAttribute('data-non-qty'), Math.max(0, next));
      return;
    }

    var rm = e.target.closest('[data-non-remove]');
    if (rm) {
      e.preventDefault();
      change(rm.getAttribute('data-non-remove'), 0);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer && !drawer.hidden) close();
  });

  // Product forms post through the API rather than navigating to /cart.
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-non-product-form]');
    if (!form) return;
    e.preventDefault();

    var btn = form.querySelector('[type="submit"]');
    var id = form.querySelector('[name="id"]').value;
    var quantity = Number((form.querySelector('[name="quantity"]') || {}).value) || 1;
    var label = btn ? btn.textContent : '';

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
    }

    add(id, quantity)
      .catch(function (err) {
        var msg = form.querySelector('[data-non-form-error]');
        if (msg) msg.textContent = err.message;
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
  });

  /* --- add-ons ------------------------------------------------------------ */

  // Offer the stopper or the waiter's friend, but only when the cart does not
  // already hold one. The whole block hides when there is nothing left to
  // offer, rather than sitting there empty with a heading over it.
  //
  // This runs off the real cart payload rather than a flag, so adding one from
  // anywhere — the product page, a previous session — removes it from the
  // offer here too.
  function renderUpsell(cart) {
    var box = document.querySelector('[data-non-upsell]');
    if (!box) return;

    var inCart = {};
    (cart.items || []).forEach(function (i) { inCart[String(i.variant_id)] = true; });

    var offered = 0;
    box.querySelectorAll('[data-non-upsell-item]').forEach(function (row) {
      var has = inCart[row.getAttribute('data-variant')];
      row.hidden = !!has;
      if (!has) offered++;
    });

    // An empty cart has nothing to add to — the customer has not chosen a
    // bottle yet, and leading with an accessory is the wrong first ask.
    box.hidden = offered === 0 || !(cart.item_count > 0);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-non-upsell-add]');
    if (!btn) return;

    var id = btn.getAttribute('data-variant');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = window.NON.strings && window.NON.strings.cartUpsellAdding
      ? window.NON.strings.cartUpsellAdding
      : 'Adding…';

    add(id, 1)
      .catch(function () {})
      .finally(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
  });

  /* --- NON Lotto prize ---------------------------------------------------- */

  // The prize is won in a modal and used at checkout, and those are two very
  // different moments. Between them the card is dismissed, so a code that lives
  // only there is a code that quietly goes unredeemed. This carries it forward
  // to the one screen where it is actually worth something.
  //
  // Applying goes through /discount/<code>, which is Shopify's own mechanism:
  // it attaches the code to the session and redirects back. The discount is
  // therefore validated and applied by Shopify. Nothing here decides that a
  // discount is valid — it only remembers which one was won.
  var PRIZE_KEY = 'non-lotto-prize';
  var PRIZE_TTL = 1000 * 60 * 60 * 24 * 400; // ~13 months, matching the Worker ledger

  function readPrize() {
    try {
      var raw = localStorage.getItem(PRIZE_KEY);
      if (!raw) return null;
      var prize = JSON.parse(raw);
      /* A PRIZE NEEDS A CODE AND A NAME. Both, or it is not a prize.

         "YOU WON", a blank line, and "APPLY TO THIS ORDER" appeared in the
         cart of a customer who had DISMISSED the scratch card without
         revealing anything. A record with a code and an empty description is
         enough to satisfy a code-only guard, and the renderer then filled the
         blank with a cheerful fallback — so an absent prize was presented as a
         won one, immediately before checkout, with nothing to show for it.

         Requiring the description here is what makes the panel's presence mean
         something. A partial record is deleted rather than tolerated: it can
         only have come from a failed reveal or an older build, and leaving it
         in storage means the same empty panel returns on the next page. */
      if (!prize || !prize.code) return null;
      if (!prize.description || !String(prize.description).trim()) {
        localStorage.removeItem(PRIZE_KEY);
        return null;
      }
      // A prize older than the Worker would still honour is stale; drop it
      // rather than showing a code that has since been retired.
      if (prize.at && Date.now() - prize.at > PRIZE_TTL) {
        localStorage.removeItem(PRIZE_KEY);
        return null;
      }
      return prize;
    } catch (e) {
      return null; // private browsing, or somebody hand-edited storage
    }
  }

  function renderPrize() {
    var box = document.querySelector('[data-non-cart-prize]');
    if (!box) return;

    var prize = readPrize();
    if (!prize) { box.hidden = true; return; }

    var desc = box.querySelector('[data-non-cart-prize-desc]');
    var code = box.querySelector('[data-non-cart-prize-code]');
    var apply = box.querySelector('[data-non-cart-prize-apply]');

    /* No fallback. 'A gift from NON' invented a prize whenever the real one
       was missing, which is precisely how a blank record rendered as a win —
       the fallback hid the very condition that should have hidden the panel.
       readPrize now guarantees this is non-empty. */
    if (desc) desc.textContent = prize.description;
    if (code) code.textContent = prize.code;
    if (apply) {
      // encodeURIComponent on the code: it comes from storage, and storage is
      // writable by anything running on this origin. Shopify would reject a
      // malformed code anyway, but this keeps it from shaping the URL.
      apply.setAttribute(
        'href',
        '/discount/' + encodeURIComponent(prize.code) + '?redirect=' + encodeURIComponent('/cart')
      );
    }

    box.hidden = false;
  }

  // Won while the cart drawer is already on the page — repaint immediately
  // rather than waiting for a reload that may never come.
  document.addEventListener('non:lotto:won', renderPrize);

  /* --- boot -------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    getCart().then(render).catch(function () {});
    renderPrize();
  });

  window.NON.cart = { add: add, change: change, open: open, close: close, get: getCart, format: formatMoney };
})();
