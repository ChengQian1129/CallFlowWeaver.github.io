import pathlib
import requests
from py_mini_racer import py_mini_racer

code = pathlib.Path('__temp_script_extracted.js').read_text(encoding='utf-8', errors='ignore')
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)

try:
    out = ctx.call('Babel.transform', code, {'presets': ['env','react']})
    print('Transform OK; code length:', len(out.get('code','')))
except py_mini_racer.JSEvalException as exc:
    msg = str(exc)
    print('Error head:')
    print('\n'.join(msg.splitlines()[:10]))