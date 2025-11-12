import pathlib
import requests
from py_mini_racer import py_mini_racer

def main():
    path = pathlib.Path('__temp_script_extracted.js')
    code = path.read_text(encoding='utf-8', errors='ignore')
    ctx = py_mini_racer.MiniRacer()
    babel_js = requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text
    ctx.eval(babel_js)
    parse_opts = {"sourceType": "script", "plugins": ["jsx"], "errorRecovery": True}
    try:
        result = ctx.call('function(code, opts){ return Babel.parse(code, opts); }', code, parse_opts)
    except Exception as exc:
        print('Babel.parse threw:', exc)
        return
    errors = result.get('errors', []) if isinstance(result, dict) else []
    print(f'Parser errors: {len(errors)}')
    for err in errors[:50]:
        print(err)

if __name__ == '__main__':
    main()