import pathlib
import re

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
script = match.group(1)
start = script.find('function CanvasPane')
end = script.find('function CanvasCard')
subset = script[start:end]
for idx, line in enumerate(subset.splitlines(), start=1):
    if '//' in line and '<' in line:
        print(idx, line.strip())
