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


def load_jsonc(path):
    """
    Shopify writes JSON templates with a leading /* ... */ banner when the theme
    editor saves them, and those files are still valid to Shopify. Strip block
    comments before parsing rather than treating the editor's own output as
    broken.
    """
    raw = open(path).read()
    stripped = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    return json.loads(stripped)


def schema_of(path):
    m = re.search(r"\{%\s*schema\s*%\}(.*?)\{%\s*endschema\s*%\}", open(path).read(), re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception as e:
        issues.append(f"{path}: schema is not valid JSON — {e}")
        return None


# 0. merge conflict markers. This is not hypothetical: sync.sh rebases with
#    --autostash, and a conflict against a theme-editor commit left markers in
#    a snippet that then sailed through every other check and shipped.
CONFLICT = re.compile(r"^(<{7} |={7}$|>{7} )", re.M)
for path in glob("**/*.*", recursive=True):
    if path.startswith(("design-reference/", ".git/", "worker/somm/node_modules/")):
        continue
    if not path.endswith((".liquid", ".json", ".js", ".css", ".md", ".py", ".sh")):
        continue
    try:
        src = open(path, encoding="utf-8").read()
    except (UnicodeDecodeError, IsADirectoryError):
        continue
    m = CONFLICT.search(src)
    if m:
        issues.append(
            f"{path}:{src[:m.start()].count(chr(10)) + 1}: unresolved merge conflict marker"
        )

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

# 2b. a section schema may define `default` or `presets`, never both. Shopify
#     rejects the file outright — and because the GitHub integration reports
#     rejections only in the connection panel, the file simply never appears in
#     the theme and every template referencing it is rejected too.
for path in glob("sections/*.liquid"):
    schema = schema_of(path)
    if schema and "default" in schema and "presets" in schema:
        issues.append(
            f"{path}: schema defines both 'default' and 'presets' — Shopify "
            f"rejects the file, and every template using this section with it"
        )

# 2c. A brace inside a quoted string inside an output tag. Liquid's lexer does
#     not respect quoting when finding the end of a `{{ ... }}` tag, so
#     {{ x | default: '{}' }} is truncated mid-tag and Shopify rejects the
#     entire file with "Variable ... was not properly terminated". Bind the
#     value in a {% liquid %} block instead, where the terminator is %}.
def braces_in_output_strings(src):
    hits = []
    i = 0
    while True:
        i = src.find("{{", i)
        if i == -1:
            return hits
        end_tag = src.find("}}", i)
        if end_tag == -1:
            return hits
        body = src[i + 2 : end_tag + 2]
        for m in re.finditer(r"'([^']*)'|\"([^\"]*)\"", body):
            literal = m.group(1) if m.group(1) is not None else m.group(2)
            if "{" in literal or "}" in literal:
                hits.append(i)
                break
        i = end_tag + 2

for path in liquid_files:
    src = open(path).read()
    for pos in braces_in_output_strings(src):
        line = src[:pos].count("\n") + 1
        issues.append(
            f"{path}:{line}: brace inside a quoted string in an output tag — "
            f"Liquid truncates the tag there and Shopify rejects the whole file. "
            f"Assign it in a {{% liquid %}} block instead."
        )

# 2d. theme_info URLs must be http(s); Shopify rejects mailto: outright
if os.path.exists("config/settings_schema.json"):
    try:
        blocks = load_jsonc("config/settings_schema.json")
        info = blocks[0] if blocks and blocks[0].get("name") == "theme_info" else None
        for key in ("theme_documentation_url", "theme_support_url"):
            v = (info or {}).get(key)
            if v and not str(v).startswith(("http://", "https://")):
                issues.append(
                    f"config/settings_schema.json: {key} must be an HTTP or HTTPS URL, got {v!r}"
                )
    except Exception as e:
        issues.append(f"config/settings_schema.json: invalid JSON — {e}")

# 4 + 5. templates reference real sections, settings, blocks and in-range values
section_names = {os.path.splitext(os.path.basename(p))[0] for p in glob("sections/*.liquid")}

for path in glob("templates/*.json") + glob("sections/*-group.json"):
    try:
        data = load_jsonc(path)
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
