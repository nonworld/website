#!/usr/bin/env python3
"""
Preflight — catch what Shopify rejects SILENTLY.

Four deploys on 2026-08-02 were rejected by Shopify while git reported a clean
push, and every one was found only by byte-comparing against the live theme:

  1. a trailing comma in an image_tag filter        (froze a file for 12 hours)
  2. {{ }} nested inside a filter argument          (rejected the file + index.json)
  3. template settings with no matching schema id   (rejected index.json)
  4. unbalanced CSS braces                          (invalidates the stylesheet)

Exits non-zero on any of them. Run before every push.
"""
import json, re, sys, pathlib

root = pathlib.Path(__file__).parent
errors = []

def liquid_files():
    for d in ('sections', 'snippets', 'layout', 'templates'):
        yield from (root / d).rglob('*.liquid')

# 1. nested output tags — {{ ... {{ ... }} ... }} is a hard syntax error
for f in liquid_files():
    s = f.read_text(encoding='utf-8')
    for m in re.finditer(r'\{\{(.*?)\}\}', s, re.S):
        if '{{' in m.group(1) or '{%' in m.group(1):
            errors.append(f"{f.relative_to(root)}: nested tag inside an output tag -> {m.group(0)[:70]!r}")

# 2. trailing comma before a closing filter/tag
for f in liquid_files():
    s = f.read_text(encoding='utf-8')
    for m in re.finditer(r',\s*\}\}', s):
        ln = s[:m.start()].count('\n') + 1
        errors.append(f"{f.relative_to(root)}:{ln}: trailing comma before }}}}")

# 3. schema JSON must parse, and raw/comment/tag pairs must balance
for f in liquid_files():
    s = f.read_text(encoding='utf-8')
    m = re.search(r'\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}', s, re.S)
    if m:
        try:
            json.loads(m.group(1))
        except Exception as e:
            errors.append(f"{f.relative_to(root)}: schema is not valid JSON -> {e}")
    for tag in ('raw', 'comment', 'if', 'for', 'capture', 'schema'):
        o = len(re.findall(r'\{%-?\s*' + tag + r'[\s%]', s))
        c = len(re.findall(r'\{%-?\s*end' + tag + r'\s*-?%\}', s))
        if o != c:
            errors.append(f"{f.relative_to(root)}: {tag}/end{tag} unbalanced ({o} vs {c})")

# 3b. a setting default must never be an empty string.
#     Shopify rejects the WHOLE file with "default can't be blank", which is
#     what silently blocked process-animation.liquid for a full day. Omit the
#     key instead of setting it to "".
for f in liquid_files():
    s = f.read_text(encoding='utf-8')
    m = re.search(r'\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}', s, re.S)
    if not m:
        continue
    try:
        d = json.loads(m.group(1))
    except Exception:
        continue
    groups = [d.get('settings') or []]
    for b in d.get('blocks', []):
        groups.append(b.get('settings') or [])
    for g in groups:
        for x in g:
            if x.get('default') != '' or 'default' not in x:
                continue
            t = x.get('type')
            # A select may legitimately default to "" when "" is one of its
            # option values — that is how "Theme default" is expressed. Only
            # free-text types are rejected outright.
            if t == 'select':
                if any(o.get('value') == '' for o in x.get('options', [])):
                    continue
            elif t not in ('text', 'textarea', 'html', 'liquid', 'url', 'video_url'):
                continue
            errors.append(f"{f.relative_to(root)}: {t} setting '{x.get('id')}' has an empty default; omit the key")

# 4. every template setting id must exist in the section's schema
schemas = {}
for f in (root / 'sections').glob('*.liquid'):
    m = re.search(r'\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}', f.read_text(encoding='utf-8'), re.S)
    if not m:
        continue
    try:
        d = json.loads(m.group(1))
    except Exception:
        continue
    ids = {x.get('id') for x in d.get('settings', []) if x.get('id')}
    bids = set()
    for b in d.get('blocks', []):
        bids |= {x.get('id') for x in b.get('settings', []) if x.get('id')}
    schemas[f.stem] = (ids, bids)

