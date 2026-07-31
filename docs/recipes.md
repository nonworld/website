# Pairing recipes

The reverse pairing flow — bottle → dish — reads from the `non_recipe`
metaobject rather than from section settings. Thirty recipes is far more copy
than a schema should carry, and it belongs to merchandising, not the theme.

This follows the pattern the store already uses for `non_review`.

## The grid

Six bottles × five occasions = 30 entries, all loaded and active.

| | Weeknight | Sunday | Show off | Aperitivo | Cheese & dessert |
|---|---|---|---|---|---|
| **NON1** | Raw kingfish | Whole roast fish | Oysters three ways | Radish & cultured butter | Goat curd, stone fruit |
| **NON2** | Buttered leeks | Roast chicken, butter sauce | Mushroom kombu risotto | Grilled sardines | Comté, roasted pear |
| **NON3** | Miso mushrooms | Roast chicken, orange | Miso-glazed eggplant | Antipasti, blood orange | Burnt orange tart |
| **NON5** | Green mango salad | Slow lamb, chickpeas | Fish in banana leaf | Salt & vinegar chips | Hibiscus rhubarb |
| **NON7** | Coffee butter mushrooms | Slow lamb, cherry | Coffee-rubbed short rib | Charcuterie, pickled cherry | Dark chocolate cremoso |
| **NON9** | Steak sandwich | Beef ragù | Rib eye, bone marrow | Bresaola, roast beetroot | Washed rind, quince |

Handles are `<bottle>-<occasion>`, e.g. `non9-showoff`.

## Fields

| Key | Type | Notes |
|---|---|---|
| `bottle` | product_reference | required |
| `effort` | single line text | `fast`, `sunday`, `showoff`, `aperitivo`, `sweet` |
| `title` | single line text | required, and the display name |
| `meta` | single line text | "25 minutes · one pan · serves 2" |
| `intro` | multi-line text | |
| `steps` | list.single_line_text | one line per step, in order |
| `ingredients` | list.single_line_text | `Ingredient — quantity`, em dash separated |
| `why` | multi-line text | why the pairing works |
| `image` | file_reference | **not set on any entry yet** |

## Editing

Shopify admin → Content → Metaobjects → NON pairing recipe. The nine recipes
from the original design are carried over verbatim; the other twenty-one are
new, written against each bottle's actual ingredient list and process.

## Still to do

- **No images.** All thirty have an empty `image` field, so the recipe panel
  renders without a photo. Assign one per entry.
- The three original NON1/NON3/NON5 photos in the design pointed at the live
  CDN; they exist as Shopify files and can be attached directly.

## Reloading

`docs/recipes.seed.json` holds the nine originals as extracted from the design
export, for reference. The full thirty live in Shopify and that is the source
of truth — do not re-run a bulk load without deleting first, or you will get
duplicate handles.
