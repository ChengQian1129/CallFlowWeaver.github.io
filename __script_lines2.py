import pathlib, re, sys
html = pathlib.Path("index.html").read_text(encoding="utf-8")
match = re.search(r'<script data-presets="env,react" type="text/babel">(.*?)</script>', html, re.S)
lines = match.group(1).splitlines()
start = 2380
end = 2395
for idx in range(start, end):
    line = lines[idx]
    sys.stdout.buffer.write(f"{idx+1:4}: ".encode('utf-8'))
    sys.stdout.buffer.write(line.encode('utf-8', errors='ignore'))
    sys.stdout.buffer.write(b"\n")
