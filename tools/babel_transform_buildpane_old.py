import pathlib
import requests
from py_mini_racer import py_mini_racer

def main():
    text = pathlib.Path('__temp_script_extracted.js').read_text(encoding='utf-8', errors='ignore')
    start = text.find('function BuildPane_old(')
    end = text.find('function CanvasPane_old(')
    if start == -1 or end == -1 or end <= start:
        print('Anchors not found or invalid range:', start, end)
        return
    subset = text[start:end]
    wrapper = "(()=>{\n" + subset + "\n})();"
    ctx = py_mini_racer.MiniRacer()
    babel_js = requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=45).text
    ctx.eval(babel_js)
    try:
        out = ctx.call('Babel.transform', wrapper, {"presets": ["env", "react"]})
        print('BuildPane_old subset Transform OK; code length:', len(out.get('code','')))
    except Exception as exc:
        msg = str(exc)
        head = '\n'.join(msg.splitlines()[:12])
        print('BuildPane_old subset Transform FAILED:\n' + head)

if __name__ == '__main__':
    main()