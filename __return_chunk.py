import pathlib, re, sys
html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'function CanvasCard', html)
head = html[:match.start()]
return_start = head.rfind(' return (')
chunk = head[return_start:return_start+2000]
sys.stdout.buffer.write(chunk.encode('utf-8', errors='ignore'))
