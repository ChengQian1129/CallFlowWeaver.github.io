from pathlib import Path
import re

def balance_counts(text: str):
    s = re.sub(r"//.*", "", text)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"'(?:\\.|[^\\'])*'", "", s)
    s = re.sub(r'"(?:\\.|[^\\"])*"', '', s)
    paren = 0
    brace = 0
    bracket = 0
    first_neg = {'paren': None, 'brace': None, 'bracket': None}
    for i,ch in enumerate(s):
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
    return paren, brace, bracket, first_neg

def main():
    p = Path('temp_script.js')
    text = p.read_text(encoding='utf-8')
    lines = text.splitlines()
    start = 820
    end = 840
    seg = "\n".join(lines[start-1:end])
    paren, brace, bracket, first_neg = balance_counts(seg)
    print(f"Balance in {start}-{end}: ()={paren}, {{}}={brace}, []={bracket}")
    for k,v in first_neg.items():
        if v is not None:
            approx_line = seg[:v].count('\n') + start
            print(f"First negative {k} near line ~{approx_line}")

if __name__ == '__main__':
    main()