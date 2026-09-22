#!/usr/bin/env python3
"""Pre-class audit: compare the master schedule against what is actually published.

    python3 tools/audit-schedule.py --moodle <pull.psv> [--days 7]

data/schedule.json is the source of truth. This script never writes anything —
it only reports drift, ordered by how soon it affects a class.

The Moodle pull needs a logged-in session, so it is not done here. Collect it in
the browser (see tools/README-audit.md) and pass the file in. Without --moodle
the Moodle half is SKIPPED LOUDLY rather than silently passing.

Checks:
  1. Moodle vs schedule.json   points, attempts, Restrict-access open, close,
                               track restriction, existence
  2. course map vs schedule    same days, topics and readings in the same order
  3. internal consistency      non-uniform settings within a kind (e.g. Preps
                               that allow a different number of attempts)
"""
import argparse, json, pathlib, re, subprocess, sys, tempfile
from datetime import datetime, date

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHED = ROOT / 'data' / 'schedule.json'
CMAP = ROOT / 'course-map' / 'course-map-fall-26.html'

FIELDS = [('points', 'points'), ('attempts', 'attempts'),
          ('opens', 'opens'), ('closes', 'closes')]


def load_moodle(path):
    """name -> record, from the pipe-separated pull."""
    out = {}
    for line in pathlib.Path(path).read_text().strip().splitlines():
        p = line.split('|')
        if len(p) < 10:
            continue
        n, mod, cmid, pts, att, ropen, _qopen, close, vis, grp = p[:10]
        out[int(cmid)] = dict(name=n, mod=mod, cmid=int(cmid),
                              points=float(pts) if pts else None,
                              attempts=int(att) if att else None,
                              opens=ropen or None, closes=close or None,
                              visible=vis == '1',
                              groups=[int(g) for g in grp.split('+') if g])
    return out


