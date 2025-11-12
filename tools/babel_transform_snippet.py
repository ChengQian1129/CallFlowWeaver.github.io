import pathlib
import re
import requests
from py_mini_racer import py_mini_racer

def main():
    text = pathlib.Path('__temp_script_extracted.js').read_text(encoding='utf-8', errors='ignore')
    start = text.find('function CanvasPane')
    end = text.find('function CanvasCard')
    assert start != -1 and end != -1 and end > start, 'Failed to locate CanvasPane/CanvasCard in file.'
    subset = text[start:end]
    wrapper = "(()=>{\n" + subset + "\n})();"
    ctx = py_mini_racer.MiniRacer()
    babel_js = requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text
    ctx.eval(babel_js)
    try:
        ctx.call('Babel.transform', wrapper, {"presets": ["env", "react"]})
        print('CanvasPane subset transform OK')
    except py_mini_racer.JSEvalException as exc:
        print('Subset transform failed:')
        print(exc)

if __name__ == '__main__':
    main()