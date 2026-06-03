#!/usr/bin/env python3
import pathlib
import sys

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/app/frontend/dist/index.html")
suffix = sys.argv[2] if len(sys.argv) > 2 else "cffix3"
text = path.read_text(encoding="utf-8")
for name in ("polyfills-legacy-dGFuDj3Q.js", "index-legacy-Drl6ocFW.js"):
    text = text.replace(f"{name}", f"{name}?b={suffix}")
path.write_text(text, encoding="utf-8")
print(path)
print(text[-400:])
