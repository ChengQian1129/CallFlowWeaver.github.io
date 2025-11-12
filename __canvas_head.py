import pathlib
import re
import requests
from py_mini_racer import py_mini_racer

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
script = match.group(1)
start = script.find('function CanvasPane')
return_index = script.find('return (\n  <div className={(inBuild?\'col-span-7\':\'col-span-5\')')
canvas_pane_head = script[start:return_index]
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get("https://unpkg.com/@babel/standalone@7.26.0/babel.min.js", timeout=30).text)
try:
    ctx.call("Babel.transform", canvas_pane_head + '\nfunction Dummy(){}', {"presets": ["env", "react"]})
    print("Head transform OK")
except py_mini_racer.JSEvalException as exc:
    print(exc)
