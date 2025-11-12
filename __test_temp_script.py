import pathlib
import requests
from py_mini_racer import py_mini_racer

script = pathlib.Path('__temp_script_extracted.js').read_text(encoding='utf-8', errors='ignore')
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)
try:
    ctx.call('Babel.transform', script, {'presets': ['env','react']})
    print('temp_script transforms OK')
except py_mini_racer.JSEvalException as exc:
    print('temp_script transform failed:')
    print(exc)
