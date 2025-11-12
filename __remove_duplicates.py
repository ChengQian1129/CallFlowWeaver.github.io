import pathlib
text = pathlib.Path("index.html").read_text(encoding="utf-8")
start_marker = "\n\n  <div>\n   <div className=\"text-zinc-400 text-sm\">Protocol"
end_marker = "\n// Elegant Toast System - Fixed top-right position"
start = text.find(start_marker)
end = text.find(end_marker)
if start == -1 or end == -1 or end <= start:
    raise SystemExit('Markers not found or in wrong order')
new_text = text[:start] + '\n\n' + text[end:]
pathlib.Path("index.html").write_text(new_text, encoding="utf-8")
