# Building Moodle quizzes from the command line

`build-quiz.php` turns a question-bank `.xml` file into a ready-to-use quiz
activity on the **local** Moodle (Docker) instance — no clicking through the web
UI. Use it to preview a quiz exactly as students will see it, then export the
`.mbz` and restore it into Earlham Moodle (see the `moodle-local` memory for the
backup/restore workflow).

## What it does

1. Imports every question from the XML, honouring the
   `<question type="category">` marker (so `Kickoffs / KO 5` etc. is created).
2. Creates a quiz activity in the course.
3. Clones **all** quiz settings from a template quiz you name — behaviour
   (deferred feedback), attempts, grading method, review-option timing, page
   layout, shuffle. This is what keeps every quiz consistent without re-entering
   the settings each time.
4. Adds every imported question to the quiz, one page, 1 mark each.
5. Wires up the gradebook item and calendar events.

## Usage

The container is `moodle-local` (`http://localhost:8080`, admin / `Admin-Moodle-1`).
Course 2 = "Intro Physics II". Quiz 1 = "Class Prep X" — a good settings template
(deferred feedback, 2 attempts, specific feedback between attempts, general
feedback + right answer only after close).

```sh
docker cp assessments/kickoffs/ko5.xml            moodle-local:/tmp/q.xml
docker cp assessments/moodle-local/build-quiz.php moodle-local:/tmp/build-quiz.php
docker exec moodle-local php /tmp/build-quiz.php \
    --xml=/tmp/q.xml --course=2 --name="KO 5 — Interference" \
    --template-quiz=1 --section=1 \
    --open="2026-09-07 11:00" --close="2026-09-07 23:59" --grade=2
```

It prints the `view.php?id=…` and `edit.php?cmid=…` URLs. Dates are read in
`--tz` (default `America/New_York`, which the local instance is already set to).

Re-run safe: it refuses if a quiz of that name already exists. To rebuild, delete
the old one first — in the UI, or:

```sh
docker exec moodle-local moosh -n activity-delete <cmid>
```

## Notes / gotchas

- Run as admin is handled inside the script (`\core\session\manager::set_user`);
  the question importer needs the *edit question categories* capability.
- The script creates the `quiz_sections` row by hand — `quiz_add_instance()`
  normally does that, and we bypass it. Without that row the edit-quiz page shows
  an empty question list.
- `--grade` sets the quiz's maximum grade (kickoffs = 2, class preps = 3). The
  per-question marks come from the XML `<defaultgrade>` (1.0 each).
- Question `.xml` edits don't propagate to an already-built quiz — Moodle imports
  are always new questions. Rebuild the quiz after editing the XML.
