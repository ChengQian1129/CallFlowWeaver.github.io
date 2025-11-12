from pathlib import Path
import re

def curly_balance(text: str) -> int:
    # remove single-line comments
    s = re.sub(r"//.*", "", text)
    # remove block comments
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    # remove strings (single and double)
    s = re.sub(r"'(?:\\.|[^\\'])*'", "", s)
    s = re.sub(r'"(?:\\.|[^\\"])*"', '', s)
    bal = 0
    for ch in s:
        if ch == '{':
            bal += 1
        elif ch == '}':
            bal -= 1
    return bal

def main():
    p = Path('temp_script.js')
    text = p.read_text(encoding='utf-8')
    lines = text.splitlines()

    # region around App close and BuildPane open
    start = 160
    end = 940
    seg = "\n".join(lines[start-1:end])
    # detailed scan to find first negative position
    s = re.sub(r"//.*", "", seg)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"'(?:\\.|[^\\'])*'", "", s)
    s = re.sub(r'"(?:\\.|[^\\"])*"', '', s)
    bal = 0
    first_negative = None
    for idx, ch in enumerate(s):
        if ch == '{':
            bal += 1
        elif ch == '}':
            bal -= 1
        if bal < 0 and first_negative is None:
            first_negative = idx
            break
    print(f"Curly balance {bal} in lines {start}-{end}")
    if first_negative is not None:
        # map idx back to line number
        upto = s[:first_negative]
        line_no = upto.count('\n') + start
        print(f"First negative at approx line ~{line_no}")

    # also check a slightly longer window
    start2 = 1
    end2 = 1000
    seg2 = "\n".join(lines[start2-1:end2])
    bal2 = curly_balance(seg2)
    print(f"Curly balance {bal2} in lines {start2}-{end2}")

if __name__ == '__main__':
    main()