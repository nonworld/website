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
    # `raw` was missing, so every balanced {% raw %}…{% endraw %} reported as a
    # stray endraw and blocked the push — four untouched snippets failing the
    # guard is how a real failure gets waved through as "the usual noise".
    "raw": "endraw",
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

# 1b. a comment TAG inside {% liquid %}. Inside a liquid block, comments are
# '#' lines; a {% comment %} tag terminates the enclosing liquid tag at its own
# '%}' and everything after becomes stray markup. Shopify rejects the file and
# keeps serving the previous version, so the only symptom is a section that
# stops updating — sections/product-process.liquid sat frozen on the staging
# theme from 31 July through two later commits that both pushed cleanly.
#
# Matched from the OPENING tag rather than by parsing the block, because the
# block's extent cannot be trusted once this bug is present: a non-greedy match
# for the closing '-%}' stops at the comment tag and reports nothing wrong.
for path in liquid_files:
    src = open(path).read()
    for m in re.finditer(r"\{%-?\s*liquid\b", src):
        rest = src[m.end():]
        nxt_close = rest.find("%}")
        nxt_open = rest.find("{%")
        if nxt_open != -1 and nxt_close != -1 and nxt_open < nxt_close:
            line = src[: m.start()].count("\n") + 1
            tag = re.match(r"\{%-?\s*(\w+)", rest[nxt_open:])
            name = tag.group(1) if tag else "?"
            issues.append(
                f"{path}:{line}: `{{% {name} %}}` tag opened inside a "
                f"{{% liquid %}} block — use '#' comments there; a tag ends the "
                f"liquid tag early and Shopify silently rejects the file"
            )

# 1c. `for … in section.blocks` without a type filter, in a section that
# declares more than one block type. This has now caused three visible bugs:
# credential blocks rendering as venues on Stockists, reason blocks rendering as
# empty questions 04/05/06 on Pairing, and a `unless forloop.last` evaluated
# across all blocks emitting invalid JSON. Every one of them shipped, because a
# section with one block type is fine and the failure only appears once a second
# type is added later.
#
# `{% for b in section.blocks %}` with an inner `if b.type == '…'` is allowed —
# it is filtering, just verbosely — so the check looks for a type test anywhere
# inside the loop body before reporting.
for path in liquid_files:
    src = open(path).read()
    schema = schema_of(path)
    if not schema:
        continue
    if len(schema.get("blocks", [])) < 2:
        continue

    body = src.split("{% schema %}")[0]
    for m in re.finditer(r"\{%-?\s*for\s+(\w+)\s+in\s+section\.blocks\s*-?%\}", body):
        var = m.group(1)
        end = body.find("{% endfor", m.end())
        if end == -1:
            end = body.find("{%- endfor", m.end())
        inner = body[m.end(): end if end != -1 else len(body)]
        if re.search(rf"{var}\.type\s*==", inner):
            continue
        line = body[: m.start()].count("\n") + 1
        issues.append(
            f"{path}:{line}: `for {var} in section.blocks` with no type filter, "
            f"in a section declaring {len(schema['blocks'])} block types — "
            f"use `| where: 'type', '…'` or the loop will render every type"
        )

# 1d. `contains` chained with a comparison — `a contains b == false`.
#
# Liquid has no boolean negation of `contains`. Chaining `== false` (or
# `!= true`, or any comparison) onto it is a PARSE ERROR, and Shopify rejects
# the entire file for it without saying so, continuing to serve the previous
# version.
#
# This cost a full evening. `sections/pairing-recipes.liquid` was rewritten
# against the design and every push afterwards reported success while the
# 31 July build stayed live — because Shopify only validates on WRITE, so the
# offending line sat unnoticed inside an already-accepted file and only bit
# when that file was next pushed. Bisected down to a single line by pushing
# isolated probe sections and checking which ones Shopify accepted.
#
# snippets/non-code.liquid:22 already carried a comment warning about exactly
# this, written the first time it happened. A comment in one file does not stop
# it recurring in another; this rule does.
#
# Use nested `{% if %}` / `{% unless %}` instead.
#
# Comment blocks are blanked (not removed) before scanning, so the prose warning
# in non-code.liquid — and the one in pairing-recipes.liquid explaining the fix —
# do not report themselves. Blanking preserves newlines so line numbers stay
# true.
for path in liquid_files:
    src = open(path).read()
    body = src.split("{% schema %}")[0]
    body = re.sub(
        r"\{%-?\s*comment\s*-?%\}.*?\{%-?\s*endcomment\s*-?%\}",
        lambda m: re.sub(r"[^\n]", " ", m.group(0)),
        body,
        flags=re.S,
    )
    for m in re.finditer(r"contains\s+[\w.'\"\[\]]+\s*(==|!=)", body):
        line = body[: m.start()].count("\n") + 1
        issues.append(
            f"{path}:{line}: `contains … {m.group(1)} …` — Liquid cannot chain a "
            f"comparison onto `contains`. This is a parse error and Shopify will "
            f"reject the whole file silently. Use a nested `unless` instead"
        )

