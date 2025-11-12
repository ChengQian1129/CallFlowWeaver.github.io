import pathlib
import requests
from py_mini_racer import py_mini_racer

# Prefer the fully extracted viewer source
src_path = pathlib.Path('temp_script_full.js')
out_path = pathlib.Path('bundle.js')

code = src_path.read_text(encoding='utf-8', errors='ignore')
babel_js = requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text

ctx = py_mini_racer.MiniRacer()
ctx.eval(babel_js)

try:
    result = ctx.call('Babel.transform', code, {'presets': ['env','react']})
    compiled = result['code'] if isinstance(result, dict) else result
    out_path.write_text(compiled, encoding='utf-8')
    print('bundle.js written')
except py_mini_racer.JSEvalException as exc:
    pathlib.Path('__build_error.txt').write_text(str(exc), encoding='utf-8')
    print('Build failed:')
    print(exc)
    raise SystemExit(1)
