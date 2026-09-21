#!/usr/bin/env python3
"""Seed data/schedule.json from the two places the schedule currently lives:

  * course-map-fall-26.html  -> the pedagogical half (dates, topics, readings,
    videos, sims, lesson plans, the Calc/Algebra split)
  * a pull from Moodle       -> the operational half (cmid, points, attempts,
    Restrict-access open, close, track group)

Run once to bootstrap. After that schedule.json is the source of truth and this
script is only of historical interest.

All times are course-local WALL CLOCK strings. Never epochs: Moodle's own form
fields are site-local, and round-tripping them through UTC silently shifts every
due date by the offset.
"""
import json, os, re, sys, subprocess, pathlib

S = pathlib.Path(os.environ.get('SCRATCH', '.'))
ROOT = pathlib.Path('/Users/hoppese/Documents/GitHub/Intro-physics-sims')

# ---- 1. the course map's own day array -------------------------------------
days_json = json.loads((S / 'coursemap_days.json').read_text())
cmids = json.loads((S / 'cmid_tables.json').read_text())
KO_CMID, PREP_CMID, HW_CMID = cmids['KO_CMID'], cmids['PREP_CMID'], cmids['HW_CMID']

# ---- 2. the Moodle pull -----------------------------------------------------
MOODLE = {}
for line in (S / 'moodle_pull.psv').read_text().strip().splitlines():
    n, mod, cmid, pts, att, ropen, qopen, close, vis, grp = line.split('|')
    MOODLE[n] = dict(name=n, mod=mod, cmid=int(cmid),
                     points=float(pts) if pts else None,
                     attempts=int(att) if att else None,
                     opens=ropen or None, closes=close or None,
                     visible=vis == '1',
                     groups=[int(g) for g in grp.split('+') if g])

GROUP_NAMES = {4974: 'calc', 4975: 'alg'}       # Moodle group id -> track

# ---- 3. replicate the map's implicit KO/Prep/OHW numbering ------------------
# (lifted from the course map's own render code so the two agree exactly)
koNo, prepNo, wpNo = {}, {}, {}
_kn = _pn = _wn = 0
for wi, wk in enumerate(days_json):
    for di, d in enumerate(wk['days']):
        f0 = (wi == 0 and di == 0)
        key = f'{wi}-{di}'
        if not f0 and not d.get('test') and not d.get('special'):
            _kn += 1; koNo[key] = _kn
        if not f0 and not d.get('test') and not d.get('special') and not d.get('buffer'):
            _pn += 1; prepNo[key] = _pn
        if (not f0 and not d.get('test') and not d.get('special')
                and not d.get('hw') and not d.get('_afterTest')):
            _wn += 1; wpNo[key] = _wn


def look(name):
    """Moodle record by exact activity name, or None if it does not exist yet."""
    return MOODLE.get(name)


def entry(kind, label, rec, track='both', fallback_pts=None):
    e = {'kind': kind, 'label': label, 'track': track}
    if rec:
        e.update(cmid=rec['cmid'], module=rec['mod'],
                 points=rec['points'] if rec['points'] is not None else fallback_pts,
                 attempts=rec['attempts'], opens=rec['opens'], closes=rec['closes'],
                 visible=rec['visible'])
        tracks = [GROUP_NAMES.get(g, f'group{g}') for g in rec['groups']]
        if tracks:
            e['track'] = tracks[0] if len(tracks) == 1 else tracks
    else:
        e.update(cmid=None, module=None, points=fallback_pts,
                 attempts=None, opens=None, closes=None, visible=None,
                 note='not in Moodle (Mastering, or not yet created)')
    return e


