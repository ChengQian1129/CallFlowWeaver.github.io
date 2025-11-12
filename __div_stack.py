import pathlib, re
html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'function CanvasCard', html)
head = html[:match.start()]
return_start = head.rfind(' return (')
return_block = head[return_start:]
brace = 0
end_idx = None
for i,ch in enumerate(return_block):
    if ch == '(':
        brace += 1
        if brace == 1:
            start = i
    elif ch == ')':
        brace -= 1
        if brace == 0:
            end_idx = i
            break
content = return_block[start+1:end_idx]

pattern = re.compile(r'<(/)?div\b[^>]*>')
stack = []
for m in pattern.finditer(content):
    tag = m.group(0)
    if tag.startswith('</'):
        if stack:
            stack.pop()
        else:
            print('extra closing at', m.start())
    else:
        stack.append(m.start())
if stack:
    print('unclosed openings at positions:', stack)
else:
    print('div tags balanced')
