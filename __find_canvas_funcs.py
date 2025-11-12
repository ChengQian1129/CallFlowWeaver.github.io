import pathlib
import re

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
lines = match.group(1).splitlines()
for idx, line in enumerate(lines, start=1):
    if 'function ' in line and 'Canvas' in line:
        print(f"{idx}: {line.strip()}")
