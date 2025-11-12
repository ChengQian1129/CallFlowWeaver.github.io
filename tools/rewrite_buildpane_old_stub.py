import pathlib


def main():
    p = pathlib.Path('__temp_script_extracted.js')
    s = p.read_text(encoding='utf-8', errors='ignore')
    a = s.find('function BuildPane_old(')
    b = s.find('function CanvasPane_old(')
    if a == -1 or b == -1 or b <= a:
        print('Anchors not found or invalid positions:', a, b)
        return
    before = s[:a]
    after = s[b:]
    replacement = 'function BuildPane_old(props){\n  return null;\n}\n\n'
    new = before + replacement + after
    p.write_text(new, encoding='utf-8')
    print('Rewrote BuildPane_old to stub function between anchors.')


if __name__ == '__main__':
    main()