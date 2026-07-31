#!/usr/bin/env python3
"""
Structural checks for the theme. No dependencies, no network, ~instant.

Catches the class of mistake that Shopify reports badly or not at all — a
section whose schema fails validation simply stops existing, and the error you
get is "not a valid section type" on a completely different file.

Everything here is something that has actually broken this theme:

  1. `render` inside a {% liquid %} tag. It is a standalone tag. Used inside a
     liquid block it takes the whole template down — this is what made every
     product-bearing page 404 while the 404 page rendered fine.
  2. Decimal range settings. Shopify computes (max - min) / step and requires a
     whole number; decimals fail on floating point, e.g. (0.9-0.2)/0.05 =
     14.000000000000002, and the section silently ceases to exist.
  3. Unbalanced Liquid tags.
  4. Template JSON referencing a section, setting or block that does not exist.
  5. Range values in templates outside the schema's min/max.
  6. asset_url references to files that are not in assets/.

Run:  python3 scripts/check.py
Exit: 0 clean, 1 problems found.
"""

import json
import os
import re
import sys
from glob import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

issues = []

BLOCK = {
    "if": "endif", "unless": "endunless", "for": "endfor", "case": "endcase",
    "form": "endform", "schema": "endschema", "comment": "endcomment",
    "capture": "endcapture", "paginate": "endpaginate", "style": "endstyle",
    "javascript": "endjavascript", "liquid": None,
}

liquid_files = glob("**/*.liquid", recursive=True)


def schema_of(path):
    m = re.search(r"\{%\s*schema\s*%\}(.*?)\{%\s*endschema\s*%\}", open(path).read(), re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception as e:
        issues.append(f"{path}: schema is not valid JSON — {e}")
        return None


# 1. render / include / section inside {% liquid %}
for path in liquid_files:
    src = open(path).read()
    for m in re.finditer(r"\{%-?\s*liquid\b(.*?)-?%\}", src, re.S):
        if re.search(r"^\s*(render|include|section)\b", m.group(1), re.M):
            line = src[: m.start()].count("\n") + 1
            issues.append(
                f"{path}:{line}: `render` inside a {{% liquid %}} tag — "
                f"it is standalone-only and breaks the whole template"
            )

# 3. tag balance
for path in liquid_files:
    src = open(path).read()
    stack = []
    for m in re.finditer(r"\{%-?\s*(\w+)", src):
        tag = m.group(1)
        if tag in BLOCK and BLOCK[tag]:
            stack.append((tag, m.start()))
        elif tag.startswith("end"):
            if not stack:
                issues.append(f"{path}: stray {tag}")
                continue
            opened, _ = stack.pop()
            if BLOCK.get(opened) != tag:
                issues.append(f"{path}: {opened} closed by {tag}")
    for tag, pos in stack:
        issues.append(f"{path}:{src[:pos].count(chr(10)) + 1}: unclosed {tag}")

# 2. range settings must divide evenly and default in range
for path in glob("sections/*.liquid"):
    schema = schema_of(path)
    if not schema:
        continue

    def check_ranges(settings, where):
        for st in settings or []:
            if st.get("type") != "range":
                continue
            lo, hi, step = st.get("min"), st.get("max"), st.get("step", 1)
            if lo is None or hi is None:
                issues.append(f"{path}: range {st.get('id')} missing min/max")
                continue
            steps = (hi - lo) / step
            if abs(steps - round(steps)) > 1e-9:
                issues.append(
                    f"{path}: range {st.get('id')} — ({hi} - {lo}) / {step} = {steps!r}, "
                    f"not a whole number. Shopify will reject the schema and the "
                    f"section will stop existing. Use whole numbers."
                )
            if round(steps) > 101:
                issues.append(f"{path}: range {st.get('id')} has {round(steps)} steps (max 101)")
            d = st.get("default")
            if d is not None and not (lo <= d <= hi):
                issues.append(f"{path}: range {st.get('id')} default {d} outside {lo}-{hi}")

    check_ranges(schema.get("settings"), "section")
    for b in schema.get("blocks", []):
        check_ranges(b.get("settings"), f"block {b.get('type')}")

# 4 + 5. templates reference real sections, settings, blocks and in-range values
section_names = {os.path.splitext(os.path.basename(p))[0] for p in glob("sections/*.liquid")}

for path in glob("templates/*.json") + glob("sections/*-group.json"):
    try:
        data = json.load(open(path))
    except Exception as e:
        issues.append(f"{path}: invalid JSON — {e}")
        continue

    for key, sec in (data.get("sections") or {}).items():
        stype = sec.get("type")
        if stype not in section_names:
            issues.append(f"{path}: section '{stype}' has no sections/{stype}.liquid")
            continue

        schema = schema_of(f"sections/{stype}.liquid")
        if not schema:
            continue

        ids = {s.get("id") for s in schema.get("settings", [])}
        ranges = {s["id"]: s for s in schema.get("settings", []) if s.get("type") == "range"}
        allowed = {b["type"] for b in schema.get("blocks", [])}

        for k, v in (sec.get("settings") or {}).items():
            if ids and k not in ids:
                issues.append(f"{path}: setting '{k}' not in {stype} schema")
            if k in ranges and isinstance(v, (int, float)):
                r = ranges[k]
                if not (r["min"] <= v <= r["max"]):
                    issues.append(f"{path}: {k}={v} outside {r['min']}-{r['max']}")

        for bid, blk in (sec.get("blocks") or {}).items():
            if allowed and blk.get("type") not in allowed:
                issues.append(f"{path}: block '{blk.get('type')}' not in {stype} schema")

# 6. asset_url targets exist
assets = set(glob("assets/*"))
for path in liquid_files:
    for m in re.finditer(r"'([\w.\-]+\.(?:css|js|svg|png|jpg|webp))'\s*\|\s*asset_url", open(path).read()):
        if "assets/" + m.group(1) not in assets:
            issues.append(f"{path}: asset_url references missing assets/{m.group(1)}")

if issues:
    print(f"{len(issues)} problem(s):\n")
    for i in issues:
        print("  " + i)
    sys.exit(1)

print(f"clean — {len(liquid_files)} liquid files, {len(glob('templates/*.json'))} templates")
sys.exit(0)
