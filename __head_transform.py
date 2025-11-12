import pathlib, re
import requests
from py_mini_racer import py_mini_racer

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
script = match.group(1)
head = script.split('function CanvasCard', 1)[0]
wrapper = "(() => {\n" + head + "\n})();"
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)
try:
    ctx.call('Babel.transform', wrapper, {'presets': ['env','react']})
    print('head transforms OK')
except py_mini_racer.JSEvalException as exc:
    print('transform failed:')
    print(exc)
