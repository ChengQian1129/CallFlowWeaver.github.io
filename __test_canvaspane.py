import pathlib, re
import requests
from py_mini_racer import py_mini_racer

src = pathlib.Path("__temp_script_extracted.js").read_text(encoding="utf-8")
match_start = src.find('function CanvasPane(')
match_end = src.find('function CanvasCard(')
code = src[match_start:match_end]
wrapper = "(() => {\n" + code + "\n})();"
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)
try:
    ctx.call('Babel.transform', wrapper, {'presets': ['env','react']})
    print('CanvasPane OK')
except py_mini_racer.JSEvalException as exc:
    print(exc)
