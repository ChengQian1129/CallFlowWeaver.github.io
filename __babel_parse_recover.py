import pathlib
import re
import requests
from py_mini_racer import py_mini_racer

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
script_content = match.group(1)
ctx = py_mini_racer.MiniRacer()
babel_js = requests.get("https://unpkg.com/@babel/standalone@7.26.0/babel.min.js", timeout=30).text
ctx.eval(babel_js)
parse_options = {"sourceType": "script", "plugins": ["jsx"], "errorRecovery": True}
result = ctx.call("function(code, opts){ return Babel.parse(code, opts); }", script_content, parse_options)
errors = result.get('errors') if isinstance(result, dict) else None
if errors:
    print('Parser errors:')
    for err in errors:
        print(err)
else:
    print('Parse succeeded without errors')
