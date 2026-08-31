# Roadmap — Intro Physics II teaching stack

Running list of what we're building. Claude keeps this current — ask
"what's on the roadmap?" / "what should we work on?" any time there's a lull.

## Now / in progress

- **All class content lives in this repo**, under `assessments/`, organized by type:
  | dir | what | status |
  |---|---|---|
  | `kickoffs/` | in-class retrieval warm-ups (Moodle XML) | KO 0–4 done |
  | `class-preps/` | pre-class sim quizzes (Moodle XML) | Prep 1–5 done |
  | `In-class-practice/` | practice problem sets (PDF) | HW1 practice added |
  | `written-hw/` | the written homework | **TODO — add it** |
  | `online-hw/` | current online HW + its eventual replacement | **TODO — add it** |
- **Local Moodle** for previewing questions before importing — `~/moodle-local/`
  (Docker, `erseco/alpine-moodle`). Set up 2026-08-31.
- Keep filling the assessment banks as the term advances: KO 5+, Prep 6+, plus the
  written/online HW sets.

## Next semester — the big one: replace Mastering Physics

**Goal:** online homework that runs on our own stack (the sims + a question engine),
with grades landing in Moodle automatically. **Target: start of spring term.**

Design questions to settle before building:
- **Native Moodle quizzes vs. external site + LTI.**
  - *Native:* online HW = Moodle quizzes with sim-embedded questions, exactly like
    the preps/kickoffs. Grading is built in — nothing to integrate. Least work.
  - *External:* an HW app on `sethhopper.com`, grades pushed to Moodle via LTI 1.3
    (Assignment & Grade Services). More flexible, much more to build and run.
- How much can the sims' own check / worked-example flow carry vs. Moodle question types?
- A question-authoring pipeline — hand-editing `assessments/*.xml` works for a handful
  but won't scale to full problem sets.

## Opportunistic / small

- Tighten the bug-worker `ALLOWED_ORIGINS` (currently `*`) to the Moodle host once known.
- Normalize `assessments/` subdir naming (`In-class-practice` → `in-class-practice`).
- Fix display quirks (pre-existing): `polarization-malus` "r.sym" label,
  `pe-vs-separation` "vatr → ∞".
- Optional IP rate-limit on the bug-worker (Cloudflare KV namespace).
- Split `class-preps/prep1-5.xml` into per-prep files if the batch file gets unwieldy.

---
*How the "prompt me" part works: Claude can't message between sessions, but will
surface this list when a session wraps up or when you ask what's next.*
