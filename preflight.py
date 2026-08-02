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

if errors:
    print("PREFLIGHT FAILED — Shopify would reject these silently:\n")
    for e in errors:
        print("  ✗", e)
    sys.exit(1)
print("preflight OK")
