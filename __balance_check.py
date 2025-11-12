import pathlib

text = pathlib.Path("index.html").read_text(encoding="utf-8")
stack = []
errors = []
line = 1
i = 0
length = len(text)
in_single = False
in_double = False
in_backtick = False
in_line_comment = False
in_block_comment = False
single = "'"
double = '"'
backtick = '`'
pairs = {'(': ')', '{': '}', '[': ']'}
while i < length:
    ch = text[i]
    if ch == '\n':
        line += 1
        in_line_comment = False
    if in_line_comment:
        i += 1
        continue
    if in_block_comment:
        if ch == '*' and i + 1 < length and text[i+1] == '/':
            in_block_comment = False
            i += 2
            continue
        i += 1
        continue
    if in_single:
        if ch == '\\':
            i += 2
            continue
        if ch == single:
            in_single = False
        i += 1
        continue
    if in_double:
        if ch == '\\':
            i += 2
            continue
        if ch == double:
            in_double = False
        i += 1
        continue
    if in_backtick:
        if ch == '\\':
            i += 2
            continue
        if ch == backtick:
            in_backtick = False
        i += 1
        continue
    if ch == '/' and i + 1 < length:
        nxt = text[i+1]
        if nxt == '/':
            in_line_comment = True
            i += 2
            continue
        if nxt == '*':
            in_block_comment = True
            i += 2
            continue
    if ch == single:
        in_single = True
        i += 1
        continue
    if ch == double:
        in_double = True
        i += 1
        continue
    if ch == backtick:
        in_backtick = True
        i += 1
        continue
    if ch in '({[':
        stack.append((ch, line))
    elif ch in ')}]':
        if not stack:
            errors.append(f"Extra closing {ch} at line {line}")
        else:
            opening, open_line = stack.pop()
            if pairs[opening] != ch:
                errors.append(f"Mismatched {opening} at line {open_line} with {ch} at line {line}")
    i += 1
if errors:
    print('Errors:')
    for e in errors[:10]:
        print(' ', e)
if stack:
    print('Unclosed openings:', stack[:10])
if not errors and not stack:
    print('All balanced')
