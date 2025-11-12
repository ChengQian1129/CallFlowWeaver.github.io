import pathlib, re
html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'function CanvasCard', html)
canvas_card_index = match.start()
head = html[:canvas_card_index]
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
open_div = len(re.findall(r'<div\b', content))
close_div = len(re.findall(r'</div>', content))
print('div openings', open_div, 'closings', close_div)
