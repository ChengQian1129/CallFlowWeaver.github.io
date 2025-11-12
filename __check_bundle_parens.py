import re
from pathlib import Path

def strip_for_balance(s: str) -> str:
    s = re.sub(r"//.*", "", s)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"'(?:\\.|[^\\'])*'", "", s)
    s = re.sub(r'"(?:\\.|[^\\"])*"', '', s)
    return s

def main():
    p = Path('bundle.js')
    s = p.read_text(encoding='utf-8', errors='ignore')
    s2 = strip_for_balance(s)
    paren = brace = bracket = 0
    first_neg = {'paren': None, 'brace': None, 'bracket': None}
    for i,ch in enumerate(s2):
        if ch == '(':
            paren += 1
        elif ch == ')':
            paren -= 1
            if paren < 0 and first_neg['paren'] is None:
                first_neg['paren'] = i
        elif ch == '{':
            brace += 1
        elif ch == '}':
            brace -= 1
            if brace < 0 and first_neg['brace'] is None:
                first_neg['brace'] = i
        elif ch == '[':
            bracket += 1
        elif ch == ']':
            bracket -= 1
            if bracket < 0 and first_neg['bracket'] is None:
                first_neg['bracket'] = i
    print(f"Balance: ()={paren}, {{}}={brace}, []={bracket}")
    for k,v in first_neg.items():
        if v is not None:
            approx_line = s2[:v].count('\n') + 1
            print(f"First negative {k} near line ~{approx_line}")

if __name__ == '__main__':
    main()