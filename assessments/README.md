# Assessments — Kickoffs & Class Preps

Moodle question-bank XML for the two low-stakes assessment streams in Intro
Physics II. Edit the `.xml` here when new ideas come up, then re-import into
Moodle.

```
assessments/
  kickoffs/     ko0-ko4.xml     — in-class retrieval warm-ups (conceptual, no sim)
  class-preps/  prep1-5.xml     — pre-class, sim-based (one embedded sim per question)
```

Both streams track the [course map](../course-map/course-map-fall-26.html)
day for day.

## What each stream is

| | Kickoffs | Class Preps |
|---|---|---|
| When | first ~5 min of class | due at class start |
| Style | conceptual / one-line numericals | do something in that day's sim, read the result |
| Points | ~2 pts each | 3 pts each (quiz max grade set to 3) |
| Questions | 2 per day | 4 per day |
| Attempts | 2, deferred feedback | 2, deferred feedback |

**Feedback model (both):** *Specific* per-answer feedback diagnoses the mistake
without giving the answer — shown between attempts. *General* feedback is the
full worked solution with the number — withheld until the quiz closes. Numerical
questions carry a `*` catch-all answer. Matching questions carry one extra
distractor with no prompt, so elimination alone doesn't finish them.

The full required Moodle quiz settings are in the comment block at the end of
each `.xml` file.

## Coverage (Fall 2026)

Kickoff `KO n` and Class Prep `Prep n` line up with these course-map days:

| # | Kickoff (in class) | Class Prep (due) | Topic | Knight | Prep sim |
|---|---|---|---|---|---|
| 0 / — | Wed Aug 26 | — | SHM — introduction | 15.1–2 | — |
| 1 | Fri Aug 28 | Fri Aug 28 | SHM — energy & dynamics | 15.3–4 | energy-in-shm |
| 2 | Mon Aug 31 | Mon Aug 31 | Vertical oscillations + pendulum | 15.5–6 | pendulum |
| 3 | Wed Sep 2 | Wed Sep 2 | Traveling / standing / superposition | 16.1–3 | wave-explorer |
| 4 | Fri Sep 4 | Fri Sep 4 | Waves on strings + music | 17.1–2 | string-harmonics |
| — / 5 | — | Mon Sep 7 | Interference | 17.3–5 | two-source-interference |

(Kickoffs start at KO 0 on the first day; Class Preps start at Prep 1 and are due
*at* the class they prepare for. So on a given day, `KO n` and `Prep n` cover the
same material — except the endpoints: there is no Prep for day 0, and Prep 5 runs
one class ahead of KO 4.)

Add future files alongside these as `ko5-ko9.xml`, `prep6-10.xml`, etc.

## Importing into Moodle

1. Course → Question bank → Import → **Moodle XML format** → upload the file.
2. The `<question type="category">` markers auto-create the categories
   (`Kickoffs / KO n`, `Class Prep / Prep n`).
3. In each quiz: *Add → from question bank →* pick the matching category → select
   all questions → *Add*.
4. Apply the quiz settings from the comment block at the bottom of the file.

Re-importing an edited file: Moodle imports as **new** questions rather than
updating in place. Either delete the old category's questions first, or import
into a fresh category and re-point the quizzes.

## The embedded sims (Class Preps)

Every prep question embeds its day's sim directly in the question text, wrapped
for Moodle:

```html
<div style="width: 800px; max-width: 96vw; margin: 0 0 14px 0;">
  <iframe style="border: 1px solid #ccc; border-radius: 8px; display: block; width: 100%;"
          title="Pendulum sim"
          src="https://hoppese.github.io/Intro-physics-sims/pendulum/index.html"
          width="100%" height="570" allowfullscreen="allowfullscreen"></iframe>
  <p style="font-size: 0.9em; color: #666; margin: 6px 0 0;">Sim not loading?
    <a href="…/index.html" target="_blank" rel="noopener">Open … in a new tab</a>.</p>
</div>
```

- `width: 800px; max-width: 96vw` — fixed width on desktop, shrinks on phones.
- `display: block; width: 100%` on the iframe — fills the wrapper, no inline gap.
- `height: 570` — fits the sim without an inner scrollbar in Moodle's content column.
- Plain-link fallback under each iframe in case frame embedding is blocked.

Sims are served from GitHub Pages (`hoppese.github.io/Intro-physics-sims/<sim>/`).
For iframes to render, Moodle needs *Site admin → Security → HTTP security →
Allow frame embedding* on, and *Enable trusted content* for the question text.
