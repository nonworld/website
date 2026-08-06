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

# 3c. a whitespace-stripping tag directly after a VALUELESS attribute.
#
#     `{%- comment -%}` strips the whitespace before it, INCLUDING the newline
#     that was separating two attributes. After a quoted value that is
#     harmless — the closing quote separates the tokens by itself. After a
#     valueless attribute the two names weld into one:
#
#         data-non-lotto-close
#         {%- comment -%} … {%- endcomment -%}
#         data-done-label="Done"
#
#     renders as `data-non-lotto-closedata-done-label="Done"`, so
#     `data-non-lotto-close` is not on the element at all.
#
#     That shipped. It was the only way out of the lotto modal on a phone,
#     which has no Escape key, and it survived one repair because the symptom —
#     one control working, its twin not — reads as a JavaScript binding fault.
#     The handler was correct the whole time and looking for an attribute the
#     page never had. A grep afterwards found the same mistake in
#     pairing-tool.liquid, where the welded attribute is `shopify_attributes`:
#     empty on the storefront, non-empty in the theme editor, so those chips
#     were dead in the editor and alive on the live page.
#
#     Nothing about the rendered HTML looks wrong in a diff, so a human is not
#     going to catch this one. Put the comment outside the tag.
WELD = re.compile(
    r'(?<![-\w=."\'])\b([a-zA-Z][\w-]*)\s*\n\s*\{%-\s*(comment|if|unless|liquid|for)\b')

#     SELF-TEST. The two shapes this has already shipped, kept as fixtures so
#     the pattern cannot be loosened later without something failing loudly.
#     Both are real: the first is the lotto's close control, the second is the
#     pairing tool's dish chips.
_WELD_MUST_CATCH = [
    ('non-lotto',
     '<button\n  data-non-lotto-close\n  {%- comment -%} x {%- endcomment -%}\n'
     '  data-done-label="Done">'),
    ('pairing-tool',
     '<button\n  data-non-somm-seed\n  {%- comment -%} x {%- endcomment -%}\n'
     '  {{ block.shopify_attributes }}>'),
]
#     And a shape it must NOT flag: after a quoted value the closing quote
#     separates the tokens by itself, so the tag is safe there.
_WELD_MUST_IGNORE = (
    '<button\n  data-answer="x"\n  {%- comment -%} y {%- endcomment -%}\n'
    '  data-short="z">')
for _name, _fixture in _WELD_MUST_CATCH:
    if not WELD.search(_fixture):
        errors.append(
            f"preflight.py check 3c no longer catches the {_name} shape it was "
            f"written for — the pattern has been weakened")
if WELD.search(_WELD_MUST_IGNORE):
    errors.append(
        "preflight.py check 3c now flags a tag after a QUOTED attribute value, "
        "which is safe — the pattern has been over-widened")
for f in liquid_files():
    s = f.read_text(encoding='utf-8')
    for m in WELD.finditer(s):
        # Only inside an open tag: find the last unclosed '<' before the match.
        before = s[:m.start()]
        lt, gt = before.rfind('<'), before.rfind('>')
        if lt <= gt:
            continue
        ln = before.count('\n') + 1
        errors.append(
            f"{f.relative_to(root)}:{ln}: attribute '{m.group(1)}' has no value and is "
            f"immediately followed by a whitespace-stripping {{%- {m.group(2)} — they will "
            f"render welded into one attribute name. Move the tag outside the element. "
            f"See preflight.py check 3c")

# 3d. HTML container balance in sections and snippets.
#
#     Removing a block of markup is easy to get one tag wrong, and Liquid will
#     not complain: the file renders, Shopify accepts it, and the browser
#     silently re-parents everything after the orphan.
#
#     That shipped. Cutting the hero's inline Somm left one extra </div>, which
#     closed .non-hero early — so the hero photograph fell OUT of the hero and
#     landed between two sections, and the hero measured 515px instead of 673.
#     Nothing errored. It was found by measuring the deployed page, which is a
#     poor substitute for a check that takes a millisecond.
#
#     SECTIONS ONLY. A section is a self-contained unit that Shopify renders
#     on its own, so its containers must balance. A SNIPPET need not: the four
#     process-anim snippets are one DOM tree deliberately split across four
#     files to stay under the size at which Shopify started rejecting them, and
#     each is unbalanced by design. Checking those would produce three
#     permanent failures, which is how a gate gets switched off.
#
#     Counted with comments, scripts, styles and the schema stripped, and the
#     whole file skipped when a container tag shares a line with a Liquid
#     conditional — opening a div in an {% if %} and closing it in the
#     {% else %} is legitimate and this cannot reason about it. Silent beats
#     wrong.
CONTAINERS = ('div', 'section', 'article', 'aside', 'form', 'ul', 'ol', 'li',
              'button', 'a', 'span', 'p')