for f in (root / 'templates').rglob('*.json'):
    raw = re.sub(r'/\*.*?\*/', '', f.read_text(encoding='utf-8'), flags=re.S)
    try:
        d = json.loads(raw)
    except Exception as e:
        errors.append(f"{f.relative_to(root)}: not valid JSON -> {e}")
        continue
    for key, sec in (d.get('sections') or {}).items():
        t = sec.get('type')
        if t not in schemas:
            continue
        ids, bids = schemas[t]
        for sid in (sec.get('settings') or {}):
            if sid not in ids:
                errors.append(f"{f.relative_to(root)}: section '{key}' sets '{sid}', absent from {t} schema")
        for bk, bv in (sec.get('blocks') or {}).items():
            for sid in (bv.get('settings') or {}):
                if sid not in bids:
                    errors.append(f"{f.relative_to(root)}: block '{bk}' sets '{sid}', absent from {t} blocks")

# 5. CSS brace + comment balance
for f in (root / 'assets').glob('*.css'):
    s = f.read_text(encoding='utf-8')
    if s.count('{') != s.count('}'):
        errors.append(f"{f.relative_to(root)}: braces unbalanced ({s.count('{')} vs {s.count('}')})")
    if s.count('/*') != s.count('*/'):
        errors.append(f"{f.relative_to(root)}: comments unbalanced")

# 6. The orb has ONE owner.
#
#    This is not a Shopify rejection mode. It is here because the orb has been
#    broken and re-broken more than anything else in this theme: its position
#    was set in ten separate blocks across sixteen hundred lines, two of which
#    each claimed in a comment to be the last word, and the later one silently
#    won. The fix was to give it a single owner block at the end of the file.
#
#    This check keeps it that way. Any rule that targets the orb pseudo-element
#    and sets a position property must be inside the owner block, which is
#    marked by the OWNER sentinel below. Move the declaration into that block
#    rather than deleting this check.
#    Scoped to the HORIZONTAL PULL properties specifically. Those are what the
#    competing blocks fought over — margin-left, margin-right, margin-inline —
#    and what put the orb 116px off-screen on mobile and 24px out on the home
#    page. The orb's size, colour, animation and grid placement are still free
#    to live wherever they read best; only "how far left or right is it" is
#    owned by one block.
OWNER = 'THE ORB — single owner'
PULL = re.compile(r'(?<![-\w])(margin-left|margin-right|margin-inline(?:-start|-end)?)\s*:', re.I)
css = root / 'assets' / 'theme.css'
if css.exists():
    text = css.read_text(encoding='utf-8')
    owner_at = text.find(OWNER)
    if owner_at == -1:
        errors.append("assets/theme.css: the orb owner block is gone — see preflight.py check 6")
    else:
        for m in re.finditer(r'([^{}]*)\{([^{}]*)\}', text):
            sel, body = m.group(1), m.group(2)
            if '.non-somm::before' not in sel and '.non-sommbox::before' not in sel:
                continue
            # Compare at the declaration body, not the selector: a rule's match
            # starts at the previous rule's closing brace, so the owner rule
            # would otherwise appear to start before its own comment header.
            if m.start(2) > owner_at:
                continue  # the owner block itself, and anything after it
            hits = sorted(set(h.group(1).lower() for h in PULL.finditer(body)))
            if hits:
                line = text[:m.start(2)].count('\n') + 1
                errors.append(
                    f"assets/theme.css:{line}: sets {', '.join(hits)} on the orb "
                    f"outside its owner block — move it into '{OWNER}'")

if errors:
    print("PREFLIGHT FAILED — Shopify would reject these silently:\n")
    for e in errors:
        print("  ✗", e)
    sys.exit(1)
print("preflight OK")
