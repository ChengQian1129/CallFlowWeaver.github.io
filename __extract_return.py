import pathlib, re, sys
html = pathlib.Path("index.html").read_text(encoding="utf-8")
start = html.find('return (\n  <div className={(inBuild?\'col-span-7\':\'col-span-5\')+" space-y-3"}>')
if start == -1:
    raise SystemExit('start not found')
end = html.find('\n );\n}\n\nfunction CanvasCard', start)
segment = html[start:end]
sys.stdout.buffer.write(segment.encode("utf-8", errors='ignore'))
