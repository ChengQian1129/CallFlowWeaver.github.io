import pathlib, re
html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'function CanvasCard', html)
head = html[:match.start()]
return_start = head.rfind(' return (')
brace = 0
start = None
for i,ch in enumerate(head[return_start:]):
    if ch == '(':
        if brace == 0:
            start = i
        brace += 1
    elif ch == ')':
        brace -= 1
        if brace == 0:
            end = i
            break
content = head[return_start:][start+1:end]
base_line = head[:return_start+start+1].count('\n')
pattern = re.compile(r'<(/)?div\b[^>]*>')
stack = []
for m in pattern.finditer(content):
    idx = m.start()
    line = content[:idx].count('\n') + base_line + 1
    tag = m.group(0)
    if tag.startswith('</'):
        if stack:
            open_line = stack.pop()
            print(f'Close at line {line} matching open at {open_line}')
        else:
            print(f'Extra closing </div> at line {line}')
    else:
        stack.append(line)
if stack:
    print('Unmatched openings remain:', stack)
