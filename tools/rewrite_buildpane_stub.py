import pathlib

def main():
    p = pathlib.Path('__temp_script_extracted.js')
    s = p.read_text(encoding='utf-8', errors='ignore')
    a = s.find('function BuildPane(props){')
    b = s.find('const CanvasPane = () => null;')
    if a == -1 or b == -1 or b <= a:
        print('Anchors not found or invalid:', a, b)
        return
    head = s[:a]
    tail = s[b:]
    stub = 'function BuildPane(props){\n  return null;\n}\n\n'
    p.write_text(head + stub + tail, encoding='utf-8')
    print('BuildPane rewritten to minimal stub between anchors.')

if __name__ == '__main__':
    main()