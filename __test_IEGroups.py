import pathlib, re
import requests
from py_mini_racer import py_mini_racer

src = pathlib.Path("__temp_script_extracted.js").read_text(encoding="utf-8")
match = re.search(r'function IEGroups\({ci}\)', src)
if not match:
    raise SystemExit('IEGroups not found in __temp_script_extracted.js')
start = match.start()
rest = src[start:]
end = rest.find('function IETreeNode')
code = rest[:end]
w = "(() => {\n" + code + "\n})();"
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)
try:
    ctx.call('Babel.transform', w, {'presets': ['env','react']})
    print('IEGroups OK')
except py_mini_racer.JSEvalException as exc:
    print(exc)
