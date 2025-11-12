import argparse
import json
import sys
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import urllib.request

def read_text(p: Path) -> str:
    return p.read_text(encoding='utf-8', errors='ignore')

def parse_truth(text: str) -> List[Dict[str, Any]]:
    s = text.lstrip('\ufeff')
    items = []
    try:
        obj = json.loads(s)
        if isinstance(obj, list):
            for x in obj:
                if isinstance(x, dict):
                    items.append(x)
    except Exception:
        for line in s.splitlines():
            t = line.strip()
            if not t:
                continue
            if t.startswith('{') and t.endswith('}'):
                try:
                    x = json.loads(t)
                    items.append(x)
                except Exception:
                    pass
    return [x for x in items if isinstance(x, dict) and (x.get('id') or x.get('schema_version'))]

def truth_ids(items: List[Dict[str, Any]]) -> List[str]:
    out = []
    for m in items:
        i = m.get('id')
        if i:
            out.append(str(i))
    return out

def post_json(url: str, data: Dict[str, Any], api_key: Optional[str] = None) -> Dict[str, Any]:
    headers = {'Content-Type':'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        txt = resp.read().decode('utf-8', errors='ignore')
        try:
            return json.loads(txt)
        except Exception:
            return {'raw': txt}

def normalize_endpoint(ep: str, openai: bool) -> str:
    base = re.sub(r"/+\Z", '', ep.strip())
    if openai:
        return base + '/chat/completions' if base.endswith('/v1') else base
    return base

def pick_ids_from_prompt(prompt: str, ids: List[str]) -> List[str]:
    p = (prompt or '').lower()
    toks = [t for t in re.split(r'[^a-z0-9]+', p) if t]
    scored = []
    for i in ids:
        il = i.lower()
        sc = 0
        for t in toks:
            if t and t in il:
                sc += 2
        if 'paging' in p and 'paging' in il:
            sc += 3
        if 'service' in p and 'service' in il:
            sc += 2
        if re.search(r'(attach|registration)', p) and re.search(r'(attach|registration)', il):
            sc += 3
        if re.search(r'(diameter|http|sip|sgsap|n1|nas)', p) and re.search(r'(diameter|http|sip|sgsap|n1|nas)', il):
            sc += 1
        scored.append((i, sc))
    scored.sort(key=lambda x: -x[1])
    res = [i for i, s in scored if s > 0]
    if not res:
        res = ids[:min(8, len(ids))]
    return res[:20]

def validate_ids(generated: List[str], allowed: List[str], min_n: int, max_n: int) -> Dict[str, Any]:
    aset = set(allowed)
    uniq = []
    for i in generated:
        si = str(i)
        if si in aset and si not in uniq:
            uniq.append(si)
    ok_len = min_n <= len(uniq) <= max_n
    return {
        'ok': ok_len and len(uniq) >= min_n,
        'used_ids': uniq,
        'missing_in_truth': [i for i in generated if str(i) not in aset],
        'count': len(uniq)
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--endpoint', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--dataset', default='non5gc_rel18.final.rich.jsonl')
    ap.add_argument('--prompt', required=True)
    ap.add_argument('--min_ids', type=int, default=4)
    ap.add_argument('--max_ids', type=int, default=40)
    ap.add_argument('--out', default='harness_report.json')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--strict', dest='strict', action='store_true')
    g.add_argument('--no-strict', dest='strict', action='store_false')
    ap.set_defaults(strict=True)
    ap.add_argument('--api_key', help='API key (use env instead in practice)')
    ap.add_argument('--api_key_env', help='Environment variable name containing API key')
    ap.add_argument('--openai', action='store_true', help='Use OpenAI-compatible /v1/chat/completions endpoint')
    args = ap.parse_args()

    ds = Path(args.dataset)
    if not ds.exists():
        print('DATASET_NOT_FOUND', ds, file=sys.stderr)
        sys.exit(2)
    truth = parse_truth(read_text(ds))
    ids = truth_ids(truth)
    if not ids:
        print('TRUTH_EMPTY', file=sys.stderr)
        sys.exit(2)

    supported = pick_ids_from_prompt(args.prompt, ids)
    messages = [
        {'role':'system','content':'You are a 5GC signaling expert. Return JSON: {"message_ids":[]}, IDs must be strictly from the supported list.'},
        {'role':'user','content':args.prompt},
        {'role':'user','content':'supported_message_ids: ' + json.dumps(supported)}
    ]
    payload = {'model': args.model, 'messages': messages}
    api_key = None
    if args.api_key_env:
        api_key = os.environ.get(args.api_key_env)
    if not api_key and args.api_key:
        api_key = args.api_key
    url = normalize_endpoint(args.endpoint, args.openai)
    data = post_json(url, payload, api_key=api_key)

    gen_ids = []
    content = None
    try:
        content = data.get('choices', [{}])[0].get('message', {}).get('content')
        obj = json.loads(content) if content else {}
        if isinstance(obj.get('message_ids'), list):
            gen_ids = [str(x) for x in obj['message_ids']]
    except Exception:
        gen_ids = []

    v = validate_ids(gen_ids, ids, args.min_ids, args.max_ids)
    if not v['ok']:
        report = {'step':'generate', 'ok':False, 'reason':'ids_invalid', 'validation':v, 'raw':data, 'endpoint': args.endpoint, 'model': args.model}
        Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print('GENERATE_INVALID', v)
        if args.strict:
            sys.exit(1)
        v = {'ok': True, 'used_ids': supported[:min(args.min_ids, len(supported))], 'missing_in_truth': [], 'count': min(args.min_ids, len(supported))}

    case_items = []
    truth_index = {str(m.get('id')): m for m in truth if m.get('id')}
    for i in v['used_ids'][:min(10, len(v['used_ids']))]:
        m = truth_index.get(str(i))
        if not m:
            continue
        vals = [{'key':'IMSI','value':'00101'}]
        case_items.append({'uid':'U_'+i.replace('.', '_'), 'message_id':str(i), 'ie_values':vals})

    case = {'items': case_items}
    messages2 = [
        {'role':'system','content':'Analyze case consistency and return JSON {"conflicts":[],"alignments":{},"suggestions":[{"uid":"","message_id":"","overrides":{}}]}'},
        {'role':'user','content':json.dumps(case, ensure_ascii=False)}
    ]
    payload2 = {'model': args.model, 'messages': messages2}
    data2 = post_json(url, payload2, api_key=api_key)

    ok_suggestions = False
    try:
        c2 = data2.get('choices', [{}])[0].get('message', {}).get('content')
        obj2 = json.loads(c2) if c2 else {}
        ok_suggestions = isinstance(obj2.get('suggestions'), list)
    except Exception:
        ok_suggestions = False

    report = {'step':'analyze', 'ok':ok_suggestions, 'generated_ids':v['used_ids'], 'generate_raw':data, 'analyze_raw':data2, 'endpoint': args.endpoint, 'model': args.model}
    Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('ANALYZE_OK' if ok_suggestions else 'ANALYZE_FAIL')
    sys.exit(0 if ok_suggestions else 1)

if __name__ == '__main__':
    main()
