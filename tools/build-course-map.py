#!/usr/bin/env python3
"""
Sync the per-topic video / reading / sim-name fields in the course map from
shared/topics.json (a copy of the sims repo's data/topics.json — refresh it
first with tools/sync-topics.sh).

Only the days listed in DAY_TOPIC below are touched, and within each only:
  video:{…}   (id / id2 / st, rebuilt from the topic's videos)
  sim:sim('…' (the display name only — the blurb is left alone)

Readings stay hand-authored: Knight sections don't churn, and a topic can span
two class days with different sections (e.g. Gauss's law over Sep 21 + Sep 23).

Everything else in course-map-fall-26.html — dates, lecture plans, HW/test
markers, special days, the whole rest of the term — is hand-authored and
untouched.

    python3 tools/build-course-map.py            # dry run
    python3 tools/build-course-map.py --apply
"""
import json, re, sys, subprocess, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CM = ROOT / "course-map" / "course-map-fall-26.html"
TOPICS = json.loads((ROOT / "data" / "topics.json").read_text())
APPLY = "--apply" in sys.argv

# course-map day (by date) -> topics.json topic key
DAY_TOPIC = {
    "Aug 26": "shm-intro",
    "Aug 28": "shm-energy",
    "Aug 31": "vertical-oscillations-pendulum",
    "Sep 2":  "traveling-waves",
    "Sep 4":  "waves-on-strings",
    "Sep 7":  "interference",
    "Sep 11": "charge-conductors-insulators",
    "Sep 14": "coulomb-field",
    "Sep 16": "field-superposition",
    "Sep 18": "charge-distributions",
    "Sep 21": "gauss-law",
    "Sep 23": "gauss-law",
    "Sep 25": "electric-pe",
    "Sep 28": "electric-potential",
}


def video_literal(videos):
    """topics.json video list -> the course-map `video:{…}` object literal, or None to leave as-is."""
    if not videos:
        return None
    ids = [v["id"] for v in videos]
    st = videos[0].get("status", "unv")
    inner = f"id:'{ids[0]}'"
    if len(ids) > 1:
        inner += f",id2:'{ids[1]}'"
    inner += f",st:'{st}'"
    return "{" + inner + "}"


def main():
    s = CM.read_text()
    m = re.search(r'(<script type="__bundler/template">)(.*)(</script>)', s, re.S)
    pre, raw, post = m.group(1), m.group(2), m.group(3)
    tpl = json.loads(raw)

    i0 = tpl.find("const data=[")
    i1 = tpl.find("return data;", i0)
    head, block, tail = tpl[:i0], tpl[i0:i1], tpl[i1:]

    # split the weeksData block into per-day chunks (each day object starts "{dow:")
    parts = re.split(r"(?=\{dow:')", block)
    changes = []
    for idx, chunk in enumerate(parts):
        dm = re.search(r"date:'([^']+)'", chunk)
        if not dm or dm.group(1) not in DAY_TOPIC:
            continue
        date = dm.group(1)
        topic = TOPICS["topics"][DAY_TOPIC[date]]
        new_chunk = chunk

        # video (skip if the topic has none — keep the hand-written {none:1,note:…})
        vlit = video_literal(topic["videos"])
        if vlit:
            new_chunk = re.sub(r"video:\{[^{}]*\}", "video:" + vlit, new_chunk, count=1)

        # sim display name (only if the day features a sim inline)
        if "sim:sim(" in new_chunk:
            primary = topic["sims"][0]
            title = TOPICS["sim_titles"].get(primary, primary)
            title_js = title.replace("\\", "\\\\").replace("'", "\\'")
            new_chunk = re.sub(r"sim:sim\('[^']*'", f"sim:sim('{title_js}'", new_chunk, count=1)

        if new_chunk != chunk:
            parts[idx] = new_chunk
            changes.append(date)

    new_block = "".join(parts)
    if not changes:
        print("no changes")
        return
    print("updated days:", ", ".join(changes))

    new_tpl = head + new_block + tail
    if not APPLY:
        # show a focused diff of the changed spans
        for d in changes:
            old = next(c for c in re.split(r"(?=\{dow:')", block) if f"date:'{d}'" in c)
            new = next(c for c in parts if f"date:'{d}'" in c)
            for o_line, n_line in zip(old.split("\n"), new.split("\n")):
                if o_line != n_line:
                    print(f"  {d}:\n    - {o_line.strip()}\n    + {n_line.strip()}")
        return

    # course-map is exported sim-bundle style: literal </ everywhere, only the
    # two </script re-escaped so they don't close the <script> tag early.
    out = json.dumps(new_tpl, ensure_ascii=False).replace("</script", "<\\u002Fscript")
    assert json.loads(out) == new_tpl
    assert out.count("</script") == 0
    new_s = s[:m.start()] + pre + out + post + s[m.end():]
    # sanity: only the intended day-chunks differ from what's on disk
    diff = subprocess.run(["diff", str(CM), "-"], input=new_s, text=True, capture_output=True)
    hunks = diff.stdout.count("\n> ")
    print(f"diff: {hunks} changed lines" + ("" if hunks <= len(changes) + 2 else "  (!! expected ~%d)" % len(changes)))
    CM.write_text(new_s)
    print("applied")


main()
