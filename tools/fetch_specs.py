import argparse
import json
import os
import re
import sys
from urllib.parse import urljoin
import urllib.request
try:
    import requests
except Exception:
    requests = None
import re as _re
import zipfile
import io

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

def dir_version(v):
    v = str(v or '').strip()
    m = re.match(r'V?(\d+)\.(\d+)\.(\d+)', v, flags=re.I)
    if not m:
        return v
    return f"{int(m.group(1)):02d}.{int(m.group(2)):02d}.{int(m.group(3)):02d}"

def etsi_candidates(ts_raw, version):
    p = parse_ts(ts_raw)
    if not p:
        return []
    series, spec = p
    id_str = etsi_id(series, spec)
    group = etsi_group(id_str)
    vclean = dir_version(version).lstrip('V')
    vdigits = version_digits(version)
    urls = []
    for suf in ['20','50','60','70']:
        urls.append((f"https://www.etsi.org/deliver/etsi_ts/{group}/{id_str}/{vclean}_{suf}/ts_{id_str}v{vdigits}p.pdf", suf))
    return urls

def _series_spec(ts_raw):
    p = parse_ts(ts_raw)
    if not p:
        return None, None
    return (p[0], p[1])

def fetch_from_3gpp_archive(ts_raw, version, out_root):
    series, spec = _series_spec(ts_raw)
    if not series:
        return ''
    base = f"https://www.3gpp.org/ftp/Specs/archive/{series}_series/{series}.{spec}/"
    try:
        if requests:
            r = requests.get(base, timeout=30)
            html = r.text
        else:
            with urllib.request.urlopen(base, timeout=30) as resp:
                html = resp.read().decode('utf-8', 'ignore')
    except Exception:
        return ''
    zip_links = _re.findall(r'href=["\']([^"\']+\.zip)["\']', html, flags=_re.I)
    pdf_links = _re.findall(r'href=["\']([^"\']+\.pdf)["\']', html, flags=_re.I)
    v = dir_version(version).lstrip('V')
    tokens = [v, v.replace('.', ''), version, str(version).replace('V','').replace('.','')]
    if pdf_links:
        chosen_pdf = ''
        for ln in pdf_links:
            low = ln.lower()
            if any(t.lower() in low for t in tokens):
                chosen_pdf = ln
                break
        if not chosen_pdf:
            chosen_pdf = pdf_links[-1]
        pdf_url = base + chosen_pdf
        try:
            out_dir = os.path.join(out_root, '3gpp', f"{series}_series", f"{series}.{spec}")
            os.makedirs(out_dir, exist_ok=True)
            outp = os.path.join(out_dir, f"TS_{series}.{spec}_{version}.pdf")
            if fetch(pdf_url, outp):
                return outp
        except Exception:
            pass
    if not zip_links:
        return ''
    chosen = ''
    for ln in zip_links:
        low = ln.lower()
        if any(t.lower() in low for t in tokens):
            chosen = ln
            break
    if not chosen:
        chosen = zip_links[-1]
    zip_url = base + chosen
    try:
        if requests:
            z = requests.get(zip_url, timeout=60)
            buf = io.BytesIO(z.content)
        else:
            with urllib.request.urlopen(zip_url, timeout=60) as resp:
                buf = io.BytesIO(resp.read())
        with zipfile.ZipFile(buf) as zf:
            pdf_name = ''
            for nm in zf.namelist():
                if nm.lower().endswith('.pdf'):
                    pdf_name = nm
                    break
            if not pdf_name:
                return ''
            os.makedirs(os.path.join(out_root, '3gpp', f"{series}_series", f"{series}.{spec}"), exist_ok=True)
            outp = os.path.join(out_root, '3gpp', f"{series}_series", f"{series}.{spec}", f"TS_{series}.{spec}_{version}.pdf")
            with zf.open(pdf_name) as src, open(outp, 'wb') as dst:
                dst.write(src.read())
            return outp
    except Exception:
        return ''

def local_etsi_paths(root, ts_raw, version):
    p = parse_ts(ts_raw)
    if not p:
        return []
    series, spec = p
    id_str = etsi_id(series, spec)
    group = etsi_group(id_str)
    vclean = dir_version(version).lstrip('V')
    vdigits = version_digits(version)
    outs = []
    for suf in ['20','50','60','70']:
        rel = os.path.join('etsi', group, id_str, f"{vclean}_{suf}", f"ts_{id_str}v{vdigits}p.pdf")
        outs.append(os.path.join(root, rel))
    return outs

