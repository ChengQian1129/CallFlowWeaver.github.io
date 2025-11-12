import pathlib
import requests
from py_mini_racer import py_mini_racer

def main():
    code = pathlib.Path('__temp_script_extracted.js').read_text(encoding='utf-8', errors='ignore')
    ctx = py_mini_racer.MiniRacer()
    babel_js = requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text
    ctx.eval(babel_js)
    try:
        ctx.call('Babel.transform', code, {"presets": ["env", "react"]})
        print('Transform OK')
    except py_mini_racer.JSEvalException as exc:
        print('Transform failed:')
        print(exc)

if __name__ == '__main__':
    main()