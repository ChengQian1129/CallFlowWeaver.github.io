import pathlib

def main():
    p = pathlib.Path('__temp_script_extracted.js')
    s = p.read_text(encoding='utf-8', errors='ignore')
    a = s.find('function CanvasPane')
    b = s.find('function CanvasCard')
    if a == -1 or b == -1 or b <= a:
        print('Anchors not found or invalid positions:', a, b)
        return
    before = s[:a]
    after = s[b:]
    replacement = 'const CanvasPane = () => null;\n'
    new = before + replacement + after
    p.write_text(new, encoding='utf-8')
    print('Rewrote CanvasPane section to stub function.')

if __name__ == '__main__':
    main()