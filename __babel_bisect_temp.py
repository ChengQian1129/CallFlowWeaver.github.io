import pathlib
import requests
from py_mini_racer import py_mini_racer

code = pathlib.Path('temp_script.js').read_text(encoding='utf-8', errors='ignore')
lines = code.splitlines()

ctx = py_mini_racer.MiniRacer()
ctx.eval(requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text)

def try_transform(n):
    snippet = "\n".join(lines[:n])
    try:
        ctx.call('Babel.transform', snippet, {'presets': ['env','react']})
        return True, None
    except py_mini_racer.JSEvalException as exc:
        # Reduce noise: only keep message head
        msg = str(exc)
        msg = msg.split('\n')[0]
        return False, msg

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
    print('Error:', fail_exc)
    start = max(0, fail_line - 5)
    end = min(len(lines), fail_line + 5)
    print('Context:')
    for i in range(start, end):
        print(f"{i+1:4}: {lines[i]}")
print('Bisect done.')