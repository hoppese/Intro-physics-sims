#!/usr/bin/env python3
"""Pre-class audit: compare the master schedule against what is actually published.

    python3 tools/audit-schedule.py --moodle <pull.psv> [--days 7]

data/schedule.json is the source of truth. This script never writes anything —
it only reports drift, ordered by how soon it affects a class.

SCOPE: the coming week by default (--days, 7). Days outside the window are
skipped, NOT passed — every run prints the window it used, because a clean
report must never be read as "the whole term is fine". --all audits the term
and re-enables the three checks that only mean anything across it.

The Moodle pull needs a logged-in session, so it is not done here. Collect it in
the browser (see tools/README-audit.md) and pass the file in. Without --moodle
the Moodle half is SKIPPED LOUDLY rather than silently passing.

Checks:
  1. Moodle vs schedule.json   points, attempts, Restrict-access open, close,
                               track restriction, existence
  2. course map vs schedule    same days, topics and readings in the same order
  3. internal consistency      non-uniform settings within a kind (e.g. Preps
                               that allow a different number of attempts)
  4. pre-class videos          missing, dead on YouTube, borrowed, over 10 min
  5. readiness deadlines       is each item BUILT by the time it has to be

Readiness rules (Seth, 2026-09-22). Everything for a class has to exist before
the PREVIOUS class meets, so students get it the moment they walk out:

    Prep / video / sims / handouts   ready by the previous class day
    Written + online HW              ready 7 days before it closes
    Kickoff (KO)                     ready the morning of its own class

The KO exception is deliberate: it is gated by Restrict access to open at 9:50
on the day, so building it late costs nothing. Everything else is a real
deadline, and missing one means students have nothing to prepare with.

Content readiness comes from the pull's optional 11th field ("empty"/"ready").
Without it this check can only announce that a deadline has arrived, not
whether the work is done.
"""
import argparse, json, pathlib, re, subprocess, sys, tempfile
from datetime import datetime, date, timedelta

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
        # Optional 11th field: content readiness, "empty" or "ready". Quizzes
        # report it from "No questions have been added yet"; assignments from
        # whether the description or an attachment actually carries problems.
        content = p[10].strip() if len(p) > 10 else ''
        out[int(cmid)] = dict(name=n, mod=mod, cmid=int(cmid),
                              points=float(pts) if pts else None,
                              attempts=int(att) if att else None,
                              opens=ropen or None, closes=close or None,
                              visible=vis == '1',
                              groups=[int(g) for g in grp.split('+') if g],
                              content=content or None)
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
                    help='size of the window to audit, in days (default 7). '
                         'Days beyond it are not checked at all unless --all')
    ap.add_argument('--partial', action='store_true',
                    help='the pull covers only some activities — skip the '
                         '"missing from Moodle" check, which would otherwise '
                         'flag every activity the pull left out')
    ap.add_argument('--all', action='store_true',
                    help='audit the whole term instead of the coming week. Also '
                         'enables the term-wide checks (setting uniformity, video '
                         'totals, activities in Moodle but not on the schedule), '
                         'which are meaningless on a windowed run')
    args = ap.parse_args()

    sched = json.loads(SCHED.read_text(encoding='utf-8'))
    year = int(re.search(r'\d{4}', sched['course']['term']).group(0))
    today = date.today()
    GROUPS = {int(k): v.split()[0] for k, v in sched['course']['groups'].items()}

    # A routine run only cares about the days it can still do something about.
    # Everything outside the window is skipped, not quietly passed — the header
    # says so, because a clean report must never read as "the term is fine".
    horizon = today + timedelta(days=args.days)

    def in_window(when):
        if args.all:
            return True
        return when is not None and today <= when <= horizon

    items = []
    for wk in sched['weeks']:
        for d in wk['days']:
            when = parse_day(d.get('date'), year)
            if not in_window(when):
                continue
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
                if not args.partial:
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
        # Only meaningful against a full pull: on a windowed run everything
        # outside the window is legitimately absent from `seen`.
        if args.all and not args.partial:
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
        # Day count is structural, so compare it however far we are looking.
        if len(cm_days) != len(sc_days):
            add(None, 'DRIFT',
                f"course map has {len(cm_days)} days, schedule has {len(sc_days)}")
        for a, b in zip(cm_days, sc_days):
            if a != b and in_window(parse_day(b[1], year)):
                add(parse_day(b[1], year), 'DRIFT',
                    f"{b[1]}: course map says {a[2]!r} / K{a[3]}, "
                    f"schedule says {b[2]!r} / K{b[3]}")
    except Exception as ex:                                   # noqa: BLE001
        add(None, 'ERROR', f'course-map check failed: {ex}')

    # ---- 3. internal consistency --------------------------------------------
    # Comparing a handful of items against each other says nothing useful, so
    # this is a whole-term check only.
    if args.all:
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
            when = parse_day(d.get('date'), year)
            if not in_window(when):
                continue
            for h in d.get('handouts', []):
                if not (ROOT / h['file']).exists():
                    add(when, 'ERROR',
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
            if not in_window(when):
                continue
            v = d.get('video') or {}
            for suf in ('', '2'):
                if v.get('dead' + suf):
                    add(when, 'ERROR',
                        f"{d.get('date')}: pre-class video is unavailable on YouTube "
                        f"— needs replacing ({topic})")
            if not v.get('id'):
                if 'Catch up' not in topic and 'Review' not in topic:
                    missing.append((when, d.get('date'), ''))
                continue
            if v.get('own') is False:
                borrowed.append((when, d.get('date'), ''))
            if (v.get('mins') or 0) > 10:
                overlong.append((when, d.get('date'), f" ({v['mins']}m)"))

    # Over the term these are a backlog and belong in one line each. Over a
    # single week they are about specific days, so they sort with those days.
    def video_notes(rows, term_line, day_line):
        if not rows:
            return
        if args.all:
            shown = ', '.join(dt + extra for _, dt, extra in rows[:6])
            add(None, 'NOTE', f"{len(rows)} {term_line} — {shown}"
                              f"{'…' if len(rows) > 6 else ''}")
        else:
            for when, dt, extra in rows:
                add(when, 'NOTE', f"{dt}: {day_line}{extra}")

    video_notes(missing, "teaching day(s) have no pre-class video",
                "no pre-class video")
    video_notes(borrowed, "pre-class video(s) are not Seth's own",
                "pre-class video is not yours")
    video_notes(overlong, "pre-class video(s) run over 10 min",
                "pre-class video runs over 10 min")

    # ---- 5. readiness deadlines ----------------------------------------------
    # Seth's rule (2026-09-22): everything for a class must be built before the
    # PREVIOUS class meets, so students get it the moment the prior class ends.
    # Two exceptions, both deliberate:
    #   KO  - opens 9:50 the morning of its own class, so it can be built late.
    #   HW  - students need a week, so it is due ready 7 days before it closes.
    classdays = []
    for wk in sched['weeks']:
        for d in wk['days']:
            when = parse_day(d.get('date'), year)
            if when and not ('No class' in (d.get('topic') or '')):
                classdays.append((when, d))
    classdays.sort(key=lambda t: t[0])
    prev_class = {}
    for i, (when, d) in enumerate(classdays):
        prev_class[when] = classdays[i - 1][0] if i else None

    def ready_by(kind, when):
        if kind == 'KO':
            return when                      # morning of, by design
        if kind in ('HW', 'OHW'):
            return when - timedelta(days=7)  # a week for the students
        return prev_class.get(when)          # prep, video, sims, handouts

    for when, d in classdays:
        if when < today:
            continue
        deadline_items = []
        for e in d.get('due', []):
            rb = ready_by(e['kind'], when)
            if rb is None:
                continue
            m = moodle.get(e['cmid']) if (moodle and e.get('cmid')) else None
            notready = (m or {}).get('content') == 'empty'
            if moodle is None:
                # Can't see content; still surface the deadline as it arrives.
                if today <= rb <= today + timedelta(days=args.days):
                    deadline_items.append(f"{e['label']} (ready by {rb.isoformat()})")
            elif notready and rb <= today + timedelta(days=args.days):
                sev = 'ERROR' if rb <= today else 'DRIFT'
                add(rb, sev, f"{e['label']} for {d.get('date')} has no content in Moodle "
                             f"— needed ready by {rb.isoformat()}"
                             f"{' (PAST DUE)' if rb < today else ''}")
        if deadline_items:
            add(when, 'NOTE', f"{d.get('date')}: build deadline reached for "
                              f"{', '.join(deadline_items)}")
        # The day's own teaching material rides the previous class's deadline.
        rb = prev_class.get(when)
        if rb and today <= rb <= today + timedelta(days=args.days):
            v = d.get('video') or {}
            if v.get('dead'):
                add(rb, 'ERROR', f"{d.get('date')}: pre-class video is dead and this day's "
                                 f"material is due ready by {rb.isoformat()}")
            elif not v.get('id') and 'Catch up' not in (d.get('topic') or ''):
                add(rb, 'DRIFT', f"{d.get('date')}: no pre-class video, due ready by "
                                 f"{rb.isoformat()}")

    # ---- report --------------------------------------------------------------
    soon = [f for f in findings if (f[0] - today).days <= args.days]
    later = [f for f in findings if (f[0] - today).days > args.days]
    order = {'ERROR': 0, 'DRIFT': 1, 'NOTE': 2}

    print(f"Master-schedule audit — {today.isoformat()}")
    if args.all:
        print("  scope: WHOLE TERM (--all)")
    else:
        print(f"  scope: {today.isoformat()} → {horizon.isoformat()} "
              f"({args.days} days). Days outside this window were NOT checked — "
              f"run with --all for the full term.")
    print(f"  {len(items)} scheduled items in scope, "
          f"{sum(1 for _, _, e in items if e.get('cmid'))} linked to Moodle")
    if moodle is not None:
        print(f"  Moodle pull: {len(moodle)} activities")
    print()
    if not findings:
        print('No drift found in scope.' if not args.all else 'No drift found.')
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
