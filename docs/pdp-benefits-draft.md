# `custom.benefits` — draft copy for the six bottles

Drafted 2026-08-04 from the live spec data on each PDP: tastes, sits-with,
nutrition, ingredients, the five process steps and the three pairing cards.
Nothing here is invented — every claim traces to something already published on
the page or in the product's own process copy.

## Where it goes

Shopify → product → Metafields → `custom.benefits`, one benefit per line, in
the form `Title | Body`. The PDP splits on the pipe and renders the title as a
heading with the body beneath. A line with no pipe renders as a title alone.

The Stopper and the Cap already carry this field, which is why they currently
have richer pages than any bottle. Same format.

## Why these four, on every bottle

The Cap has three benefits and five bottles have none, so the range's own pages
are the weakest on the site. The four below are chosen so the set answers the
four questions a customer actually arrives with, in the order they ask them:

1. **What is it like to drink?** — the only one the spec strip already answers,
   restated here as a reason rather than a description.
2. **Why is it not just juice?** — the tannin/acid/salt structure. This is the
   argument for the whole category and it is currently only implied by the
   process steps, which most people will not read.
3. **What do I do with it?** — the occasion, not the food. The pairing cards
   cover food; nothing covers when to open it.
4. **What is the catch?** — sugar and calories, said plainly. Every customer
   checks and the number is better coming from us.

Consistent shape across the range, so the six PDPs read as one family.

---

## NON1 — Salted Raspberry & Chamomile

```
Where a dry rosé sat | Balanced, sweet and salty, with chamomile tannin carrying a floral finish. Chilled, in a wine glass, at the point in the meal a rosé would have been poured.
Structure, not sweetness | Chamomile and raspberry skins give tannin. Barossa verjus gives the acid. Murray River salt gives the salinity that makes you want the next mouthful. That is the architecture of a drink, not a soft drink.
For the table with the oysters on it | Salinity meets salinity, and verjus does what a squeeze of lemon does. It also holds its own against chilli, where alcohol would only amplify the burn.
37 calories a serve, 7.1g sugar | Sugar is added at the end, in the amount the fruit needs and no more. Vegan, gluten free, 0.0% ABV.
```

## NON2 — Caramelised Pear & Kombu

```
Where a rich white sat | Bold body, buttery texture, minerality from kombu and a long spiced finish. The bottle for the course a Chardonnay used to get.
Savoury by construction | Japanese kombu and Kalamata olive brine for salinity, black tea and spice for tannin, roasted pears for the body. The glutamate in the kombu is doing the same work as miso on a plate.
For roast chicken and butter sauce | Buttery body against buttery sauce, with tea tannin cutting through it. Equally at home with grilled fish and miso, or a mushroom risotto.
27 calories a serve, 5.1g sugar | The lowest sugar of the still-bodied bottles, balanced with agave and vanilla rather than sugar. Vegan, gluten free, 0.0% ABV.
```

## NON3 — Toasted Cinnamon & Yuzu

```
Where an aromatic white sat | Bright and tart with a savoury undertone. The most versatile bottle in the range and the one to open if you are only opening one.
Two days of dehydrating oranges | Water is driven off over 48 hours to concentrate what is left, then cinnamon and orange skins add a lingering spiced tannin. Yuzu is the squeeze of citrus, already in the glass.
For antipasti and anything from the sea | Bitterness and grip cut cured fat the way a chilled light red does. With miso-glazed vegetables it is caramelised orange against caramelised miso.
40 calories a serve, 8.4g sugar | The sweetest of the range, and deliberately so — the tartness of yuzu and verjus needs it. Vegan, gluten free, 0.0% ABV.
```

## NON5 — Lemon Marmalade & Hibiscus

```
Where a dry sparkling sat | Tart native citrus, floral body, menthol on the nose and through the finish. The aperitif bottle.
Dry-hopped, like a beer | Eclipse hops and spices are added to the finished liquid for bitterness and grip. Lemon verbena, lemongrass, lemon myrtle, hibiscus and liquorice root do the aromatics.
For heat, and for green food | Salinity and acid cool chilli where alcohol would amplify it, which makes this the bottle for South East Asian cooking. Citrus and menthol lift grain salads and herbs.
18 calories a serve, 3.6g sugar | The lightest bottle in the range by both measures, by some distance. Vegan, gluten free, 0.0% ABV.
```

## NON7 — Stewed Cherry & Coffee

```
Where a big red sat | Rich dark fruit, a spiced nose and coffee underneath. Served chilled, in a wine glass, at the point in a meal a Shiraz would have arrived.
No added sugar | Cherries and spice are stewed in the oven for two hours until they concentrate into a jam. Cold brew coffee adds the tannin and the chocolate finish. Nothing is sweetened afterwards.
For char, and for the end of the night | Coffee bitterness reads like char, which makes charred beef the most natural match in the range. It also finishes a meal against dark chocolate.
30 calories a serve, 6.2g sugar | All of it from the fruit. Contains 37mg of caffeine per bottle, from the coffee. Vegan, gluten free, 0.0% ABV.
```

## NON9 — Oaked Blackberry & Plum

```
Where a pinot noir sat | Dark berries over forest-floor earthiness, firm tannins, spice through the finish. The fullest bottle NON makes.
Actual oak, actual grape skin | French oak and Shiraz skins are cooked at high temperature to pull the tannin out, the way a barrel would over years. Plums and beetroot are roasted separately to intensify them; fir pine and ancho chilli sit underneath.
For steak, and for the barbecue | Built for chargrilled beef — the tannin is there to meet it. Roast beetroot in the bottle against char on the plate makes barbecued vegetables work just as well.
51 calories a serve, 7.5g sugar | The richest bottle carries the most of both. Tamari provides the salinity, so this one is gluten free by choice of ingredient. Vegan, 0.0% ABV.
```

---

## The sets

**These do not need benefits copy.** Each set's contents were already written in
its Shopify description and the PDP simply never printed them; that is fixed in
the theme rather than by writing anything new.

If you want a `custom.benefits` on the sets later, the useful shape is a line
per bottle — which is exactly what The Everyday Set already does, and it is the
only set page that has ever looked finished.

For reference, what each set holds:

| Set | Contents | Price |
|---|---|---|
| The Everyday Set | NON1, NON3, NON7 | $90 |
| The Spring Set | NON1, NON3, NON5 | $90 |
| The Spice Set | NON2, NON3, NON7 | $90 |
| The Stopper Set | NON1, NON3, NON7 + Stopper | $150 |
| Mixed 6 Pack | NON1, NON2, NON3, NON5, NON7 + one more | $150, was $180 |
| Mixed 6 Stopper Pack | as above + Stopper | $180, was $240 |

## Two things to check before pasting

**The caffeine figure on NON7.** 37mg per bottle comes from the Somm's own
answer, not from the PDP. It is the one number here I have not seen on a page,
and it is a health-adjacent claim, so confirm it against the spec sheet.

**"The fullest bottle NON makes" on NON9** is a superlative rather than a
description. True against the six on the site today; it dates the moment a
tenth bottle arrives.
