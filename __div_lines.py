import pathlib, re
html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'function CanvasCard', html)
head = html[:match.start()]
return_start = head.rfind(' return (')
# find closing parenthesis of return block
brace = 0
inside = []
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
# compute line numbers relative to original script lines
lines_before = head[:return_start+start+1].splitlines()
base_line = len(lines_before)
pattern = re.compile(r'<(/)?div\b[^>]*>')
stack = []
for m in pattern.finditer(content):
    idx = m.start()
    line = content[:idx].count('\n') + base_line + 1
    tag = m.group(0)
    if tag.startswith('</'):
        if stack:
            stack.pop()
        else:
            print('Extra closing </div> at line', line)
    else:
        stack.append(line)
if stack:
    print('Unclosed <div> starting at lines:', stack)
else:
    print('Div tags balanced')
