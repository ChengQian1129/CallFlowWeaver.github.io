import re
from pathlib import Path
import requests
from py_mini_racer import py_mini_racer

JS = r"""
const code = globalThis.__CODE__;
try {
  const out = Babel.transform(code, { presets: [ ['env', { modules: false }], ['react', { runtime: 'automatic' }] ] });
  out.code;
} catch (e) {
  throw e;
}
"""

def main():
    root = Path(__file__).resolve().parent.parent
    src = (root / "__temp_script_extracted.js").read_text(encoding="utf-8")

    # Find BuildPane start line to cut prefix safely
    lines = src.splitlines()
    build_idx = None
    for i, line in enumerate(lines, start=1):
        if re.search(r"^\s*function\s+BuildPane\s*\(", line):
            build_idx = i
            break
    if build_idx is None:
        print("BuildPane not found; transforming full file prefix=EOF")
        prefix = src
    else:
        # Transform up to the line before BuildPane (exclusive)
        # Allow narrowing by environment variable or default to build_idx-1
        import os
        end_line = int(os.environ.get('PREFIX_END_LINE', build_idx-1))
        end_line = max(1, min(end_line, build_idx-1))
        prefix = "\n".join(lines[:end_line])
        print(f"Prefix lines: 1..{end_line}")

    ctx = py_mini_racer.MiniRacer()
    # Load Babel standalone from CDN (align with existing temp script)
    babel_js = requests.get('https://unpkg.com/@babel/standalone@7.26.0/babel.min.js', timeout=30).text
    ctx.eval(babel_js)
    # Inject code and run
    ctx.eval("globalThis.__CODE__ = '';")
    ctx.eval(f"globalThis.__CODE__ = {repr(prefix)};")

    try:
        out = ctx.eval(JS)
        print("Prefix transform OK")
    except Exception as e:
        print("Prefix transform FAILED")
        # Try to print a helpful snippet location if possible
        # We rely on counting lines in prefix
        print(e)

if __name__ == "__main__":
    main()