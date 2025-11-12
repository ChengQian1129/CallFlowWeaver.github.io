import json, pathlib
p = pathlib.Path('non5gc_rel18.jsonl')
text = p.read_text(encoding='utf-8', errors='ignore')
lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
valid = 0
errors = []
missing_protocol = 0
missing_interface = 0
protocols = {}
ids = []
for i, ln in enumerate(lines, 1):
    try:
        obj = json.loads(ln)
    except Exception as e:
        errors.append((i, f'json parse error: {e}'))
        continue
    if not (('schema_version' in obj) or ('id' in obj)):
        errors.append((i, 'missing schema_version/id'))
        continue
    if not (('ie_tree' in obj) or ('message' in obj) or ('interface' in obj)):
        errors.append((i, 'missing ie_tree/message/interface'))
        continue
    valid += 1
    ids.append(obj.get('id',''))
    proto = obj.get('protocol')
    if not proto:
        missing_protocol += 1
    else:
        protocols[proto] = protocols.get(proto, 0) + 1
    if not obj.get('interface'):
        missing_interface += 1
print('Summary:')
print(' total lines:', len(lines))
print(' valid:', valid)
print(' errors:', len(errors))
print(' protocols:', ', '.join(f"{k}:{v}" for k,v in sorted(protocols.items())))
print(' missing protocol:', missing_protocol)
print(' missing interface:', missing_interface)
if errors:
    print(' first 5 errors:', errors[:5])
else:
    print(' no parse/field errors detected')