def course_map_days():
    """Evaluate the course map's own weeksData() so we compare like with like."""
    raw = CMAP.read_text(encoding='utf-8')
    m = re.search(r'<script type="__bundler/template">(.*?)</script>', raw, re.S)
    tmpl = json.loads(m.group(1))
    i = tmpl.find('weeksData(){')
    j = tmpl.index('{', i + len('weeksData') - 1)
    depth, k = 0, j
    while k < len(tmpl):
        if tmpl[k] == '{':
            depth += 1
        elif tmpl[k] == '}':
            depth -= 1
            if depth == 0:
                break
        k += 1
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write('const f=function()' + tmpl[j:k + 1] +
                ';process.stdout.write(JSON.stringify(f()));')
        tmp = f.name
    r = subprocess.run(['node', tmp], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError('could not evaluate the course map: ' + r.stderr[:200])
    return json.loads(r.stdout)


def parse_day(datestr, year):
    m = re.match(r'^([A-Za-z]{3})\s+(\d+)', str(datestr))
    if not m:
        return None
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    if m.group(1) not in months:
        return None
    return date(year, months.index(m.group(1)) + 1, int(m.group(2)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--moodle', help='pipe-separated Moodle pull')
    ap.add_argument('--days', type=int, default=7,
                    help='how far ahead counts as "soon" (default 7)')
    args = ap.parse_args()

    sched = json.loads(SCHED.read_text(encoding='utf-8'))
    year = int(re.search(r'\d{4}', sched['course']['term']).group(0))
    today = date.today()
    GROUPS = {int(k): v.split()[0] for k, v in sched['course']['groups'].items()}

    items = []
    for wk in sched['weeks']:
        for d in wk['days']:
            when = parse_day(d.get('date'), year)
            for e in d.get('due', []):
                items.append((when, d.get('date'), e))

    findings = []   # (sort_date, severity, line)

    def add(when, sev, line):
        findings.append((when or date(year, 12, 31), sev, line))

    # ---- 1. Moodle -----------------------------------------------------------
    if not args.moodle:
        print('!! MOODLE CHECK SKIPPED — no --moodle pull supplied.')
        print('   The Moodle half of this audit did NOT run. Do not read a clean')
        print('   report below as "Moodle is fine".\n')
        moodle = None
    else:
        moodle = load_moodle(args.moodle)
        seen = set()
        for when, datestr, e in items:
            if not e.get('cmid'):
                continue
            seen.add(e['cmid'])
            rec = moodle.get(e['cmid'])
            if rec is None:
                add(when, 'ERROR',
                    f"{datestr} {e['label']}: cmid {e['cmid']} is in the schedule "
                    f"but not in Moodle (deleted or moved?)")
                continue
            for sk, mk in FIELDS:
                sv, mv = e.get(sk), rec.get(mk)
                if sv is None and mv is None:
                    continue
                if sk == 'points' and sv is not None and mv is not None:
                    same = abs(float(sv) - float(mv)) < 1e-6
                else:
                    same = sv == mv
                if not same:
                    add(when, 'DRIFT',
                        f"{datestr} {e['label']}: {sk} — schedule {sv!r}, Moodle {mv!r}")
            want = e.get('track')
            got = [GROUPS.get(g, str(g)) for g in rec['groups']]
            got_track = got[0] if len(got) == 1 else ('both' if not got else got)
            if want != got_track:
                add(when, 'DRIFT',
                    f"{datestr} {e['label']}: track — schedule {want!r}, "
                    f"Moodle group says {got_track!r}")
            if not rec['visible']:
                add(when, 'NOTE', f"{datestr} {e['label']}: hidden from students in Moodle")
        extra = [r for c, r in moodle.items()
                 if c not in seen and not r['name'].startswith('Course')]
        for r in sorted(extra, key=lambda r: r['name']):
            add(None, 'NOTE',
                f"in Moodle but not on the schedule: {r['name']} (cmid {r['cmid']})")

    # ---- 2. course map -------------------------------------------------------
    try:
        cm = course_map_days()
        cm_days = [(w['n'], d.get('date'), d.get('topic'), d.get('reading'))
                   for w in cm for d in w['days']]
        sc_days = [(w['n'], d.get('date'), d.get('topic'), d.get('reading'))
                   for w in sched['weeks'] for d in w['days']]
        if len(cm_days) != len(sc_days):
            add(None, 'DRIFT',
                f"course map has {len(cm_days)} days, schedule has {len(sc_days)}")
        for a, b in zip(cm_days, sc_days):
            if a != b:
                add(parse_day(b[1], year), 'DRIFT',
                    f"{b[1]}: course map says {a[2]!r} / K{a[3]}, "
                    f"schedule says {b[2]!r} / K{b[3]}")
    except Exception as ex:                                   # noqa: BLE001
        add(None, 'ERROR', f'course-map check failed: {ex}')

    # ---- 3. internal consistency --------------------------------------------
    by_kind = {}
    for when, _dt, e in items:
        if e.get('cmid'):
            by_kind.setdefault(e['kind'], []).append(e)
    for kind, es in sorted(by_kind.items()):
        for field in ('points', 'attempts'):
            vals = {}
            for e in es:
                vals.setdefault(e.get(field), []).append(e['label'])
            if len(vals) > 1:
                parts = '; '.join(f"{v}: {len(l)} ({', '.join(l[:3])}"
                                  f"{'…' if len(l) > 3 else ''})"
                                  for v, l in sorted(vals.items(),
                                                     key=lambda x: (x[0] is None, x[0])))
                add(None, 'NOTE', f"{kind} {field} is not uniform — {parts}")

    # Handouts are printed on paper the morning of class, so a broken path is
    # only discovered when there is no time left to fix it.
    for wk in sched['weeks']:
        for d in wk['days']:
            for h in d.get('handouts', []):
                if not (ROOT / h['file']).exists():
                    add(parse_day(d.get('date'), year), 'ERROR',
                        f"{d.get('date')}: handout missing from the repo — "
                        f"{h['file']} ({h.get('name', '?')})")

    # ---- 4. pre-class videos -------------------------------------------------
    # Standing goal: every teaching day has a video, it is Seth's own, and it
    # runs 10 minutes or less. Flex/catch-up days are exempt from the first.
    missing, borrowed, overlong = [], [], []
    for wk in sched['weeks']:
        for d in wk['days']:
            topic = d.get('topic') or ''
            if d.get('special') or 'No class' in topic:
                continue
            when = parse_day(d.get('date'), year)
            v = d.get('video') or {}
            for suf in ('', '2'):
                if v.get('dead' + suf):
                    add(when, 'ERROR',
                        f"{d.get('date')}: pre-class video is unavailable on YouTube "
                        f"— needs replacing ({topic})")
            if not v.get('id'):
                if 'Catch up' not in topic and 'Review' not in topic:
                    missing.append(d.get('date'))
                continue
            if v.get('own') is False:
                borrowed.append(d.get('date'))
            if (v.get('mins') or 0) > 10:
                overlong.append(f"{d.get('date')} ({v['mins']}m)")
    if missing:
        add(None, 'NOTE', f"{len(missing)} teaching day(s) have no pre-class video — "
                          f"{', '.join(missing)}")
    if borrowed:
        add(None, 'NOTE', f"{len(borrowed)} pre-class video(s) are not Seth's own — "
                          f"{', '.join(borrowed[:6])}"
                          f"{'…' if len(borrowed) > 6 else ''}")
    if overlong:
        add(None, 'NOTE', f"{len(overlong)} pre-class video(s) run over 10 min — "
                          f"{', '.join(overlong[:6])}"
                          f"{'…' if len(overlong) > 6 else ''}")

    # ---- report --------------------------------------------------------------
    soon = [f for f in findings if (f[0] - today).days <= args.days]
    later = [f for f in findings if (f[0] - today).days > args.days]
    order = {'ERROR': 0, 'DRIFT': 1, 'NOTE': 2}

    print(f"Master-schedule audit — {today.isoformat()}")
    print(f"  {len(items)} scheduled items, "
          f"{sum(1 for _, _, e in items if e.get('cmid'))} linked to Moodle")
    if moodle is not None:
        print(f"  Moodle pull: {len(moodle)} activities")
    print()
    if not findings:
        print('No drift found.')
        return 0
    for title, group in (('NEEDS ACTION (next %d days)' % args.days, soon),
                         ('Later / informational', later)):
        if not group:
            continue
        print(title)
        for _when, sev, line in sorted(group, key=lambda f: (f[0], order[f[1]])):
            print(f'  [{sev}] {line}')
        print()
    return 1 if any(s in ('ERROR', 'DRIFT') for _, s, _ in findings) else 0


if __name__ == '__main__':
    sys.exit(main())
