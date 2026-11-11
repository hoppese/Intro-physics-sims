#!/usr/bin/env python3
"""Extract / re-apply the dc-script of a sim bundle, and keep the shared G3 3D kit in sync.

A sim is one generated file, <slug>/index.html. Its page lives as a JSON string inside
<script type="__bundler/template">, and the app logic is the <script type="text/x-dc"> inside that.

  python3 tools/sim-script.py extract <slug> [out.js]   write the sim's dc-script to a file (default /tmp/<slug>.js)
  python3 tools/sim-script.py apply   <slug> <file.js>  put an edited script back into the bundle
  python3 tools/sim-script.py rekit   [slug ...]        re-inline tools/g3-kit.js (default: every sim that has it)
  python3 tools/sim-script.py check   [slug ...]        report sims whose inlined kit differs from tools/g3-kit.js

`apply` and `rekit` replace the /* G3-KIT-BEGIN ... G3-KIT-END */ block with the current tools/g3-kit.js
whenever the script uses `G3.`, run `node --check`, re-serialise with every `</` escaped, and verify the
bundle round-trips and that nothing outside the dc-script changed. Edit the kit ONLY in tools/g3-kit.js,
then run `rekit`. Always look at the sim in a browser afterwards: none of these checks see pixels.
"""
import sys, re, json, os, subprocess, tempfile, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT_PATH = os.path.join(ROOT, 'tools', 'g3-kit.js')
KRE = re.compile(r'/\* G3-KIT-BEGIN.*?/\* G3-KIT-END \*/\n?', re.S)
TRE = re.compile(r'(<script type="__bundler/template"[^>]*>)(.*?)(</script>)', re.S)
SRE = re.compile(r'(<script type="text/x-dc"[^>]*>)(.*?)(</script>)', re.S)
CLASS = 'class Component extends DCLogic'


def kit():
    return open(KIT_PATH, encoding='utf-8').read().strip() + '\n'


def load(slug):
    path = os.path.join(ROOT, slug, 'index.html')
    raw = open(path, encoding='utf-8').read()
    ms = TRE.findall(raw)
    if len(ms) != 1:
        sys.exit(f'{slug}: expected exactly one bundler template, found {len(ms)}')
    m = TRE.search(raw)
    tpl = json.loads(m.group(2))
    s = SRE.search(tpl)
    if not s:
        sys.exit(f'{slug}: no text/x-dc script in the template')
    return path, raw, m, tpl, s


def with_kit(js):
    js = KRE.sub('', js)
    if 'G3.' in js:
        if CLASS not in js:
            sys.exit('script uses G3. but has no "class Component extends DCLogic" to anchor the kit')
        i = js.index(CLASS)
        js = js[:i] + kit() + js[i:]
    return js


def node_check(slug, js):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t:
        t.write('class DCLogic{}\n' + js)
        name = t.name
    try:
        r = subprocess.run(['node', '--check', name], capture_output=True, text=True)
    finally:
        os.unlink(name)
    if r.returncode:
        sys.exit(f'{slug}: SYNTAX ERROR, bundle not touched\n{r.stderr[:1500]}')


def write(slug, js):
    path, raw, m, tpl, s = load(slug)
    js = with_kit(js)
    node_check(slug, js)
    if js == s.group(2):
        print(f'{slug}: unchanged')
        return
    new_tpl = tpl[:s.start(2)] + js + tpl[s.end(2):]
    ser = json.dumps(new_tpl, ensure_ascii=False).replace('</', '<\\u002F')
    assert '</' not in ser
    out = raw[:m.start(2)] + ser + raw[m.end(2):]
    chk = TRE.search(out)
    assert len(TRE.findall(out)) == 1 and json.loads(chk.group(2)) == new_tpl, f'{slug}: round-trip failed'
    open(path, 'w', encoding='utf-8').write(out)
    print(f'{slug}: OK  script {len(s.group(2))} -> {len(js)} chars')


def kit_sims():
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, '*', 'index.html'))):
        if 'G3-KIT-BEGIN' in open(p, encoding='utf-8').read():
            out.append(os.path.basename(os.path.dirname(p)))
    return out


def main(a):
    if len(a) < 1 or a[0] not in ('extract', 'apply', 'rekit', 'check'):
        sys.exit(__doc__)
    cmd, rest = a[0], a[1:]
    if cmd == 'extract':
        if not rest:
            sys.exit(__doc__)
        slug = rest[0].strip('/')
        dest = rest[1] if len(rest) > 1 else os.path.join(tempfile.gettempdir(), slug + '.js')
        open(dest, 'w', encoding='utf-8').write(load(slug)[4].group(2))
        print(f'{slug}: script written to {dest}')
    elif cmd == 'apply':
        if len(rest) != 2:
            sys.exit(__doc__)
        write(rest[0].strip('/'), open(rest[1], encoding='utf-8').read())
    elif cmd == 'rekit':
        for slug in (rest or kit_sims()):
            slug = slug.strip('/')
            write(slug, load(slug)[4].group(2))
    else:
        stale = 0
        for slug in (rest or kit_sims()):
            slug = slug.strip('/')
            cur = KRE.search(load(slug)[4].group(2))
            ok = bool(cur) and cur.group(0).strip() == kit().strip()
            stale += 0 if ok else 1
            print(f'{slug}: {"in sync" if ok else "STALE (run rekit)"}')
        sys.exit(1 if stale else 0)


if __name__ == '__main__':
    main(sys.argv[1:])