weeks = []
missing = []
for wi, wk in enumerate(days_json):
    w = {'n': wk['n'], 'unit': wk['unit'], 'range': wk['range'], 'days': []}
    for di, d in enumerate(wk['days']):
        key = f'{wi}-{di}'
        day = {k: d[k] for k in ('dow', 'date', 'topic') if k in d}
        for k in ('reading', 'video', 'sim', 'plan', 'calc', 'alg',
                  'test', 'special', 'buffer'):
            if k in d:
                day[k] = d[k]
        day['split'] = bool(d.get('split'))
        due = []
        alg_skip_kp = bool(d.get('algSkipKoPrep'))
        if key in koNo:
            n = koNo[key]
            due.append(entry('KO', f'KO {n}', look(f'KO {n}'),
                             'calc' if alg_skip_kp else 'both', 2))
        if key in prepNo:
            n = prepNo[key]
            due.append(entry('Prep', f'Prep {n}', look(f'Class Prep {n}'),
                             'calc' if alg_skip_kp else 'both', 3))
        if key in wpNo:
            n = wpNo[key]
            rec = look(f'Online HW {n}')
            e = entry('OHW', f'OHW {n}', rec,
                      'calc' if d.get('algSkipOhw') else 'both', 6)
            if not rec:
                e['note'] = 'lives in Mastering, not Moodle'
            due.append(e)
        if d.get('hw'):
            h = d['hw']
            rec = look(f'Written HW {h}') or look(f'Written HW {h} - PHYS 235')
            due.append(entry('HW', f'HW {h}', rec,
                             'calc' if d.get('algSkipHw') else 'both', 18))
        if d.get('algHw'):
            h = d['algHw']
            rec = look(f'Written HW 3 - PHYS 230 - {h[-1]}') or look(f'Written HW {h}')
            due.append(entry('HW', f'HW {h}', rec, 'alg', d.get('algHwPts')))
        if d.get('algQuiz'):
            q = d['algQuiz']
            rec = look(f'Electrostatics {q} - PHYS 230')
            due.append(entry('Quiz', q, rec, 'alg', 5))
        if d.get('test'):
            rec = None
            for cand in MOODLE:
                if cand.startswith('Midterm') and d.get('test') and cand.split()[1] == str(d['test']):
                    rec = MOODLE[cand]; break
            due.append(entry('Test', f"Test {d['test']}", rec, 'both', 50))
        for e in due:
            if e['cmid'] is None and e.get('note', '').startswith('not in Moodle'):
                missing.append((day.get('date'), e['label']))
        day['due'] = due
        w['days'].append(day)
    weeks.append(w)

out = {
    '_comment': [
        'MASTER SCHEDULE - single source of truth for PHYS 230/235, Fall 2026.',
        'Times are course-local wall clock (America/Indiana/Indianapolis). Never epochs.',
        '"opens" is the Restrict-access date, which is how this course gates activities;',
        'the quiz-level open date is deliberately left unset throughout.',
        'track: both | calc | alg. Derived from the Moodle group restriction where one exists.',
        'Consumed by: the master-schedule viewer, the course-map generator, and the',
        'pre-class audit. Seeded 2026-09-21 from course-map-fall-26.html + a live Moodle pull.',
    ],
    'course': {'name': 'PHYS 230 / 235', 'term': 'Fall 2026', 'moodleCourseId': 4157,
               'timezone': 'America/Indiana/Indianapolis',
               'groups': {'4974': 'calc (PHYS 235)', '4975': 'alg (PHYS 230)'}},
    'weeks': weeks,
}

dest = ROOT / 'data' / 'schedule.json'
dest.write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')

n_due = sum(len(d['due']) for w in weeks for d in w['days'])
linked = sum(1 for w in weeks for d in w['days'] for e in d['due'] if e['cmid'])
print(f'wrote {dest}')
print(f'  weeks {len(weeks)}  days {sum(len(w["days"]) for w in weeks)}  due-items {n_due}')
print(f'  linked to a Moodle activity: {linked}/{n_due}')
if missing:
    print('  NOT found in Moodle:')
    for dt, lb in missing:
        print(f'    {dt}: {lb}')