def fetch(url, out_path, timeout=30):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    try:
        # try requests with headers if available
        if requests:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
                'Accept': 'application/pdf,application/octet-stream,*/*',
                'Referer': 'https://www.etsi.org/',
                'Accept-Language': 'en-US,en;q=0.9'
            }
            for _ in range(2):
                try:
                    r = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
                    if r.status_code == 200 and r.content:
                        with open(out_path, 'wb') as f:
                            f.write(r.content)
                        return True
                except Exception:
                    pass
        # fallback to urllib
        req = urllib.request.Request(url, headers={'User-Agent': 'TraeFetcher/1.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        with open(out_path, 'wb') as f:
            f.write(data)
        return True
    except Exception:
        return False

def fetch_rfc(rfc_id, out_root):
    rid = str(rfc_id).strip().lower().replace('rfc','')
    url = f"https://datatracker.ietf.org/doc/html/rfc{rid}"
    out = os.path.join(out_root, 'rfc', f"rfc{rid}.html")
    return fetch(url, out)

def load_jsonl(path):
    items = []
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except Exception:
                pass
    return items

def specs_from_jsonl(items):
    pairs = set()
    rfcs = set()
    for it in items:
        pr = it.get('primary_ref') or {}
        ts = pr.get('ts') or ''
        version = pr.get('version') or ''
        if re.match(r'^\s*RFC\s*\d+\s*$', str(ts), flags=re.I):
            rfcs.add(re.sub(r'\s+', '', str(ts), flags=re.I))
        else:
            if parse_ts(ts) and version:
                pairs.add((ts, version))
    return sorted(pairs), sorted(rfcs)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from-jsonl', dest='jsonl')
    ap.add_argument('--ts', dest='ts')
    ap.add_argument('--version', dest='version')
    ap.add_argument('--rfc', dest='rfc')
    ap.add_argument('--out', dest='out', default=os.path.join('preview', 'specs'))
    ap.add_argument('--scan-only', action='store_true')
    args = ap.parse_args()

    # prepare spec index path early
    index_path = os.path.join('preview', 'specIndex.json')
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            spec_index = json.load(f)
    except Exception:
        spec_index = {}

    to_fetch = []
    rfcs = []
    if args.jsonl:
        items = load_jsonl(args.jsonl)
        pairs, rlist = specs_from_jsonl(items)
        to_fetch.extend(pairs)
        rfcs.extend(rlist)
    if args.ts and args.version:
        to_fetch.append((args.ts, args.version))
    if args.rfc:
        rfcs.append(args.rfc)

    # Optional: scan local mirrors to backfill specIndex
    if args.scan_only:
        for root, dirs, files in os.walk(os.path.join(args.out, 'etsi')):
            for fn in files:
                if not fn.lower().startswith('ts_') or not fn.lower().endswith('p.pdf'):
                    continue
                # pattern: ts_<id>v<digits>p.pdf under .../<group>/<id>/<ver_dir>/
                try:
                    parts = root.replace('\\','/').split('/')
                    # .../etsi/<group>/<id>/<ver_dir>
                    id_str = parts[-2]
                    ver_dir = parts[-1]  # e.g., 18.04.00_60
                    series = id_str[:3]
                    spec = id_str[3:]
                    ts_raw = f"TS {int(series)-100}.{spec}"
                    ver_num = ver_dir.split('_')[0]
                    m = _re.match(r'^(\d+)\.(\d+)\.(\d+)$', ver_num)
                    if not m:
                        continue
                    version = f"V{int(m.group(1))}.{int(m.group(2))}.{int(m.group(3))}"
                    key = f"{ts_raw}@{version}"
                    rel = os.path.relpath(os.path.join(root, fn), start='preview').replace('\\','/')
                    spec_index[key] = f"./{rel}"
                except Exception:
                    continue
        try:
            os.makedirs(os.path.dirname(index_path), exist_ok=True)
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(spec_index, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        return

    ok = 0
    section_index_path = os.path.join('preview', 'specSectionIndex.json')
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            spec_index = json.load(f)
    except Exception:
        spec_index = {}
    for ts_raw, version in to_fetch:
        urls = etsi_candidates(ts_raw, version)
        outs = local_etsi_paths(args.out, ts_raw, version)
        for i in range(min(len(urls), len(outs))):
            url, suf = urls[i]
            outp = outs[i]
            if os.path.exists(outp):
                continue
            if fetch(url, outp):
                ok += 1
                key = f"{str(ts_raw).strip()}@{str(version).strip()}"
                rel = os.path.relpath(outp, start='preview')
                spec_index[key] = f"./{rel.replace('\\','/')}"
                break
        key = f"{str(ts_raw).strip()}@{str(version).strip()}"
        if key not in spec_index:
            alt = fetch_from_3gpp_archive(ts_raw, version, os.path.join('preview','specs'))
            if alt:
                rel = os.path.relpath(alt, start='preview')
                spec_index[key] = f"./{rel.replace('\\','/')}"
    for r in rfcs:
        if fetch_rfc(r, args.out):
            key = f"{str(r).upper()}"
            rel = os.path.join('specs', 'rfc', f"{key.lower()}.html")
            spec_index[key] = f"./{rel.replace('\\','/')}"

    try:
        os.makedirs(os.path.dirname(index_path), exist_ok=True)
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(spec_index, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

if __name__ == '__main__':
    main()