# 3. tag balance
#
# COMMENT BODIES ARE PROSE, NOT CODE.
#
# This scanned raw source, so a tag NAME written inside an explanatory comment
# was counted as a real opening tag. snippets/ask-form.liquid explains, in
# English, why it uses Shopify's own {% form %} and why a
# {% unless form.posted_successfully? %} on the wrapper does not work — and
# those two sentences were read as an unclosed form and an unclosed unless,
# which then unbalanced the comment stack behind them. Five failures, all of
# them documentation, and every one of them fired on a clean tree. `sync.sh`
# runs this check, so the repo's own deploy path had been unusable.
#
# The fix masks comment BODIES while keeping their delimiters, so:
#   - prose can name any tag it likes without being parsed as one
#   - comment/endcomment balance is still checked, because the tags survive
#   - byte offsets are preserved, so reported line numbers stay correct
#
# This is not a suppression: nothing is exempted, and a genuinely unclosed tag
# outside a comment still fails exactly as before. Verified by re-running with
# a deliberate unclosed {% if %} added to a file — still caught.
COMMENT_BLOCK = re.compile(
    r"(\{%-?\s*comment\s*-?%\})(.*?)(\{%-?\s*endcomment\s*-?%\})", re.S)


def mask_comment_bodies(text):
    """Blank the inside of every comment, keeping length and the delimiters."""
    return COMMENT_BLOCK.sub(
        lambda m: m.group(1) + re.sub(r"[^\n]", " ", m.group(2)) + m.group(3),
        text)


for path in liquid_files:
    src = mask_comment_bodies(open(path).read())
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

# 2bb. `url` settings must not carry a "default". Shopify rejects the whole
#      file, silently, and the theme keeps serving the previous version — so
#      the section looks like it simply ignored your rewrite. This cost a full
#      debugging session on sections/stockists.liquid: the live page kept
#      rendering an older block-based stockists list with "0 venues" and a dead
#      map, while the repo, the commit and the push were all correct.
for path in glob("sections/*.liquid") + glob("snippets/*.liquid"):
    schema = schema_of(path)
    if not schema:
        continue

    def check_urls(settings, where):
        for st in settings or []:
            if st.get("type") == "url" and "default" in st:
                issues.append(
                    f"{path}: {where} setting '{st.get('id')}' is type url and has a "
                    f"'default'. Shopify rejects url defaults and drops the entire "
                    f"file — the old version keeps serving. Default it in Liquid "
                    f"instead: assign x = section.settings.{st.get('id')} | default: '…'"
                )

    check_urls(schema.get("settings"), "section")
    for b in schema.get("blocks", []):
        check_urls(b.get("settings"), f"block {b.get('type')}")

# 2bc. A double quote inside an output tag. Liquid renders the tag, but the
#      quote lands in the middle of the surrounding HTML attribute and closes
#      it early, so the rest of the class list becomes stray attributes. Liquid
#      string literals accept single quotes, so there is never a reason for a
#      double quote inside {{ }}. Caught this in my own edit:
#        class="… non-grid--ratio-{{ x | default: "portrait" }}"
DQ_IN_OUTPUT = re.compile(r'\{\{[^}]*"[^}]*\}\}')
for path in glob("sections/*.liquid") + glob("snippets/*.liquid") + glob("layout/*.liquid"):
    for n, line in enumerate(open(path), 1):
        m = DQ_IN_OUTPUT.search(line)
        if m:
            issues.append(
                f"{path}:{n}: double quote inside an output tag — {m.group(0)[:70]}. "
                f"It will terminate the surrounding HTML attribute. Use single quotes."
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
