#!/usr/bin/env python3
"""Find user-facing copy in sections that is NOT backed by a setting.

Every string a merchant can read on the page should be reachable from the
theme editor. Anything this reports is text only a developer can change.
"""
import json, re, os
from glob import glob

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

total = sum(len(f) for _, f, _ in rows)
print(f"{total} hardcoded string(s) across {len(rows)} section(s)\n")
for path, found, n in rows:
    print(f"{path}  ({n} settings)")
    for t in found[:12]:
        print(f"    {t[:96]}")
    if len(found) > 12:
        print(f"    … and {len(found)-12} more")
    print()
