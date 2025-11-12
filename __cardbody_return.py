import pathlib
import re

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
lines = match.group(1).splitlines()
start = None
for idx, line in enumerate(lines):
    if 'return (<div className="p-3 space-y-4"' in line:
        start = idx
        break
if start is None:
    raise SystemExit('return block not found')
for offset in range(0, 80):
    i = start + offset
    print(f"{i+1:4}: {lines[i]}")
