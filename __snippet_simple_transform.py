import pathlib
import requests
from py_mini_racer import py_mini_racer
code = pathlib.Path("__snippet_simple.js").read_text(encoding='utf-8')
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)
print(ctx.call('Babel.transform', code, {'presets': ['env','react']})['code'])
