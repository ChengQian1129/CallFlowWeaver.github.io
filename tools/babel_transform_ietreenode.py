import pathlib
import requests
from py_mini_racer import py_mini_racer

def main():
    text = pathlib.Path('__temp_script_extracted.js').read_text(encoding='utf-8', errors='ignore')
    start = text.find('function IETreeNode(')
    end = text.find('function RoleBindings(')
    if start == -1 or end == -1 or end <= start:
        print('Anchors not found or invalid positions:', start, end)
        return
    subset = text[start:end]
    wrapper = "(()=>{\n" + subset + "\n})();"
    ctx = py_mini_racer.MiniRacer()
    babel_js = requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text
    ctx.eval(babel_js)
    try:
        ctx.call('Babel.transform', wrapper, {"presets": ["env", "react"]})
        print('IETreeNode subset transform OK')
    except py_mini_racer.JSEvalException as exc:
        print('IETreeNode subset transform FAILED')
        print(exc)

if __name__ == '__main__':
    main()