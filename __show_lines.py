import pathlib
import re

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
if not match:
    raise SystemExit("script block not found")
lines = match.group(1).splitlines()
start = 1585 - 10
end = 1585 + 10
for idx in range(start, end):
    print(f"{idx+1:4}: {lines[idx]}")
