import pathlib
import re

html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
script = match.group(1)
start = script.find('function CanvasPane')
end = script.find('function CanvasCard')
subset = script[start:end]
stack = []
for idx, ch in enumerate(subset):
    if ch in '({[':
        stack.append((ch, idx))
    elif ch in ')}]':
        if not stack:
            print('extra closing', ch, 'at position', idx)
            break
        opening, pos = stack.pop()
        pairs = {'(': ')', '{': '}', '[': ']'}
        if pairs[opening] != ch:
            print('mismatch', opening, 'opened at', pos, 'closed by', ch, 'at', idx)
            break
else:
    print('subset stack size:', len(stack))
    if stack:
        print('unclosed openings', stack)
