import pathlib
import re
import requests
from py_mini_racer import py_mini_racer

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
if not match:
    raise SystemExit("script block not found")
script_content = match.group(1)

ctx = py_mini_racer.MiniRacer()
babel_js = requests.get("https://unpkg.com/@babel/standalone@7.26.0/babel.min.js", timeout=30).text
ctx.eval(babel_js)
try:
    ctx.call("Babel.transform", script_content, {"presets": ["env", "react"]})
    print("Babel transform succeeded")
except py_mini_racer.JSEvalException as exc:
    print("Babel transform failed:")
    print(exc)