for f in sorted((root / 'sections').glob('*.liquid')):
    s = f.read_text(encoding='utf-8')
    s = re.sub(r'\{%-?\s*comment\s*-?%\}.*?\{%-?\s*endcomment\s*-?%\}', ' ', s, flags=re.S)
    s = re.sub(r'\{%-?\s*schema\s*-?%\}.*?\{%-?\s*endschema\s*-?%\}', ' ', s, flags=re.S)
    s = re.sub(r'<script\b.*?</script>', ' ', s, flags=re.S)
    s = re.sub(r'<style\b.*?</style>', ' ', s, flags=re.S)

    # Only the tags that are unconditionally present. A container opened or
    # closed on a line carrying a Liquid conditional is skipped, along with the
    # whole file if any are found — being silent beats being wrong here.
    lines = s.split('\n')
    conditional = any(
        re.search(r'\{%-?\s*(if|unless|else|elsif|for|case|when)\b', ln)
        and re.search(r'</?(?:' + '|'.join(CONTAINERS) + r')\b', ln)
        for ln in lines)
    if conditional:
        continue

    for tag in ('div', 'section'):
        o = len(re.findall(r'<' + tag + r'[\s>]', s))
        c = len(re.findall(r'</' + tag + r'>', s))
        if o != c:
            errors.append(
                f"{f.relative_to(root)}: <{tag}> unbalanced ({o} open, {c} close). "
                f"An orphan closing tag re-parents everything after it and Liquid "
                f"will not complain. See preflight.py check 3d")

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
#    Widened twice, each time by something that got past it:
#
#    `margin: 4px auto 20px` — the shorthand sets margin-left and margin-right
#    just as surely as the longhands do, and an `auto` in the second slot is
#    the classic centring idiom. The old pattern only looked for longhand
#    property names, so the one declaration in the file that actively centred
#    the orb was invisible to the check written to find exactly that.
#
#    `align-self` / `align-items` — the orb's containers are column flex, so
#    the horizontal axis is the CROSS axis and alignment there is owned by
#    align-*, not by margins or justify-*. A stray align-self on the orb
#    outside the owner block would move it horizontally while every property
#    this check knew about stayed at zero, which is precisely the "it moved
#    again and nothing explains it" failure the owner block exists to end.
#    Widened a third time, and this one is the point: EVERY property that can
#    move the orb, not the subset that had bitten us so far. Margins were
#    guarded while grid-column, grid-row and align-self sat in other blocks
#    seven hundred lines away — which is how "it moved again and nothing
#    explains it" stayed true even with a check watching the file.
PULL = re.compile(
    r'(?<![-\w])(margin[-a-z]*|align-self|justify-self|place-self'
    r'|grid-column[-a-z]*|grid-row[-a-z]*|grid-area|order'
    r'|position|top|right|bottom|left|inset[-a-z]*|transform|translate)\s*:',
    re.I)
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
            # ONLY the owner block is exempt — not "everything after it".
            # Appending a rule to the end of the file used to bypass this
            # check entirely, which is a hole wide enough to drive the
            # original bug back through.
            owner_end = text.find('\n}', owner_at)
            owner_end = text.find('*/', owner_at) if owner_end == -1 else owner_end
            if owner_at < m.start(2) < text.find('/* MOBILE ORB', owner_at):
                continue  # inside the owner block's own rules
            # Comments are prose, not declarations. Explaining in a comment WHY
            # align-self lives in the owner block used to trip this check, so
            # the guard punished the documentation that made it understandable.
            body = re.sub(r'/\*.*?\*/', ' ', body, flags=re.S)
            # group(1) is the longhand branch, group(2) the `margin: … auto`
            # shorthand branch; exactly one of the two matches per hit.
            hits = sorted(set(
                (h.group(1) or h.group(2) + ' (shorthand, with auto)').lower()
                for h in PULL.finditer(body)))
            if hits:
                line = text[:m.start(2)].count('\n') + 1
                errors.append(
                    f"assets/theme.css:{line}: sets {', '.join(hits)} on the orb "
                    f"outside its owner block — move it into '{OWNER}'")

# 6b. The somm grid declares its columns ONCE.
#
#     Same failure as check 6, one section further down the same file, and I
#     wrote it: two blocks ninety lines apart both set grid-template-columns on
#     .non-somm. The later one won silently, so moving every child into column
#     1 crammed the whole component into a 96px orb track — a 38px input and
#     chips stacked one word wide, on every page and in every language.
#
#     A duplicate here is never intentional, so the rule is simply "one".
somm_cols = [
    (text[:m.start()].count('\n') + 1)
    for m in re.finditer(r'([^{}]*)\{([^{}]*grid-template-columns[^{}]*)\}', text)
    # `.non-somm` as a whole class, not as a substring. .non-somm-entry is a
    # DIFFERENT component — the hero's orb-and-field block — and it legitimately
    # declares its own columns. Matching loosely made this check fire on it and
    # would have pushed someone to work around the guard rather than fix a real
    # duplicate, which is how a check stops being trusted.
    if re.search(r'\.non-somm(?![-\w])', ' '.join(m.group(1).split()))
] if css.exists() else []
if len(somm_cols) > 1:
    errors.append(
        "assets/theme.css: grid-template-columns declared on .non-somm "
        f"{len(somm_cols)} times (lines {', '.join(map(str, somm_cols))}) — "
        "the later one wins silently; declare columns once. See check 6b")

# 7. EDITABILITY — copy a merchant cannot reach from the theme editor.
#
#    Not a Shopify rejection mode either. It is here because "can Josh change
#    this without a developer" is a question that only stays answered if
#    something asks it on every push. Thirty-seven strings had drifted out of
#    reach before anyone looked, and the largest cluster was the labels on the
#    two enquiry forms — the copy most likely to be argued about.
#
#    Delegated to scripts/editable_audit.py rather than reimplemented, so the
#    report a human reads and the gate a push passes are the same code and
#    cannot disagree. It fails only on strings not in that file's ACCEPTED
#    baseline, which holds CSS property names, metaobject types and hints shown
#    only inside the editor.
audit = root / 'scripts' / 'editable_audit.py'
if audit.exists():
    import subprocess
    r = subprocess.run([sys.executable, str(audit), '--check'],
                       capture_output=True, text=True, cwd=str(root))
    if r.returncode != 0:
        for line in (r.stdout or '').strip().splitlines():
            line = line.strip()
            if line.startswith('✗'):
                errors.append(line[1:].strip() + "  — see preflight.py check 7")

if errors:
    print("PREFLIGHT FAILED — Shopify would reject these silently:\n")
    for e in errors:
        print("  ✗", e)
    sys.exit(1)
print("preflight OK")
