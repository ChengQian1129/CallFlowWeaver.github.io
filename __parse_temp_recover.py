import pathlib
import requests
from py_mini_racer import py_mini_racer

code = pathlib.Path('__temp_script_extracted.js').read_text(encoding='utf-8', errors='ignore')
ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)

transform_options = {
    "presets": ["env", "react"],
    "sourceType": "script",
    "parserOpts": {"errorRecovery": True}
}
try:
    result = ctx.call("function(code, opts){ return Babel.transform(code, opts); }", code, transform_options)
    errs = result.get('parserErrors') if isinstance(result, dict) else None
    if errs:
        for e in errs:
            print(e)
    else:
        print('Transform success, no parser errors detected')
except Exception as ex:
    print('Transform failed:', ex)