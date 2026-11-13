#!/usr/bin/env python3
"""Assemble src/ into ONE self-contained ai-control-disney-v3.html.

    python3 build.py            # build
    python3 build.py --check    # build, then fail if any external resource slipped in

src/manifest.txt lists css/*.css and js/*.js in load order (one per line, '#'
comments allowed). CSS is inlined at the /*@CSS*/ marker of src/shell.html,
JS at /*@JS*/ (placed in <body>; each module becomes its own <script>).
Python stdlib only.
"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE / "ai-control-disney-v3.html"

# Anything that would make the page reach outside itself.
EXTERNAL = re.compile(
    r"""(<script[^>]+src=|<link[^>]+href=|@import|url\(\s*['"]?(?:https?:)?//|src=["'](?:https?:)?//)""",
    re.I,
)


def read_manifest():
    files = []
    for raw in (SRC / "manifest.txt").read_text().splitlines():
        line = raw.split("#", 1)[0].strip()
        if line:
            files.append(line)
    return files


def build():
    shell = (SRC / "shell.html").read_text()
    css, js = [], []
    for rel in read_manifest():
        path = SRC / rel
        if not path.exists():
            sys.exit(f"build.py: manifest lists missing file {rel}")
        body = path.read_text()
        banner = f"/* ==== {rel} ==== */\n"
        if rel.endswith(".css"):
            css.append(banner + body)
        elif rel.endswith(".js"):
            # one <script> per module: a syntax error stays contained in its module
            # (top-level const/let are still shared across classic scripts)
            js.append(f'<script data-module="{rel}">\n"use strict";\n{body}\n</script>')
        else:
            sys.exit(f"build.py: unknown file type {rel}")
    for marker in ("/*@CSS*/", "/*@JS*/"):
        if marker not in shell:
            sys.exit(f"build.py: shell.html is missing {marker}")
    html = shell.replace("/*@CSS*/", "\n".join(css)).replace("/*@JS*/", "\n".join(js))
    OUT.write_text(html)
    return html


def main():
    html = build()
    hits = EXTERNAL.findall(html)
    print(f"built {OUT.name}: {len(html)//1024} KB from {len(read_manifest())} modules")
    if hits:
        print("external resource references found:", hits)
        if "--check" in sys.argv:
            sys.exit(1)


if __name__ == "__main__":
    main()
