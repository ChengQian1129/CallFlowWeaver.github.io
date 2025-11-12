import pathlib
html = pathlib.Path("index.html").read_text(encoding="utf-8")
start = html.find('  <div className="flex items-center justify-between"')
end = html.find('    </div>\n    </div>', start)
print(html[start:end+11])
