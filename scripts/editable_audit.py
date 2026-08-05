#!/usr/bin/env python3
"""Find user-facing copy in sections that is NOT backed by a setting.

Every string a merchant can read on the page should be reachable from the
theme editor. Anything this reports is text only a developer can change.

Run bare, it prints a report. Run with --check it exits non-zero on anything
NOT in ACCEPTED below, which is what preflight uses: a report nobody has to
remember to read.

The accepted list is a baseline, not an amnesty. Each entry is there because it
is not copy — a CSS custom property name, a metaobject type, a hint shown only
to a merchant inside the editor when a section is misconfigured. Adding to it
should feel like a decision. Anything genuinely customer-facing belongs in a
setting instead, and the whole point of the exit code is that a new one cannot
slip in unnoticed.
"""
import json, re, os, sys
from glob import glob

# Known non-copy, verified 2026-08-04. Matched exactly against the reported
# string, so a near-miss surfaces rather than being swallowed by a prefix.
ACCEPTED = {
    "sections/featured-collection.liquid": {
        "Pick a collection for this section in the theme editor.",
    },
    "sections/logo-marquee.liquid": {"--logo-scale:"},
    # A CSS custom property carrying a per-product placeholder URL, captured in
    # Liquid because a stylesheet cannot know the product. Not copy.
    "sections/main-product.liquid": {"--non-ph: url("},
    "sections/pairing-recipes.liquid": {
        "metaobject entries — see docs/recipes.md.",
        "No recipes yet. Create",
        "non_recipe",
    },
    "sections/product-perfect-for.liquid": {"captions", "images,"},
    "sections/product-picks.liquid": {
        "This block has no product, or the product is not published to the market being previewed.",
        "Check the block in the sidebar, and Markets catalog membership.",
    },
}

SCHEMA = re.compile(r"\{%\s*schema\s*%\}(.*?)\{%\s*endschema\s*%\}", re.S)
COMMENT = re.compile(r"\{%-?\s*comment\s*-?%\}.*?\{%-?\s*endcomment\s*-?%\}", re.S)
STYLE = re.compile(r"<(script|style)\b.*?</\1>", re.S)
TAG = re.compile(r"<[^>]+>", re.S)
LIQUID = re.compile(r"\{\{.*?\}\}|\{%.*?%\}", re.S)
ENTITY = re.compile(r"&[a-z]+;|&#\d+;")

# Copy that is structural rather than editorial.
IGNORE = {
    "loading", "loading…", "skip to content", "search", "close", "menu",
    "show more", "previous", "next", "yes", "no",
}

rows = []
for path in sorted(glob("sections/*.liquid")):
    src = open(path).read()

    m = SCHEMA.search(src)
    schema = {}
    try:
        schema = json.loads(m.group(1)) if m else {}
    except Exception:
        pass

    ids = set()
    for s in schema.get("settings", []) or []:
        if s.get("id"): ids.add(s["id"])
    for b in schema.get("blocks", []) or []:
        for s in b.get("settings", []) or []:
            if s.get("id"): ids.add(s["id"])

    body = src[: m.start()] if m else src
    body = COMMENT.sub(" ", body)
    body = STYLE.sub(" ", body)
    body = LIQUID.sub("\x00", body)   # settings render here; mark, don't keep
    body = TAG.sub("\n", body)
    body = ENTITY.sub(" ", body)

    found = []
    for chunk in body.split("\n"):
        for piece in chunk.split("\x00"):
            t = " ".join(piece.split())
            if len(t) < 4:                       continue
            if t.lower() in IGNORE:              continue
            if not re.search(r"[A-Za-z]{3}", t): continue
            if re.fullmatch(r"[\W\d]+", t):      continue
            found.append(t)

    if found:
        rows.append((path, sorted(set(found), key=len, reverse=True), len(ids)))

# What is new, i.e. not already accepted as non-copy.
unexpected = []
for path, found, n in rows:
    ok = ACCEPTED.get(path, set())
    for t in found:
        if t not in ok:
            unexpected.append((path, t))

if "--check" in sys.argv:
    if unexpected:
        print("EDITABILITY FAILED — copy a merchant cannot reach from the theme editor:\n")
        for path, t in unexpected:
            print(f"  ✗ {path}: {t[:110]}")
        print("\nAdd a setting for it, or — only if it is genuinely not copy —")
        print("add it to ACCEPTED in scripts/editable_audit.py with a reason.")
        sys.exit(1)
    print(f"editability OK ({sum(len(f) for _, f, _ in rows)} accepted non-copy strings)")
    sys.exit(0)

total = sum(len(f) for _, f, _ in rows)
print(f"{total} hardcoded string(s) across {len(rows)} section(s)")
print(f"{len(unexpected)} of them not yet accepted\n")
for path, found, n in rows:
    print(f"{path}  ({n} settings)")
    for t in found[:12]:
        flag = "  " if t in ACCEPTED.get(path, set()) else "NEW "
        print(f"    {flag}{t[:96]}")
    if len(found) > 12:
        print(f"    … and {len(found)-12} more")
    print()
