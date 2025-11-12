import pathlib
import re
import requests
from py_mini_racer import py_mini_racer

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
if not match:
    raise SystemExit("script block not found")
lines = match.group(1).splitlines()

ctx = py_mini_racer.MiniRacer()
babel_js = requests.get("https://unpkg.com/@babel/standalone@7.26.0/babel.min.js", timeout=30).text
ctx.eval(babel_js)

def try_transform(n):
    snippet = "\n".join(lines[:n])
    try:
        ctx.call("Babel.transform", snippet, {"presets": ["env", "react"]})
        return True, None
    except py_mini_racer.JSEvalException as exc:
        return False, exc

lo, hi = 1, len(lines)
fail_line = None
fail_exc = None
while lo <= hi:
    mid = (lo + hi) // 2
    ok, exc = try_transform(mid)
    if ok:
        lo = mid + 1
    else:
        fail_line = mid
        fail_exc = exc
        hi = mid - 1

print('First failing line index:', fail_line)
if fail_exc:
    print(fail_exc)
