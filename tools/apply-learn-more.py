#!/usr/bin/env python3
"""
Regenerate every sim's Info-overlay "Learn more" block from data/topics.json.

The block is a full-width section at the bottom of the Info modal's grid:
  - OpenStax University Physics (calculus) section links
  - OpenStax College Physics 2e (algebra) section links
  - the topic's pre-class video(s), no vetting badge

Run from the repo root:
    python3 tools/apply-learn-more.py            # dry run — report only
    python3 tools/apply-learn-more.py --apply    # write + node --check each bundle

Only touches sims that already have a "Learn more" block (i.e. the ones this
script installed). Adding it to a new sim: insert a placeholder block first
(see the git history for f7ab979), or extend this script.
"""
import json, re, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "topics.json").read_text())
APPLY = "--apply" in sys.argv
ONLY = [a for a in sys.argv[1:] if not a.startswith("--")]

UP_BASE = DATA["openstax_base"]["up"]
CP_BASE = DATA["openstax_base"]["cp"]
YT = "https://www.youtube.com/watch?v="

# sim -> its topic's video list
SIM_VIDEOS = {}
for tkey, t in DATA["topics"].items():
    for slug in t["sims"]:
        SIM_VIDEOS[slug] = t["videos"]

LAB  = 'style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ffd66b;margin:0 0 10px;"'
SUB  = 'style="font-size:11px;color:#9fb0bf;margin:0 0 5px;"'
SUB2 = 'style="font-size:11px;color:#9fb0bf;margin:9px 0 5px;"'
UL   = 'style="margin:0;padding-left:15px;color:#d7e0e8;font-size:12px;line-height:1.55;"'
A    = 'target="_blank" rel="noopener" style="color:#8fc7ff;text-decoration:none;"'
NOTE = 'style="font-size:10.5px;color:#7d8894;margin:5px 0 0;"'

WRAP_OPEN = ('<div style="grid-column:1/-1;border-top:1px solid rgba(255,255,255,0.12);'
             'margin-top:2px;padding-top:15px;">')


def li(pairs, base):
    return "".join(f'<li><a href="{base}{path}" {A}>{label}</a></li>' for label, path in pairs)


def build_block(rd):
    note = f'<div {NOTE}>{rd["cp_note"]}</div>' if rd.get("cp_note") else ""
    cols = (
        '<div>'
        f'<div {SUB}>OpenStax <em>University&nbsp;Physics</em> — calculus</div>'
        f'<ul {UL}>{li(rd["up"], UP_BASE)}</ul>'
        f'<div {SUB2}>OpenStax <em>College&nbsp;Physics</em> — algebra</div>'
        f'<ul {UL}>{li(rd["cp"], CP_BASE)}</ul>'
        f'{note}'
        '</div>'
    )
    vids = rd["videos"]
    if vids:
        many = len(vids) > 1
        items = ""
        for i, v in enumerate(vids, 1):
            name = f"Pre-class video {i}" if many else "Pre-class video"
            items += f'<li><a href="{YT}{v["id"]}" {A}>{name}</a></li>'
        cols += f'<div><div {SUB}>Video</div><ul {UL}>{items}</ul></div>'
    return (
        f'\n        {WRAP_OPEN}'
        f'<div {LAB}>Learn more</div>'
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px 28px;">'
        f'{cols}</div></div>'
    )


def match_close(s, start):
    """Index just after the </div> that closes the <div> opened just before `start`."""
    depth, i = 1, start
    tok = re.compile(r"<div[\s>]|</div>")
    while depth:
        m = tok.search(s, i)
        depth += -1 if m.group(0) == "</div>" else 1
        i = m.end()
    return i


def process(slug):
    rd = DATA["sim_readings"].get(slug)
    if not rd:
        print(f"  {slug}: no sim_readings entry — SKIP")
        return
    rd = {**rd, "videos": SIM_VIDEOS.get(slug, [])}
    p = ROOT / slug / "index.html"
    s = p.read_text()
    m = re.search(r'(<script type="__bundler/template">)(.*)(</script>)', s, re.S)
    pre, raw, post = m.group(1), m.group(2), m.group(3)
    tpl = json.loads(raw)

    lm = tpl.find(">Learn more</div>")
    if lm < 0:
        print(f"  {slug}: no existing 'Learn more' block — SKIP")
        return
    wrap = tpl.rfind(WRAP_OPEN, 0, lm)
    if wrap < 0 or "Learn more" not in tpl[wrap:wrap + 400]:
        print(f"  {slug}: could not locate block wrapper — SKIP")
        return
    end = match_close(tpl, wrap + len(WRAP_OPEN))
    lead = wrap
    while lead > 0 and tpl[lead - 1] == " ":
        lead -= 1
    if lead > 0 and tpl[lead - 1] == "\n":
        lead -= 1

    old_block = tpl[lead:end]
    new_block = build_block(rd)
    if old_block == new_block:
        print(f"  {slug}: unchanged")
        return
    new_tpl = tpl[:lead] + new_block + tpl[end:]

    for tag, pat in (("div", r"<div[\s>]"), ("ul", r"<ul[\s>]"), ("li", r"<li[\s>]")):
        delta = len(re.findall(pat, new_block)) - len(re.findall(pat, old_block))
        got = len(re.findall(pat, new_tpl)) - len(re.findall(pat, tpl))
        if delta != got or new_tpl.count(f"</{tag}>") - tpl.count(f"</{tag}>") != delta:
            print(f"  {slug}: WARN {tag} balance off")

    out = json.dumps(new_tpl, ensure_ascii=False).replace("</script", "<\\u002Fscript")
    assert json.loads(out) == new_tpl and out.count("</script") == 0 and out.count("\\u002Fscript") == 4
    if not APPLY:
        print(f"  {slug}: would update ({len(old_block)} -> {len(new_block)} chars)")
        return
    p.write_text(s[:m.start()] + pre + out + post + s[m.end():])
    xm = re.search(r'<script type="text/x-dc"[^>]*>(.*?)</script>', new_tpl, re.S)
    r = subprocess.run(["node", "--check", "/dev/stdin"], input=xm.group(1), text=True, capture_output=True)
    print(f"  {slug}: {'OK' if r.returncode == 0 else 'NODE FAIL ' + r.stderr}")


targets = ONLY or list(DATA["sim_readings"])
for slug in targets:
    process(slug)
