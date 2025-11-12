import argparse
import json
import os
import re
import sys

def norm_section(s):
    s = str(s or '').strip()
    s = re.sub(r'[Â§§搂]', '§', s)
    m = re.search(r'(\d+(?:\.\d+)*)', s)
    return m.group(1) if m else ''

def parse_ts(raw):
    t = str(raw or '').strip()
    num = re.sub(r'^\s*TS\s*', '', t, flags=re.I)
    m = re.match(r'^(\d+)\.(\d{3})$', num)
    return (m.group(1), m.group(2)) if m else None

def etsi_id(series, spec):
    return '1' + series + spec

def etsi_group(id_str):
    n = int(id_str)
    base = (n // 100) * 100
    return f"{base:06d}_{base+99:06d}"

def version_digits(v):
    v = str(v or '').strip()
    m = re.match(r'V?(\d+)\.(\d+)\.(\d+)', v, flags=re.I)
    if not m:
        return ''
    return f"{int(m.group(1)):02d}{int(m.group(2)):02d}{int(m.group(3)):02d}"

def local_etsi_pdf(out_root, ts_raw, version, suffix):
    p = parse_ts(ts_raw)
    if not p:
        return ''
    series, spec = p
    id_str = etsi_id(series, spec)
    group = etsi_group(id_str)
    vclean = re.sub(r'^V', '', str(version or ''), flags=re.I)
    vdigits = version_digits(version)
    rel = os.path.join(out_root, 'etsi', group, id_str, f"{vclean}_{suffix}", f"ts_{id_str}v{vdigits}p.pdf")
    return rel

def read_jsonl(path):
    items = []
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line=line.strip()
            if not line: continue
            try:
                items.append(json.loads(line))
            except Exception:
                pass
    return items

def collect_sections(items):
    acc = {}
    for it in items:
        pr = it.get('primary_ref') or {}
        ts = pr.get('ts') or ''
        version = pr.get('version') or ''
        sec = norm_section(pr.get('section') or '')
        if not ts or not version or not sec:
            continue
        key = f"{str(ts).strip()}@{str(version).strip()}"
        acc.setdefault(key, set()).add(sec)
    return {k: sorted(v) for k,v in acc.items()}

def extract_pages(pdf_path, want_sections=None, full_scan=False):
    try:
        import PyPDF2
    except Exception:
        return {}
    out = {}
    try:
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            total = len(reader.pages)
            if full_scan:
                seen = set()
                pat = re.compile(r"(^|\n)\s*(\d+(?:\.\d+){0,6})\s+[^\n]{2,}")
                for i in range(total):
                    try:
                        txt = reader.pages[i].extract_text() or ''
                    except Exception:
                        txt = ''
                    if not txt:
                        continue
                    for m in pat.finditer(txt):
                        sec = m.group(2)
                        if sec and sec not in out:
                            out[sec] = i+1
                            seen.add(sec)
            else:
                regexes = {}
                for sec in want_sections:
                    regexes[sec] = re.compile(rf"(^|\n)\s*{re.escape(sec)}(\s|$|\.)")
                for i in range(total):
                    try:
                        txt = reader.pages[i].extract_text() or ''
                    except Exception:
                        txt = ''
                    if not txt:
                        continue
                    for sec, pat in list(regexes.items()):
                        if sec in out:
                            continue
                        if pat.search(txt):
                            out[sec] = i+1
                    if want_sections and len(out) == len(want_sections):
                        break
    except Exception:
        return {}
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from-jsonl')
    ap.add_argument('--spec-root', default=os.path.join('preview','specs'))
    ap.add_argument('--out', default=os.path.join('preview','specSectionIndex.json'))
    ap.add_argument('--scan-all-local', action='store_true')
    args = ap.parse_args()

    section_index = {}
    spec_index_path = os.path.join('preview','specIndex.json')
    try:
        with open(spec_index_path,'r',encoding='utf-8') as f:
            spec_index = json.load(f)
    except Exception:
        spec_index = {}

    if args.scan_all_local:
        for root, dirs, files in os.walk(os.path.join(args.spec_root, 'etsi')):
            for fn in files:
                if not fn.lower().endswith('.pdf'):
                    continue
                try:
                    parts = root.replace('\\','/').split('/')
                    id_str = parts[-2]
                    ver_dir = parts[-1]
                    series = id_str[:3]
                    spec = id_str[3:]
                    ts_raw = f"TS {int(series)-100}.{spec}"
                    m = re.match(r'^(\d+)\.(\d+)\.(\d+)$', ver_dir.split('_')[0])
                    if not m:
                        continue
                    version = f"V{int(m.group(1))}.{int(m.group(2))}.{int(m.group(3))}"
                    key = f"{ts_raw}@{version}"
                    pdf_path = os.path.join(root, fn)
                    pages = extract_pages(pdf_path, full_scan=True)
                    if pages:
                        section_index[key] = pages
                except Exception:
                    continue
    else:
        items = read_jsonl(args.from_jsonl) if args.from_jsonl else []
        acc = collect_sections(items)
        for key, secs in acc.items():
            ts_raw, version = key.split('@',1)
            mapped = spec_index.get(key)
            pdf_path = ''
            if mapped and mapped.lower().endswith('.pdf'):
                pdf_path = os.path.join('preview', mapped.replace('./','').replace('/',os.sep))
            else:
                for suf in ['20','50','60','70']:
                    cand = local_etsi_pdf(args.spec_root, ts_raw, version, suf)
                    if os.path.exists(cand):
                        pdf_path = cand
                        break
            if not pdf_path or not os.path.exists(pdf_path):
                continue
            pages = extract_pages(pdf_path, secs)
            if pages:
                section_index[key] = pages

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out,'w',encoding='utf-8') as f:
        json.dump(section_index, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
