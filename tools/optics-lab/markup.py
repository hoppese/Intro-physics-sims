#!/usr/bin/env python3
"""Put tools/optics-lab/markup.html (the page around the canvas) into optics-lab/index.html.

    python3 tools/optics-lab/markup.py            write the markup into the bundle
    python3 tools/optics-lab/markup.py --create   make the bundle first, from Circuit Lab's

The bundle keeps the page as one JSON string inside <script type="__bundler/template">.
Inside it, everything from the end of <helmet> to </x-dc> is the markup; the component's
code follows in a text/x-dc script, which tools/sim-script.py owns. This script touches
only the markup and checks that nothing else moved.

--create copies circuit-lab/index.html (its manifest of fonts, React, KaTeX and the runtime is
the same for every sim) and gives it this page's markup and a stub component.
"""
import json, re, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BUNDLE = ROOT / 'optics-lab' / 'index.html'
DONOR = ROOT / 'circuit-lab' / 'index.html'
TRE = re.compile(r'(<script type="__bundler/template"[^>]*>)(.*?)(</script>)', re.S)
SRE = re.compile(r'(<script type="text/x-dc"[^>]*>)(.*?)(</script>)', re.S)
STUB = "\nclass Component extends DCLogic {\n  renderVals() { return {}; }\n}\n"


def split(tpl):
    """(head through </helmet>, markup, tail from </x-dc>)"""
    a = tpl.index('</helmet>') + len('</helmet>')
    b = tpl.rindex('</x-dc>')
    assert a < b, 'template has no markup between </helmet> and </x-dc>'
    return tpl[:a], tpl[a:b], tpl[b:]


def main():
    create = '--create' in sys.argv
    if create:
        if BUNDLE.exists():
            sys.exit(f'{BUNDLE} already exists; not overwriting it')
        BUNDLE.parent.mkdir(exist_ok=True)
        shutil.copyfile(DONOR, BUNDLE)
    raw = BUNDLE.read_text(encoding='utf-8')
    found = TRE.findall(raw)
    assert len(found) == 1, f'expected one template, found {len(found)}'
    m = TRE.search(raw)
    tpl = json.loads(m.group(2))
    head, old, tail = split(tpl)
    if create:                                   # the donor's component goes too
        s = SRE.search(tail)
        assert s, 'donor has no component script'
        tail = tail[:s.start(2)] + STUB + tail[s.end(2):]
    body = (HERE / 'markup.html').read_text(encoding='utf-8').strip('\n')
    assert '</x-dc>' not in body and '<script' not in body, 'markup.html must hold markup only'
    new = head + '\n\n' + body + '\n' + tail
    if new == tpl:
        print('optics-lab: markup already up to date')
        return
    ser = json.dumps(new, ensure_ascii=False).replace('</', '<\\u002F')
    assert '</' not in ser
    out = raw[:m.start(2)] + ser + raw[m.end(2):]
    again = json.loads(TRE.search(out).group(2))
    assert again == new and len(TRE.findall(out)) == 1
    h2, _, t2 = split(again)
    assert h2 == head and t2 == tail, 'something outside the markup changed'
    assert out[:m.start(2)] == raw[:m.start(2)] and out[m.start(2) + len(ser):] == raw[m.end(2):]
    BUNDLE.write_text(out, encoding='utf-8')
    print(f'optics-lab: markup written ({len(old)} -> {len(body) + 3} characters)')


if __name__ == '__main__':
    main()
