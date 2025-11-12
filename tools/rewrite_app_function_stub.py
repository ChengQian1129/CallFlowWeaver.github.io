import re
from pathlib import Path

def find_app_function_span(src: str):
    # Locate 'function App(' and the opening brace
    m = re.search(r"\bfunction\s+App\s*\(\)\s*\{", src)
    if not m:
        return None
    start_brace_idx = src.find('{', m.start())
    if start_brace_idx == -1:
        return None
    # Walk forward to find the matching closing brace
    i = start_brace_idx
    depth = 0
    n = len(src)
    in_str = False
    str_quote = ''
    in_template = False
    escape = False
    in_line_comment = False
    in_block_comment = False
    while i < n:
        ch = src[i]
        nxt = src[i+1] if i+1 < n else ''
        # Handle comments first when not in strings
        if not in_str and not in_template:
            if in_line_comment:
                if ch == '\n':
                    in_line_comment = False
                i += 1
                continue
            if in_block_comment:
                if ch == '*' and nxt == '/':
                    in_block_comment = False
                    i += 2
                    continue
                i += 1
                continue
            if ch == '/' and nxt == '/':
                in_line_comment = True
                i += 2
                continue
            if ch == '/' and nxt == '*':
                in_block_comment = True
                i += 2
                continue
        # Handle strings
        if in_str:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == str_quote:
                in_str = False
            i += 1
            continue
        # Handle template literals with basic nesting of ${}
        if in_template:
            if escape:
                escape = False
                i += 1
                continue
            if ch == '\\':
                escape = True
                i += 1
                continue
            if ch == '`':
                in_template = False
                i += 1
                continue
            # Track braces within ${}
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
            i += 1
            continue
        # Enter strings/templates when not in comment
        if ch in ('"', "'"):
            in_str = True
            str_quote = ch
            i += 1
            continue
        if ch == '`':
            in_template = True
            i += 1
            continue
        # Track braces depth
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                # Found the closing brace for the App function
                return m.start(), i+1
        i += 1
    return None

def main():
    p = Path('__temp_script_extracted.js')
    src = p.read_text(encoding='utf-8', errors='ignore')
    span = find_app_function_span(src)
    if not span:
        print('App function span not found')
        return
    s, e = span
    # Replace entire App function with a minimal stub
    stub = 'function App(){ return null; }'
    new_src = src[:s] + stub + src[e:]
    p.write_text(new_src, encoding='utf-8')
    print('App function replaced with stub')

if __name__ == '__main__':
    main()