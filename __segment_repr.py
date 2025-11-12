import pathlib, re
html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
script = match.group(1)
segment = script.split('function CanvasCard', 1)[0]
print(repr(segment[-200:]))
