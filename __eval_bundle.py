from py_mini_racer import py_mini_racer
import sys
from pathlib import Path
p=Path('bundle.js')
code=p.read_text(encoding='utf-8')
ctx=py_mini_racer.MiniRacer()
try:
    ctx.eval(code)
    print('OK: bundle.js executed without syntax errors')
except Exception as e:
    print('EVAL ERROR:')
    print(type(e).__name__, str(e))
    # Try to extract line/column if available
    s=str(e)
    print('RAW:', s)